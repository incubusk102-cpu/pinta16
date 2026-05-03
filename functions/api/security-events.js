// /api/security-events — admin-only read/manage for the threat event log
// surfaced in Admin → Security → Threat Dashboard.
//
// GET                                → stats + recent events
// GET ?hours=48&limit=500            → events from last N hours
// POST { action: "save-autoban",
//        config: {...} }             → update auto-ban configuration
// POST { action: "reset" }           → wipe all security events
//
// Auth: same Bearer-token check as every other admin endpoint.

import { wrapHandler } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { appendAuditEvent } from "./_lib/audit-log.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { getCloudflareEnv } from "./_lib/context.js";
import {
  getSecurityStats,
  getRecentEvents,
  getAutobanConfig,
  writeAutobanConfig,
  resetSecurityEvents,
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
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  if (event.httpMethod === "GET") {
    const url = new URL(
      event.rawUrl || `https://localhost${event.path || "/"}`,
    );
    const hours = Math.max(
      1,
      Math.min(168, Number(url.searchParams.get("hours")) || 24),
    );
    const limit = Math.max(
      1,
      Math.min(1000, Number(url.searchParams.get("limit")) || 300),
    );

    const [stats, events, autoban] = await Promise.all([
      getSecurityStats(),
      getRecentEvents({ hours, limit }),
      getAutobanConfig(),
    ]);

    return json(200, {
      stats,
      events,
      autoban,
      hours,
      bound: Boolean(getCloudflareEnv()?.SECURITY_EVENTS),
    });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const body = parseBody(event.body);
  const action = body.action;
  const meta = captureRequestMeta(event);

  if (action === "save-autoban") {
    try {
      const saved = await writeAutobanConfig(body.config || {});
      await appendAuditEvent(event, {
        type: "security.autoban",
        outcome: "updated",
        subject: "admin",
        detail: `Auto-ban ${saved.enabled ? "enabled" : "disabled"}: ${saved.threshold} events in ${saved.windowMinutes}min`,
        ...meta,
      });
      return json(200, { autoban: saved });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(500, { error: message });
    }
  }

  if (action === "reset") {
    const result = await resetSecurityEvents();
    await appendAuditEvent(event, {
      type: "security.events",
      outcome: "reset",
      subject: "admin",
      detail: result.skipped
        ? "SECURITY_EVENTS binding missing; nothing to reset"
        : `Cleared ${result.deleted} event key(s)`,
      ...meta,
    });
    return json(200, result);
  }

  return json(400, { error: "Unknown action" });
};

export const onRequest = wrapHandler(handler);
