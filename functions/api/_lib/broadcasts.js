// Shared helpers for /admin → Broadcasts (newsletter blasts).
//
// Storage model — everything lives in the existing NEWSLETTER KV
// namespace so deploying this feature does not require provisioning a
// new namespace in the Cloudflare dashboard. Keys are namespaced under
// the `broadcasts:` prefix:
//
//   broadcasts:index           Ordered array of metadata
//                              [{ id, status, subject, audience,
//                                 recipientCount, createdAt, sentAt? }]
//                              Newest first. Capped at 200 entries.
//
//   broadcasts:<id>            Full broadcast document
//                              { id, status, subject, heading, bodyText,
//                                ctaLabel, ctaUrl, audience, fromName?,
//                                createdAt, updatedAt, sentAt?,
//                                createdBy?: email,
//                                recipientCount?, sentCount?,
//                                failedCount? }
//
//   broadcasts:<id>:stats      Tracking stats
//                              { opens: { <recipientHash>: <ISO> },
//                                clicks: { <recipientHash>:
//                                          [{ url, ts }] },
//                                openTotal, clickTotal,
//                                uniqueOpens, uniqueClicks }
//
// We deliberately keep broadcasts + stats in two keys so that high-
// frequency open/click writes don't have to read or rewrite the full
// (potentially large) broadcast body. KV doesn't do partial updates
// either way, but splitting keeps the hot key small.
//
// Audience strings:
//   "all"                  Newsletter subscribers + all customers (deduped)
//   "subscribers"          NEWSLETTER subscribers only
//   "customers"            All customers with any order
//   "customers:vip"        Customers in the `vip` segment
//   "customers:repeat"     Customers in the `repeat` segment
//   "customers:one_time"   One-time buyers
//   "customers:at_risk"    Lapsed (60+ days since last order)
//   "customers:lead"       Registered, no orders yet

import { getStore } from "./kv-stores.js";

// Mirror the customer segmentation thresholds from functions/api/customers.js
// so the broadcasts audience picker pulls the same buckets the admin sees
// in the Customers panel. Keep these in sync if customers.js ever changes
// its thresholds.
const SEGMENT_VIP_MIN_LTV = 10000;
const SEGMENT_REPEAT_MIN_ORDERS = 2;
const SEGMENT_AT_RISK_DAYS = 60;

const INDEX_KEY = "broadcasts:index";
const MAX_INDEX_ENTRIES = 200;

const docKey = (id) => `broadcasts:${id}`;
const statsKey = (id) => `broadcasts:${id}:stats`;

const newsletterStore = () => getStore("newsletter");

// Compact 16-char id so URLs in tracking links stay short. Uses the
// Web Crypto API available in Workers.
export const newBroadcastId = () => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

// Read-helpers ---------------------------------------------------------

export const readIndex = async () => {
  const store = newsletterStore();
  const v = await store.get(INDEX_KEY, { type: "json" });
  return Array.isArray(v) ? v : [];
};

export const readBroadcast = async (id) => {
  if (!id) return null;
  const store = newsletterStore();
  return await store.get(docKey(id), { type: "json" });
};

export const readStats = async (id) => {
  if (!id) return null;
  const store = newsletterStore();
  const v = await store.get(statsKey(id), { type: "json" });
  if (!v || typeof v !== "object") return null;
  return v;
};

// Write-helpers --------------------------------------------------------

const indexEntry = (b) => ({
  id: b.id,
  subject: b.subject || "",
  audience: b.audience || "subscribers",
  status: b.status || "draft",
  createdAt: b.createdAt || "",
  sentAt: b.sentAt || null,
  recipientCount: b.recipientCount || 0,
  sentCount: b.sentCount || 0,
  failedCount: b.failedCount || 0,
});

const writeIndex = async (entries) => {
  const store = newsletterStore();
  const trimmed = entries.slice(0, MAX_INDEX_ENTRIES);
  await store.set(INDEX_KEY, JSON.stringify(trimmed));
};

export const upsertBroadcast = async (broadcast) => {
  const store = newsletterStore();
  await store.set(docKey(broadcast.id), JSON.stringify(broadcast));
  const index = await readIndex();
  const next = [
    indexEntry(broadcast),
    ...index.filter((e) => e.id !== broadcast.id),
  ];
  await writeIndex(next);
};

export const deleteBroadcast = async (id) => {
  if (!id) return;
  const store = newsletterStore();
  await store.delete(docKey(id));
  await store.delete(statsKey(id));
  const index = await readIndex();
  await writeIndex(index.filter((e) => e.id !== id));
};

export const recordSendResult = async (id, { sent, failed, recipients }) => {
  const broadcast = await readBroadcast(id);
  if (!broadcast) return null;
  const updated = {
    ...broadcast,
    status: "sent",
    sentAt: broadcast.sentAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recipientCount: recipients,
    sentCount: sent,
    failedCount: failed,
  };
  await upsertBroadcast(updated);
  return updated;
};

// Tracking writes ------------------------------------------------------

