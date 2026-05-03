import { wrapHandler } from "./_lib/handler-wrapper.js";
import {
  constantTimeEquals,
  ensureSessionSecret,
  extractToken,
  getAuthStore,
  hashPassword,
  is2FAEnabled,
  issueToken,
  MIN_PASSWORD_LENGTH,
  read2FA,
  readCredentials,
  rotateSessionSecret,
  verifyCredentials,
  verifyTokenWithSecret,
  write2FA,
  writeCredentials,
  writeCredentialsIfNew,
} from "./_lib/admin-auth.js";
import { verifyRecoveryCode, verifyTotp } from "./_lib/totp.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { appendAuditEvent, readAuditEvents } from "./_lib/audit-log.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { verifyTurnstileToken } from "./_lib/turnstile.js";

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

const recoveryBypassesTwoFactor = () =>
  String(process.env.ADMIN_RECOVERY_BYPASS_2FA || "")
    .trim()
    .toLowerCase() === "1" ||
  String(process.env.ADMIN_RECOVERY_BYPASS_2FA || "")
    .trim()
    .toLowerCase() === "true";

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
      const twoFactorEnabled = await is2FAEnabled(store);
      return json(200, {
        initialized: Boolean(credentials),
        twoFactorEnabled,
      });
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

      const record = await hashPassword(password);
      const written = await writeCredentialsIfNew(store, {
        ...record,
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
      if (!credentials) {
        return json(404, { error: "Admin password not set" });
      }
      const password = String(body.password || "");
      const recoveryPassword = (
        process.env.ADMIN_RECOVERY_PASSWORD || ""
      ).trim();

      const { ok: matchesStored, needsRehash } = await verifyCredentials(
        password,
        credentials,
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
        return json(401, { error: "Incorrect password" });
      }

      // Transparent argon2id upgrade for legacy PBKDF2 records — only on a
      // real-password match (recovery passwords don't migrate).
      if (matchesStored && needsRehash) {
        try {
          const newRecord = await hashPassword(password);
          await writeCredentials(store, {
            ...newRecord,
            updatedAt: new Date().toISOString(),
          });
          await appendAuditEvent(event, {
            type: "admin.password",
            outcome: "rehashed",
            subject: "admin",
            detail: "PBKDF2 → argon2id upgrade on login",
            ...meta,
          });
        } catch (err) {
          // Don't fail login if rehash write fails — log and continue.
          console.error("admin-auth: argon2id rehash failed", err);
        }
      }

      // 2FA gate. Recovery password bypasses 2FA only if explicitly opted in
      // via env var (default off, so a leaked recovery password alone can't
      // walk past 2FA).
      const twofa = await read2FA(store);
      const twoFactorRequired =
        Boolean(twofa?.enabled) &&
        !(matchesRecovery && recoveryBypassesTwoFactor());

      if (twoFactorRequired) {
        const code = String(body.code || "").trim();
        const recoveryCode = String(body.recoveryCode || "").trim();

        if (!code && !recoveryCode) {
          // Don't burn the rate limit slot we already consumed — but signal
          // to the client that it should prompt for a 2FA code.
          return json(401, {
            error: "Two-factor authentication is enabled",
            requires2FA: true,
          });
        }

        if (recoveryCode) {
          const matchedIndex = await verifyRecoveryCode(
            recoveryCode,
            twofa.recoveryHashes || [],
          );
          if (matchedIndex < 0) {
            await appendAuditEvent(event, {
              type: "admin.login",
              outcome: "2fa.failure",
              subject: "admin",
              detail: "Recovery code did not match",
              ...meta,
            });
            return json(401, {
              error: "Recovery code is incorrect",
              requires2FA: true,
            });
          }
          // Single-use: drop the matched hash.
          const remainingHashes = (twofa.recoveryHashes || []).filter(
            (_, i) => i !== matchedIndex,
          );
          try {
            await write2FA(store, {
              ...twofa,
              recoveryHashes: remainingHashes,
              updatedAt: new Date().toISOString(),
            });
          } catch (err) {
            console.error("admin-auth: recovery code consume failed", err);
          }
          await appendAuditEvent(event, {
            type: "admin.login",
            outcome: "2fa.recovery",
            subject: "admin",
            detail: `Recovery code used (${remainingHashes.length} remaining)`,
            ...meta,
          });
        } else {
          const codeOk = await verifyTotp(twofa.secret, code);
          if (!codeOk) {
            await appendAuditEvent(event, {
              type: "admin.login",
              outcome: "2fa.failure",
              subject: "admin",
              detail: "TOTP code did not match",
              ...meta,
            });
            return json(401, {
              error: "Code is incorrect",
              requires2FA: true,
            });
          }
        }
      }

      await appendAuditEvent(event, {
        type: "admin.login",
        outcome: matchesRecovery ? "recovery" : "success",
        subject: "admin",
        detail:
          (matchesRecovery ? "Recovery password used" : "Password OK") +
          (twoFactorRequired ? " + 2FA verified" : ""),
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
      const { ok: currentMatchesStored } = await verifyCredentials(
        currentPassword,
        credentials,
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

      const record = await hashPassword(newPassword);
      await writeCredentials(store, {
        ...record,
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
    const name = error?.name || "Error";
    const message = error?.message || String(error);
    const stackLine = (error?.stack || "")
      .split("\n")
      .slice(1, 3)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" | ");
    return json(500, {
      error: `Internal error: ${name}: ${message}${stackLine ? ` @ ${stackLine}` : ""}`,
      _debug: {
        message,
        name,
        stack: (error?.stack || "").split("\n").slice(0, 6).join("\n"),
      },
    });
  }
};

export const onRequest = wrapHandler(handler);
