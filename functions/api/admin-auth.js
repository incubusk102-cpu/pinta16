import { autobanIfNeeded, wrapHandler } from "./_lib/handler-wrapper.js";
import {
  constantTimeEquals,
  ensureSessionSecret,
  extractToken,
  getAuthStore,
  hashPassword,
  issueToken,
  MIN_PASSWORD_LENGTH,
  readCredentials,
  rotateSessionSecret,
  verifyPassword,
  verifyTokenWithSecret,
  writeCredentials,
  writeCredentialsIfNew,
} from "./_lib/admin-auth.js";
import {
  captureRequestMeta,
  getClientCountry,
  getClientIp,
  getUserAgent,
} from "./_lib/request-info.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { appendAuditEvent, readAuditEvents } from "./_lib/audit-log.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { verifyTurnstileToken } from "./_lib/turnstile.js";
import {
  ADMIN_LOCKOUT_SUBJECT,
  isAccountLocked,
  logSecurityEvent,
  recordAuthFailure,
} from "./_lib/security-events.js";
import {
  deleteTotpRecord,
  issueChallengeToken,
  readTotpRecord,
  requires2FA,
  startTotpSetup,
  verifyChallengeToken,
  writeTotpRecord,
} from "./_lib/admin-2fa.js";
import { findRecoveryCodeIndex, verifyTotpCode } from "./_lib/totp.js";
import { getSecurityConfig } from "./_lib/security-config.js";
import { sendAdminLoginAlert } from "./_lib/admin-alerts.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

