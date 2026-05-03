// /api/security-config — admin-only CRUD for the live-tunable security knobs
// surfaced in Admin → Security.
//
// GET                       → current resolved config + defaults + bucket
//                             list, so the panel can render input rows that
//                             know their own "default" value.
// POST { action: "save",
//        config: {...} }     → merge + persist (sanitized in
//                             security-config.js).
// POST { action: "reset" }   → wipe every key in the RATE_LIMITS namespace,
//                             unblocking everyone (including the admin who
//                             just locked themselves out tuning).
//
// Auth: same Bearer-token check as every other admin endpoint. Audit-logs
// every save and every reset so an admin can answer "who changed this?".

import { wrapHandler } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { appendAuditEvent } from "./_lib/audit-log.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { getCloudflareEnv } from "./_lib/context.js";
import {
  BODY_BYTES_MAX,
  BODY_BYTES_MIN,
  DEFAULT_RATE_LIMITS,
  TURNSTILE_MODES,
  defaults,
  getSecurityConfig,
  invalidateSecurityConfigCache,
  resetRateLimitCounters,
  writeSecurityConfig,
} from "./_lib/security-config.js";

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
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  if (event.httpMethod === "GET") {
    const config = await getSecurityConfig();
    const env = getCloudflareEnv();
    return json(200, {
      config,
      defaults: defaults(),
      buckets: Object.keys(DEFAULT_RATE_LIMITS),
      turnstileModes: TURNSTILE_MODES,
      bodyBytesMin: BODY_BYTES_MIN,
      bodyBytesMax: BODY_BYTES_MAX,
      // Surface whether the SECURITY_CONFIG KV binding is wired up so the
      // panel can render a "create the namespace before saving" hint
      // instead of letting the admin click Save and get a 500. Also
      // report whether TURNSTILE_SECRET_KEY is configured so the
      // Turnstile mode picker can warn that "off" is the de-facto state
      // until the secret lands.
      bound: Boolean(env?.SECURITY_CONFIG),
      turnstileConfigured: Boolean(
        (env?.TURNSTILE_SECRET_KEY || "").trim() ||
        (typeof process !== "undefined" &&
          (process.env?.TURNSTILE_SECRET_KEY || "").trim()),
      ),
    });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const body = parseBody(event.body);
  const action = body.action;
  const meta = captureRequestMeta(event);

  if (action === "save") {
    try {
      const saved = await writeSecurityConfig(body.config || {});
      await appendAuditEvent(event, {
        type: "security.config",
        outcome: "updated",
        subject: "admin",
        detail: `Turnstile=${saved.turnstileMode}; cap=${saved.maxBodyBytes}; IPs=${saved.ipBlockList.length}; rateOverrides=${Object.keys(saved.rateLimits).length}; countries=${saved.adminCountryAllowlist.length}; alert=${saved.loginAlertEnabled ? "on" : "off"}`,
        ...meta,
      });
      return json(200, { config: saved });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(500, { error: message });
    }
  }

  if (action === "reset-rate-limits") {
    const result = await resetRateLimitCounters();
    await appendAuditEvent(event, {
      type: "security.rate-limits",
      outcome: "reset",
      subject: "admin",
      detail: result.skipped
        ? "RATE_LIMITS binding missing; nothing to reset"
        : `Cleared ${result.deleted} counter key(s)`,
      ...meta,
    });
    return json(200, result);
  }

  if (action === "invalidate-cache") {
    invalidateSecurityConfigCache();
    return json(200, { invalidated: true });
  }

  return json(400, { error: "Unknown action" });
};

export const onRequest = wrapHandler(handler);
