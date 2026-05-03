// /api/security-events — admin-only read/manage for the threat event log
// surfaced in Admin → Security → Threat Dashboard.
//
// GET                                 → stats + recent events + autoban
//                                       + currently locked accounts
//                                       + currently banned IPs
// GET ?hours=48&limit=500             → events from the last N hours
// GET ?format=csv                     → CSV download of recent events
// POST { action: "save-autoban",
//        config: {...} }              → update auto-ban + lockout config
// POST { action: "reset" }            → wipe all security events
// POST { action: "ban-ip", ip }       → add an IP to the block list
// POST { action: "unban-ip", ip }     → remove an IP from the block list
// POST { action: "unlock-account",
//        subject }                    → clear the per-email lockout
//                                       (subject = email or "__admin__")
//
// Auth: same Bearer-token check as every other admin endpoint.

import { wrapHandler } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { appendAuditEvent } from "./_lib/audit-log.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { getCloudflareEnv } from "./_lib/context.js";
import {
  getSecurityConfig,
  writeSecurityConfig,
} from "./_lib/security-config.js";
import {
  clearAccountLockout,
  getAccountLockouts,
  getAutobanConfig,
  getRecentEvents,
  getSecurityStats,
  resetSecurityEvents,
  writeAutobanConfig,
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

// Match the same loose v4/v6 shape the IP block-list sanitizer uses so the
// admin can't accidentally inject control characters or arbitrary strings.
const sanitizeIp = (raw) => {
  const ip = String(raw || "")
    .trim()
    .slice(0, 64);
  if (!ip || !/^[0-9a-f.:]+$/i.test(ip)) return "";
  return ip;
};

const sanitizeSubject = (raw) =>
  String(raw || "")
    .trim()
    .slice(0, 80)
    .toLowerCase();

const escapeCsv = (value) => {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const eventsToCsv = (events) => {
  const header = "timestamp,type,ip,country,path,detail,user_agent";
  const rows = events.map((e) =>
    [e.t, e.type, e.ip, e.cc || "", e.path, e.detail, e.ua]
      .map(escapeCsv)
      .join(","),
  );
  return [header, ...rows].join("\n");
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
    const format = url.searchParams.get("format");

    if (format === "csv") {
      const events = await getRecentEvents({ hours, limit: 1000 });
      const csv = eventsToCsv(events);
      const filename = `threat-events-${new Date().toISOString().slice(0, 10)}.csv`;
      return {
        statusCode: 200,
        headers: withSecurityHeaders({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        }),
        body: csv,
      };
    }

    const [stats, events, autoban, lockouts, secCfg] = await Promise.all([
      getSecurityStats(),
      getRecentEvents({ hours, limit }),
      getAutobanConfig(),
      getAccountLockouts(),
      getSecurityConfig(),
    ]);

    return json(200, {
      stats,
      events,
      autoban,
      lockouts,
      bannedIps: secCfg.ipBlockList,
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
        detail:
          `Auto-ban ${saved.enabled ? "on" : "off"} (${saved.threshold}/${saved.windowMinutes}min); ` +
          `Lockout ${saved.lockoutEnabled ? "on" : "off"} (${saved.lockoutThreshold}/${saved.lockoutWindowMinutes}min)`,
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

  if (action === "ban-ip") {
    const ip = sanitizeIp(body.ip);
    if (!ip) return json(400, { error: "Invalid IP" });
    const cfg = await getSecurityConfig();
    if (cfg.ipBlockList.includes(ip)) {
      return json(200, { bannedIps: cfg.ipBlockList, alreadyBanned: true });
    }
    const updated = await writeSecurityConfig({
      ipBlockList: [...cfg.ipBlockList, ip],
    });
    await appendAuditEvent(event, {
      type: "security.ip-block",
      outcome: "added",
      subject: "admin",
      detail: `Manually banned ${ip}`,
      ...meta,
    });
    return json(200, { bannedIps: updated.ipBlockList });
  }

  if (action === "unban-ip") {
    const ip = sanitizeIp(body.ip);
    if (!ip) return json(400, { error: "Invalid IP" });
    const cfg = await getSecurityConfig();
    if (!cfg.ipBlockList.includes(ip)) {
      return json(200, { bannedIps: cfg.ipBlockList, notBanned: true });
    }
    const updated = await writeSecurityConfig({
      ipBlockList: cfg.ipBlockList.filter((entry) => entry !== ip),
    });
    await appendAuditEvent(event, {
      type: "security.ip-block",
      outcome: "removed",
      subject: "admin",
      detail: `Unbanned ${ip}`,
      ...meta,
    });
    return json(200, { bannedIps: updated.ipBlockList });
  }

  if (action === "unlock-account") {
    const subject = sanitizeSubject(body.subject);
    if (!subject) return json(400, { error: "Invalid subject" });
    const ok = await clearAccountLockout(subject);
    await appendAuditEvent(event, {
      type: "security.lockout",
      outcome: ok ? "cleared" : "skipped",
      subject: "admin",
      detail: ok
        ? `Cleared lockout for ${subject}`
        : `SECURITY_EVENTS binding missing; cannot clear ${subject}`,
      ...meta,
    });
    return json(200, { ok, subject });
  }

  return json(400, { error: "Unknown action" });
};

export const onRequest = wrapHandler(handler);