export const recordOpen = async (id, recipientHash) => {
  if (!id || !recipientHash) return;
  const store = newsletterStore();
  const existing = (await store.get(statsKey(id), { type: "json" })) || {};
  const opens =
    existing.opens && typeof existing.opens === "object" ? existing.opens : {};
  const isNewUnique = !(recipientHash in opens);
  opens[recipientHash] = new Date().toISOString();
  const next = {
    ...existing,
    opens,
    openTotal: Number(existing.openTotal || 0) + 1,
    uniqueOpens: isNewUnique
      ? Number(existing.uniqueOpens || 0) + 1
      : Number(existing.uniqueOpens || 0),
  };
  await store.set(statsKey(id), JSON.stringify(next));
};

export const recordClick = async (id, recipientHash, url) => {
  if (!id || !recipientHash || !url) return;
  const store = newsletterStore();
  const existing = (await store.get(statsKey(id), { type: "json" })) || {};
  const clicks =
    existing.clicks && typeof existing.clicks === "object"
      ? existing.clicks
      : {};
  const isNewUnique = !(recipientHash in clicks);
  const list = Array.isArray(clicks[recipientHash])
    ? clicks[recipientHash]
    : [];
  // Cap per-recipient click log so a runaway bot can't blow up a key.
  if (list.length < 50) {
    list.push({ url, ts: new Date().toISOString() });
  }
  clicks[recipientHash] = list;
  const next = {
    ...existing,
    clicks,
    clickTotal: Number(existing.clickTotal || 0) + 1,
    uniqueClicks: isNewUnique
      ? Number(existing.uniqueClicks || 0) + 1
      : Number(existing.uniqueClicks || 0),
  };
  await store.set(statsKey(id), JSON.stringify(next));
};

// Audience resolution --------------------------------------------------

// Build per-customer aggregates by joining users + orders. Mirrors the
// shape used by functions/api/customers.js but trimmed down to what
// broadcasts needs (email + segment + name).
const aggregateCustomers = (users, orders) => {
  const map = new Map();
  const ensure = (email) => {
    const key = normalizeEmail(email);
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, {
        email: key,
        name: "",
        ordersCount: 0,
        netSpend: 0,
        firstOrderAt: "",
        lastOrderAt: "",
      });
    }
    return map.get(key);
  };

  const usersByEmail = users && typeof users === "object" ? users : {};
  for (const [rawEmail, profile] of Object.entries(usersByEmail)) {
    const row = ensure(rawEmail);
    if (!row) continue;
    if (profile && typeof profile === "object") {
      row.name = String(profile.name || row.name);
    }
  }

  for (const order of Array.isArray(orders) ? orders : []) {
    if (!order || typeof order !== "object") continue;
    const email = normalizeEmail(order.customerEmail || order.email);
    const row = ensure(email);
    if (!row) continue;
    const total = Number(order.total) || 0;
    const refund =
      order.refund && typeof order.refund === "object"
        ? Number(order.refund.amount) || 0
        : 0;
    row.ordersCount += 1;
    row.netSpend += Math.max(0, total - refund);
    if (!row.name && order.customerName) {
      row.name = String(order.customerName);
    }
    const createdAt = order.createdAt || order.created_at || "";
    if (createdAt) {
      if (!row.firstOrderAt || createdAt < row.firstOrderAt) {
        row.firstOrderAt = createdAt;
      }
      if (!row.lastOrderAt || createdAt > row.lastOrderAt) {
        row.lastOrderAt = createdAt;
      }
    }
  }

  // Compute segment for each row (must match customers.js logic).
  const now = Date.now();
  for (const row of map.values()) {
    const daysSinceOrder = row.lastOrderAt
      ? Math.floor((now - Date.parse(row.lastOrderAt)) / 86_400_000)
      : null;
    if (row.netSpend >= SEGMENT_VIP_MIN_LTV) {
      row.segment = "vip";
    } else if (
      row.ordersCount > 0 &&
      typeof daysSinceOrder === "number" &&
      daysSinceOrder > SEGMENT_AT_RISK_DAYS
    ) {
      row.segment = "at_risk";
    } else if (row.ordersCount >= SEGMENT_REPEAT_MIN_ORDERS) {
      row.segment = "repeat";
    } else if (row.ordersCount === 1) {
      row.segment = "one_time";
    } else {
      row.segment = "lead";
    }
  }

  return [...map.values()];
};

const segmentFromAudience = (audience) => {
  if (!audience || !audience.startsWith("customers:")) return null;
  return audience.slice("customers:".length);
};

