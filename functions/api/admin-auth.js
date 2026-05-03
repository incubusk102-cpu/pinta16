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
      await appendAuditEvent(event, {
        type: "admin.login",
        outcome: matchesRecovery ? "recovery" : "success",
        subject: "admin",
        detail: matchesRecovery ? "Recovery password used" : "Password OK",
        ...meta,
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

    return json(400, { error: "Unknown action" });
  } catch (error) {
    console.error("admin-auth handler error:", error);
    return json(500, {
      error: "Internal error",
    });
  }
};

export const onRequest = wrapHandler(handler);
