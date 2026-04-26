// Append-only audit log for sensitive admin/customer events. Stored as a
// single JSON array in Netlify Blobs, capped to MAX_ENTRIES so it can't grow
// unbounded. Surface via /api/admin-auth?action=audit (admin-only).

import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "audit-log";
const KEY = "events";
const MAX_ENTRIES = 500;

const getAuditStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
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
  let store;
  try {
    store = getAuditStore(event);
  } catch {
    return;
  }
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
  let store;
  try {
    store = getAuditStore(event);
  } catch {
    return [];
  }
  const list = await safeReadEntries(store);
  return list.slice(0, Math.max(1, Math.min(MAX_ENTRIES, limit)));
};
