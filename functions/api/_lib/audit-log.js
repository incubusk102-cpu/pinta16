// Append-only audit log for sensitive admin/customer events. Stored as a
// single JSON array in the AUDIT_LOG KV namespace, capped to MAX_ENTRIES so
// it can't grow unbounded. Surface via /api/admin-auth?action=audit (admin).

import { makeStore } from "./kv-store.js";
import { getCloudflareEnv } from "./context.js";
import { captureRequestMeta } from "./request-info.js";

const KEY = "events";
const MAX_ENTRIES = 500;

const getAuditStore = () => {
  const env = getCloudflareEnv();
  if (!env?.AUDIT_LOG) return null;
  return makeStore(env.AUDIT_LOG);
};

const safeReadEntries = async (store) => {
  try {
    const data = await store.get(KEY, { type: "json" });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const appendAuditEvent = async (event, entry) => {
  if (!entry || typeof entry !== "object") return;
  const store = getAuditStore();
  if (!store) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    let result;
    try {
      result = await store.getWithMetadata(KEY, { type: "json" });
    } catch {
      return;
    }
    const list = Array.isArray(result?.data) ? result.data : [];
    list.unshift({
      at: new Date().toISOString(),
      type: String(entry.type || "event").slice(0, 60),
      outcome: String(entry.outcome || "info").slice(0, 30),
      ip: String(entry.ip || "").slice(0, 64),
      browser: String(entry.browser || "").slice(0, 60),
      os: String(entry.os || "").slice(0, 40),
      device: String(entry.device || "").slice(0, 30),
      userAgent: String(entry.userAgent || "").slice(0, 500),
      subject: String(entry.subject || "").slice(0, 200),
      detail: String(entry.detail || "").slice(0, 400),
    });
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
    try {
      const wrote = await store.setJSON(KEY, list, {
        onlyIfMatch: result?.etag,
      });
      if (wrote && wrote.modified === false) continue;
      return;
    } catch {
      return;
    }
  }
};

export const readAuditEvents = async (event, { limit = 200 } = {}) => {
  const store = getAuditStore();
  if (!store) return [];
  const list = await safeReadEntries(store);
  return list.slice(0, Math.max(1, Math.min(MAX_ENTRIES, limit)));
};

// Read paginated audit events with optional client-side filters. Used by
// the admin "PII access" panel and the per-customer access-history link.
// `before` is an ISO timestamp; entries strictly older than it are returned.
// Filters (type / subject / outcome) are matched as case-insensitive
// substrings so callers can pass partial values (e.g. type="pii.").
export const readAuditEventsPaginated = async (
  event,
  { limit = 100, before = "", type = "", subject = "", outcome = "" } = {},
) => {
  const store = getAuditStore();
  if (!store) return { events: [], hasMore: false };
  const all = await safeReadEntries(store);
  const cap = Math.max(1, Math.min(MAX_ENTRIES, Number(limit) || 100));
  const t = String(type || "")
    .trim()
    .toLowerCase();
  const s = String(subject || "")
    .trim()
    .toLowerCase();
  const o = String(outcome || "")
    .trim()
    .toLowerCase();
  const beforeTs = before ? Date.parse(before) : NaN;
  const filtered = [];
  for (const entry of all) {
    if (!entry || typeof entry !== "object") continue;
    if (Number.isFinite(beforeTs)) {
      const at = Date.parse(entry.at || "");
      if (!Number.isFinite(at) || at >= beforeTs) continue;
    }
    if (
      t &&
      !String(entry.type || "")
        .toLowerCase()
        .includes(t)
    )
      continue;
    if (
      s &&
      !String(entry.subject || "")
        .toLowerCase()
        .includes(s)
    )
      continue;
    if (
      o &&
      !String(entry.outcome || "")
        .toLowerCase()
        .includes(o)
    )
      continue;
    filtered.push(entry);
    if (filtered.length >= cap + 1) break;
  }
  const hasMore = filtered.length > cap;
  return { events: filtered.slice(0, cap), hasMore };
};

// Convenience wrapper for "an admin just accessed PII" — captures IP / UA
// and writes a structured event. `resource` and `action` form the type
// (e.g. resource="customer", action="view" → type="pii.customer.view").
// `target` lands in `subject` so the per-customer access-history filter
// can match by email or id. `detail` is a short human-readable note
// (truncated to 400 chars by the underlying helper).
export const recordPiiAccess = async (
  event,
  { resource, action, target = "", detail = "" } = {},
) => {
  if (!resource || !action) return;
  const meta = captureRequestMeta(event);
  await appendAuditEvent(event, {
    type: `pii.${String(resource)}.${String(action)}`,
    outcome: String(action),
    subject: String(target || ""),
    detail: String(detail || ""),
    ip: meta.ip,
    userAgent: meta.userAgent,
    browser: meta.browser,
    os: meta.os,
    device: meta.device,
  });
};