// Resolve audience → [{ email, name }] (deduped, normalized).
// Read-only; never throws — callers receive an empty list on KV errors.
export const resolveAudience = async (audience) => {
  const result = new Map();
  const add = (email, name) => {
    const key = normalizeEmail(email);
    if (!key) return;
    if (!result.has(key)) result.set(key, { email: key, name: name || "" });
  };

  const wantSubscribers = audience === "all" || audience === "subscribers";
  const wantCustomers =
    audience === "all" ||
    audience === "customers" ||
    audience?.startsWith("customers:");

  if (wantSubscribers) {
    try {
      const store = newsletterStore();
      const list = await store.get("subscribers", { type: "json" });
      if (Array.isArray(list)) {
        for (const entry of list) {
          if (!entry || typeof entry !== "object") continue;
          if (entry.unsubscribed) continue;
          add(entry.email, entry.name);
        }
      }
    } catch {
      /* swallow — empty audience on KV failure */
    }
  }

  if (wantCustomers) {
    try {
      const ordersStore = getStore("orders");
      const usersStore = getStore("users");
      const [orders, users] = await Promise.all([
        ordersStore.get("all-orders", { type: "json" }),
        usersStore.get("users-by-email", { type: "json" }),
      ]);
      const customers = aggregateCustomers(users, orders);
      const wantedSegment = segmentFromAudience(audience);
      for (const c of customers) {
        if (wantedSegment && c.segment !== wantedSegment) continue;
        add(c.email, c.name);
      }
    } catch {
      /* swallow — fall through with whatever we have */
    }
  }

  return [...result.values()];
};

// Email body rendering -------------------------------------------------

// Conservative HTML escape; treats body text as plain text and wraps
// it in <p> tags so the admin can type a paragraph at a time without
// worrying about HTML injection.
const escapeHtml = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const paragraphs = (body) => {
  const text = String(body || "").replace(/\r\n?/g, "\n");
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks
    .map((block) => {
      const escaped = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;line-height:1.6;color:#1c1c1c">${escaped}</p>`;
    })
    .join("");
};

const isHttpUrl = (s) => {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

// Compose a Branded broadcast email body. The chrome is deliberately
// lightweight (single column, no images) so it deliverabilities well
// across Gmail / iCloud / Outlook without the React Email pipeline.
// `unsubUrl`, `openPixelUrl`, and `rewriteLink` come from the caller
// per-recipient — they include the recipient hash for tracking.
export const renderBroadcastHtml = ({
  broadcast,
  unsubUrl,
  openPixelUrl,
  rewriteLink,
  brandName,
  brandTagline,
}) => {
  const subject = String(broadcast.subject || "");
  const heading = String(broadcast.heading || subject);
  const body = paragraphs(broadcast.bodyText);
  const ctaLabel = String(broadcast.ctaLabel || "").trim();
  const ctaUrl = String(broadcast.ctaUrl || "").trim();
  const showCta = ctaLabel && isHttpUrl(ctaUrl);
  const ctaHref = showCta ? rewriteLink(ctaUrl, "cta") : "";

  // Inline any href in the body? For v1 we treat body as plain text
  // only — links go through the CTA button. Keep this simple.

  const pixel = openPixelUrl
    ? `<img src="${escapeHtml(openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`
    : "";

  const safeName = escapeHtml(brandName || "Canvas Hub");
  const safeTag = escapeHtml(brandTagline || "Original Filipino paintings");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1c">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">${escapeHtml(subject)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ee">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e8e2d6;border-radius:8px">
            <tr>
              <td style="padding:28px 32px 12px">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:#1c1c1c">${safeName}</div>
                <div style="font-size:12px;color:#7a7468;letter-spacing:0.08em;text-transform:uppercase">${safeTag}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0">
                <hr style="border:0;border-top:1px solid #e8e2d6;margin:0" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0">
                <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;margin:0 0 16px;color:#1c1c1c">${escapeHtml(heading)}</h1>
                ${body}
                ${
                  showCta
                    ? `<div style="margin:8px 0 24px"><a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#1c1c1c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600">${escapeHtml(ctaLabel)}</a></div>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px">
                <hr style="border:0;border-top:1px solid #e8e2d6;margin:0 0 16px" />
                <div style="font-size:11px;color:#7a7468;line-height:1.5">
                  You're receiving this because you signed up for ${safeName} updates.
                  <br />
                  <a href="${escapeHtml(unsubUrl)}" style="color:#7a7468;text-decoration:underline">Unsubscribe</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${pixel}
  </body>
</html>`;
};

// Plain-text fallback for the email's `text` part. Sender providers
// auto-derive this from HTML if omitted, but supplying our own gives a
// cleaner result in plaintext-only clients.
export const renderBroadcastText = ({ broadcast, unsubUrl, brandName }) => {
  const subject = String(broadcast.subject || "");
  const heading = String(broadcast.heading || subject);
  const body = String(broadcast.bodyText || "").trim();
  const ctaLabel = String(broadcast.ctaLabel || "").trim();
  const ctaUrl = String(broadcast.ctaUrl || "").trim();
  const cta = ctaLabel && isHttpUrl(ctaUrl) ? `\n\n${ctaLabel}: ${ctaUrl}` : "";
  return [
    heading,
    "",
    body,
    cta,
    "",
    "—",
    brandName || "Canvas Hub",
    `Unsubscribe: ${unsubUrl}`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
};