export const handler = async (event) => {
  try {
    const store = getAuthStore(event);

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      if (params.action === "audit") {
        const secret = await ensureSessionSecret(store);
        const token = extractToken(event);
        if (!token || !(await verifyTokenWithSecret(token, secret))) {
          return json(401, { error: "Not authenticated" });
        }
        const limit = Math.max(1, Math.min(500, Number(params.limit) || 200));
        const events = await readAuditEvents(event, { limit });
        return json(200, { events });
      }
      if (params.action === "2fa-status") {
        const secret = await ensureSessionSecret(store);
        const token = extractToken(event);
        if (!token || !(await verifyTokenWithSecret(token, secret))) {
          return json(401, { error: "Not authenticated" });
        }
        const totp = await readTotpRecord(store);
        return json(200, {
          enabled: Boolean(totp?.enabled),
          recoveryCodesRemaining: totp?.recoveryHashes?.length ?? 0,
          enabledAt: totp?.enabledAt ?? null,
        });
      }
      const credentials = await readCredentials(store);
      return json(200, { initialized: Boolean(credentials) });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = parseBody(event.body);
    const action = body.action;
    const credentials = await readCredentials(store);
    const secret = await ensureSessionSecret(store);

    if (action === "init") {
      if (credentials) {
        return json(409, { error: "Admin password already set" });
      }
      const password = String(body.password || "");
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json(400, {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }
      const ts = await verifyTurnstileToken(event, {
        token: String(body.turnstileToken || ""),
      });
      if (!ts.allowed) {
        return json(400, {
          error: "Verification failed. Please refresh and try again.",
        });
      }

      const { salt, hash } = await hashPassword(password);
      const written = await writeCredentialsIfNew(store, {
        salt,
        hash,
        updatedAt: new Date().toISOString(),
      });
      if (!written) {
        return json(409, { error: "Admin password already set" });
      }

      return json(200, { token: await issueToken(secret) });
    }

    if (action === "login") {
      const limit = await consumeRateLimit(event, {
        bucket: "admin-login",
        windowMs: 15 * 60_000,
        max: 8,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
      // Verify Turnstile token (when configured) before any password
      // comparison, so a bot that spams the login endpoint doesn't even
      // get to exercise the slow constant-time compare. Falls open if
      // TURNSTILE_SECRET_KEY isn't set.
      const ts = await verifyTurnstileToken(event, {
        token: String(body.turnstileToken || ""),
      });
      if (!ts.allowed) {
        return json(400, {
          error: "Verification failed. Please refresh and try again.",
        });
      }
      const meta = captureRequestMeta(event);
      const ip = getClientIp(event);
      const country = getClientCountry(event);
      const ua = getUserAgent(event);

      // Per-account brute-force lockout. We check this *before* the
      // password compare so credential stuffing can't keep guessing
      // against the admin account regardless of source IP. The error is
      // intentionally generic so an attacker can't tell whether they hit
      // the lockout or just got the wrong password.
      if (await isAccountLocked(ADMIN_LOCKOUT_SUBJECT)) {
        void logSecurityEvent({
          type: "account-locked",
          ip,
          country,
          path: "/api/admin-auth",
          detail: "Admin login blocked by lockout",
          userAgent: ua,
        });
        await appendAuditEvent(event, {
          type: "admin.login",
          outcome: "failure",
          subject: "admin",
          detail: "Locked: too many recent failures",
          ...meta,
        });
        return json(401, { error: "Incorrect password" });
      }

      // Country allow-list. When configured, admin logins from anywhere
      // outside the list are rejected with the same generic error so an
      // attacker can't probe for the list. Empty list = allow all (the
      // pre-allowlist behaviour, no opt-in tax).
      const secCfg = await getSecurityConfig();
      const allowList = Array.isArray(secCfg.adminCountryAllowlist)
        ? secCfg.adminCountryAllowlist
        : [];
      if (allowList.length > 0) {
        const cc = String(country || "").toUpperCase();
        if (!cc || !allowList.includes(cc)) {
          void logSecurityEvent({
            type: "country-blocked",
            ip,
            country,
            path: "/api/admin-auth",
            detail: `Admin login blocked: country ${cc || "?"} not in allow-list`,
            userAgent: ua,
          });
          await appendAuditEvent(event, {
            type: "admin.login",
            outcome: "failure",
            subject: "admin",
            detail: "Country not allowed",
            ...meta,
          });
          void autobanIfNeeded(ip);
          return json(401, { error: "Incorrect password" });
        }
      }

      if (!credentials) {
        return json(404, { error: "Admin password not set" });
      }
      const password = String(body.password || "");
      const recoveryPassword = (
        process.env.ADMIN_RECOVERY_PASSWORD || ""
      ).trim();
      const matchesStored = await verifyPassword(
        password,
        credentials.salt,
        credentials.hash,
      );
      const matchesRecovery =
        recoveryPassword.length >= MIN_PASSWORD_LENGTH &&
        (await constantTimeEquals(password, recoveryPassword));
      if (!matchesStored && !matchesRecovery) {
        await appendAuditEvent(event, {
          type: "admin.login",
          outcome: "failure",
          subject: "admin",
          detail: "Incorrect password",
          ...meta,
        });
        // Surface to the threat dashboard and feed the auto-ban counter
        // so a script attacking admin from one IP gets banned by the IP
        // path *and* the password-fail path independently.
        void logSecurityEvent({
          type: "auth-failed",
          ip,
          country,
          path: "/api/admin-auth",
          detail: "Admin password incorrect",
          userAgent: ua,
        });
        void recordAuthFailure(ADMIN_LOCKOUT_SUBJECT);
        void autobanIfNeeded(ip);
        return json(401, { error: "Incorrect password" });
      }

      // Password is correct. If 2FA is enabled, hand back a short-lived
      // challenge token instead of a session token; the client must POST
      // {action:"login-2fa", challengeToken, code} to actually sign in.
      const totp = await readTotpRecord(store);
      if (requires2FA(totp)) {
        const challengeToken = await issueChallengeToken(secret);
        await appendAuditEvent(event, {
          type: "admin.login",
          outcome: "challenge",
          subject: "admin",
          detail: "Password OK; awaiting 2FA",
          ...meta,
        });
        return json(200, {
          requires2fa: true,
          challengeToken,
          recoveryAvailable: totp.recoveryHashes.length > 0,
        });
      }

      await appendAuditEvent(event, {
        type: "admin.login",
        outcome: matchesRecovery ? "recovery" : "success",
        subject: "admin",
        detail: matchesRecovery ? "Recovery password used" : "Password OK",
        ...meta,
      });
      void sendAdminLoginAlert({
        ip,
        country,
        userAgent: ua,
        outcome: matchesRecovery ? "recovery" : "success",
        detail: matchesRecovery ? "Recovery password used" : "",
      });
      return json(200, { token: await issueToken(secret) });
    }

    if (action === "login-2fa") {
      const meta = captureRequestMeta(event);
      const ip = getClientIp(event);
      const country = getClientCountry(event);
      const ua = getUserAgent(event);

      const limit = await consumeRateLimit(event, {
        bucket: "admin-login",
        windowMs: 15 * 60_000,
        max: 8,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

      if (await isAccountLocked(ADMIN_LOCKOUT_SUBJECT)) {
        void logSecurityEvent({
          type: "account-locked",
          ip,
          country,
          path: "/api/admin-auth",
          detail: "Admin 2FA blocked by lockout",
          userAgent: ua,
        });
        return json(401, { error: "Incorrect password" });
      }

      const challengeToken = String(body.challengeToken || "");
      const code = String(body.code || "").trim();
      if (!challengeToken || !code) {
        return json(400, { error: "Incorrect password" });
      }
      if (!(await verifyChallengeToken(challengeToken, secret))) {
        // Either expired or forged. Force the user to start over.
        return json(401, { error: "Session expired. Please log in again." });
      }
      const totp = await readTotpRecord(store);
      if (!requires2FA(totp)) {
        // 2FA was disabled in flight (admin nuked it from another tab).
        // Don't leak that: behave like a generic auth failure.
        return json(401, { error: "Incorrect password" });
      }

      let outcome = "";
      if (await verifyTotpCode(totp.secret, code)) {
        outcome = "totp";
      } else {
        const idx = await findRecoveryCodeIndex(code, totp.recoveryHashes);
        if (idx >= 0) {
          // Single-use: remove the matched hash before issuing the token.
          const remaining = totp.recoveryHashes.slice();
          remaining.splice(idx, 1);
          await writeTotpRecord(store, { ...totp, recoveryHashes: remaining });
          outcome = "recovery";
        }
      }

      if (!outcome) {
        await appendAuditEvent(event, {
          type: "admin.login",
          outcome: "failure",
          subject: "admin",
          detail: "Incorrect 2FA code",
          ...meta,
        });
        void logSecurityEvent({
          type: "auth-failed",
          ip,
          country,
          path: "/api/admin-auth",
          detail: "Admin 2FA code incorrect",
          userAgent: ua,
        });
        void recordAuthFailure(ADMIN_LOCKOUT_SUBJECT);
        void autobanIfNeeded(ip);
        return json(401, { error: "Incorrect password" });
      }

      await appendAuditEvent(event, {
        type: "admin.login",
        outcome: outcome === "recovery" ? "recovery-code" : "success",
        subject: "admin",
        detail:
          outcome === "recovery"
            ? "2FA recovery code used"
            : "Password + TOTP OK",
        ...meta,
      });
      void sendAdminLoginAlert({
        ip,
        country,
        userAgent: ua,
        outcome: outcome === "recovery" ? "recovery-code" : "success",
        detail: outcome === "recovery" ? "Used a 2FA recovery code" : "",
      });
      return json(200, { token: await issueToken(secret) });
    }

    if (action === "change") {
      if (!credentials) {
        return json(404, { error: "Admin password not set" });
      }
      const token = extractToken(event);
      if (!token || !(await verifyTokenWithSecret(token, secret))) {
        return json(401, { error: "Not authenticated" });
      }
      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");
      const recoveryPw = (process.env.ADMIN_RECOVERY_PASSWORD || "").trim();
      const currentMatchesStored = await verifyPassword(
        currentPassword,
        credentials.salt,
        credentials.hash,
      );
      const currentMatchesRecovery =
        recoveryPw.length >= MIN_PASSWORD_LENGTH &&
        (await constantTimeEquals(currentPassword, recoveryPw));
      if (!currentMatchesStored && !currentMatchesRecovery) {
        return json(401, { error: "Current password is incorrect" });
      }
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return json(400, {
          error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }

      const { salt, hash } = await hashPassword(newPassword);
      await writeCredentials(store, {
        salt,
        hash,
        updatedAt: new Date().toISOString(),
      });
      const newSecret = await rotateSessionSecret(store);
      await appendAuditEvent(event, {
        type: "admin.password",
        outcome: "changed",
        subject: "admin",
        detail: "Password updated, session secret rotated",
        ...captureRequestMeta(event),
      });
      return json(200, { token: await issueToken(newSecret) });
    }

    if (action === "setup-2fa") {
      // Authenticated: generate a fresh secret + recovery codes and stash
      // them with `enabled: false`. The admin scans the QR / pastes the
      // URI into their authenticator, then proves possession via
      // `verify-2fa`. We do NOT mark 2FA enabled until verify succeeds —
      // otherwise a typo'd QR would lock the admin out of their own site.
      const token = extractToken(event);
      if (!token || !(await verifyTokenWithSecret(token, secret))) {
        return json(401, { error: "Not authenticated" });
      }
      const meta = captureRequestMeta(event);
      const setup = await startTotpSetup(store);
      await appendAuditEvent(event, {
        type: "admin.2fa",
        outcome: "setup-started",
        subject: "admin",
        detail: "Generated fresh TOTP secret + recovery codes",
        ...meta,
      });
      return json(200, {
        secret: setup.secret,
        uri: setup.uri,
        // Plain-text recovery codes are returned exactly once and are NOT
        // stored anywhere except the user's clipboard / printout. The
        // server stores SHA-256 hashes only.
        recoveryCodes: setup.recoveryCodes,
      });
    }

    if (action === "verify-2fa") {
      const token = extractToken(event);
      if (!token || !(await verifyTokenWithSecret(token, secret))) {
        return json(401, { error: "Not authenticated" });
      }
      const code = String(body.code || "").trim();
      const totp = await readTotpRecord(store);
      if (!totp || !totp.secret) {
        return json(400, { error: "Run setup-2fa first" });
      }
      if (!(await verifyTotpCode(totp.secret, code))) {
        return json(401, { error: "Incorrect code" });
      }
      await writeTotpRecord(store, {
        ...totp,
        enabled: true,
        enabledAt: new Date().toISOString(),
      });
      await appendAuditEvent(event, {
        type: "admin.2fa",
        outcome: "enabled",
        subject: "admin",
        detail: "TOTP enabled",
        ...captureRequestMeta(event),
      });
      return json(200, { ok: true });
    }

    if (action === "disable-2fa") {
      // Disabling 2FA requires both the session token AND the current
      // password. This stops a stolen session token from silently turning
      // off 2FA without the admin noticing.
      const token = extractToken(event);
      if (!token || !(await verifyTokenWithSecret(token, secret))) {
        return json(401, { error: "Not authenticated" });
      }
      if (!credentials) return json(404, { error: "Admin password not set" });
      const password = String(body.password || "");
      const recoveryPassword = (
        process.env.ADMIN_RECOVERY_PASSWORD || ""
      ).trim();
      const matchesStored = await verifyPassword(
        password,
        credentials.salt,
        credentials.hash,
      );
      const matchesRecovery =
        recoveryPassword.length >= MIN_PASSWORD_LENGTH &&
        (await constantTimeEquals(password, recoveryPassword));
      if (!matchesStored && !matchesRecovery) {
        return json(401, { error: "Incorrect password" });
      }
      await deleteTotpRecord(store);
      await appendAuditEvent(event, {
        type: "admin.2fa",
        outcome: "disabled",
        subject: "admin",
        detail: "TOTP disabled",
        ...captureRequestMeta(event),
      });
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (error) {
    console.error("admin-auth handler error:", error);
    return json(500, {
      error: "Internal error",
    });
  }
};

export const onRequest = wrapHandler(handler);
