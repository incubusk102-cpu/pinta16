// Admin 2FA management endpoint.
//
// All actions require a valid admin session token (Bearer header). Adding
// or removing 2FA is a high-trust operation, so we additionally require:
//   - setup-verify     → current TOTP code (proves the authenticator app is paired)
//   - disable          → current password + current TOTP code (or recovery code)
//   - regenerate-recovery → current TOTP code
//
// Audit-logged outcomes:
//   "2fa.setup-verify"     enabled: true
//   "2fa.disabled"
//   "2fa.recovery-regenerated"
//   any *.failure          on bad code / bad password
//
// The /api/admin-auth login endpoint already enforces the second factor at
// login time — see admin-auth.js for that path.

import { wrapHandler } from "./_lib/handler-wrapper.js";
import {
  delete2FA,
  ensureSessionSecret,
  extractToken,
  getAuthStore,
  read2FA,
  readCredentials,
  verifyCredentials,
  verifyTokenWithSecret,
  write2FA,
  MIN_PASSWORD_LENGTH,
} from "./_lib/admin-auth.js";
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  TOTP_ACCOUNT,
  TOTP_ISSUER,
  verifyTotp,
} from "./_lib/totp.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { appendAuditEvent } from "./_lib/audit-log.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";

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

const requireSession = async (event, store) => {
  const secret = await ensureSessionSecret(store);
  const token = extractToken(event);
  if (!token || !(await verifyTokenWithSecret(token, secret))) {
    return null;
  }
  return secret;
};

export const handler = async (event) => {
  try {
    const store = getAuthStore(event);

    // GET: report current 2FA status (does not require a token — but we
    // intentionally don't reveal the secret or recovery codes here).
    if (event.httpMethod === "GET") {
      const record = await read2FA(store);
      return json(200, {
        enabled: Boolean(record?.enabled),
        recoveryCodesRemaining: Array.isArray(record?.recoveryHashes)
          ? record.recoveryHashes.length
          : 0,
        updatedAt: record?.updatedAt || null,
      });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    // All POST actions require an authenticated admin session.
    if (!(await requireSession(event, store))) {
      return json(401, { error: "Not authenticated" });
    }

    const body = parseBody(event.body);
    const action = String(body.action || "");
    const meta = captureRequestMeta(event);

    if (action === "setup-init") {
      // Returns a fresh TOTP secret + recovery codes for the admin to scan.
      // NOT YET PERSISTED: only setup-verify (with a valid code proving the
      // authenticator app is paired) actually enables 2FA. The client must
      // hold the returned secret + recovery codes and pass them back to
      // setup-verify.
      const secret = generateTotpSecret();
      const otpauthUrl = buildOtpAuthUrl({ secret });
      const { plaintext, hashes } = await generateRecoveryCodes();
      return json(200, {
        secret,
        otpauthUrl,
        issuer: TOTP_ISSUER,
        account: TOTP_ACCOUNT,
        recoveryCodes: plaintext,
        // Returned so setup-verify can re-use the same hashes without us
        // having to recompute (each argon2id is ~150ms; doing 10 of them
        // twice would risk hitting the request CPU budget).
        recoveryHashes: hashes,
      });
    }

    if (action === "setup-verify") {
      const secret = String(body.secret || "");
      const code = String(body.code || "");
      const recoveryHashes = Array.isArray(body.recoveryHashes)
        ? body.recoveryHashes
        : null;

      if (!secret || !code || !recoveryHashes) {
        return json(400, { error: "Missing fields" });
      }

      // Rate limit failed attempts so an attacker with a session token still
      // can't brute-force the 6-digit window.
      const limit = await consumeRateLimit(event, {
        bucket: "admin-2fa-setup",
        windowMs: 5 * 60_000,
        max: 10,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

      const ok = await verifyTotp(secret, code);
      if (!ok) {
        await appendAuditEvent(event, {
          type: "admin.2fa",
          outcome: "setup-verify.failure",
          subject: "admin",
          detail: "Code did not match",
          ...meta,
        });
        return json(401, { error: "Code is incorrect" });
      }

      await write2FA(store, {
        enabled: true,
        secret,
        recoveryHashes,
        updatedAt: new Date().toISOString(),
      });

      await appendAuditEvent(event, {
        type: "admin.2fa",
        outcome: "enabled",
        subject: "admin",
        detail: `2FA enabled (${recoveryHashes.length} recovery codes)`,
        ...meta,
      });

      return json(200, { enabled: true });
    }

    if (action === "disable") {
      const password = String(body.password || "");
      const code = String(body.code || "");

      if (password.length < MIN_PASSWORD_LENGTH || !code) {
        return json(400, { error: "Password and current code required" });
      }

      const limit = await consumeRateLimit(event, {
        bucket: "admin-2fa-disable",
        windowMs: 15 * 60_000,
        max: 8,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

      const credentials = await readCredentials(store);
      const record = await read2FA(store);

      if (!record?.enabled) {
        return json(409, { error: "2FA is not enabled" });
      }

      const { ok: passwordOk } = await verifyCredentials(password, credentials);
      const codeOk = await verifyTotp(record.secret, code);

      if (!passwordOk || !codeOk) {
        await appendAuditEvent(event, {
          type: "admin.2fa",
          outcome: "disable.failure",
          subject: "admin",
          detail: !passwordOk ? "Bad password" : "Bad code",
          ...meta,
        });
        return json(401, { error: "Password or code is incorrect" });
      }

      await delete2FA(store);
      await appendAuditEvent(event, {
        type: "admin.2fa",
        outcome: "disabled",
        subject: "admin",
        detail: "2FA disabled",
        ...meta,
      });
      return json(200, { enabled: false });
    }

    if (action === "regenerate-recovery") {
      const code = String(body.code || "");
      if (!code) return json(400, { error: "Current code required" });

      const limit = await consumeRateLimit(event, {
        bucket: "admin-2fa-recovery",
        windowMs: 60 * 60_000,
        max: 5,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

      const record = await read2FA(store);
      if (!record?.enabled) return json(409, { error: "2FA is not enabled" });

      const codeOk = await verifyTotp(record.secret, code);
      if (!codeOk) {
        await appendAuditEvent(event, {
          type: "admin.2fa",
          outcome: "recovery-regenerated.failure",
          subject: "admin",
          detail: "Bad code",
          ...meta,
        });
        return json(401, { error: "Code is incorrect" });
      }

      const { plaintext, hashes } = await generateRecoveryCodes();
      await write2FA(store, {
        ...record,
        recoveryHashes: hashes,
        updatedAt: new Date().toISOString(),
      });
      await appendAuditEvent(event, {
        type: "admin.2fa",
        outcome: "recovery-regenerated",
        subject: "admin",
        detail: `${plaintext.length} new recovery codes`,
        ...meta,
      });
      return json(200, { recoveryCodes: plaintext });
    }

    return json(400, { error: "Unknown action" });
  } catch (error) {
    console.error("admin-2fa handler error:", error);
    const name = error?.name || "Error";
    const message = error?.message || String(error);
    return json(500, {
      error: `Internal error: ${name}: ${message}`,
    });
  }
};

export const onRequest = wrapHandler(handler);
