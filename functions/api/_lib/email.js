/**
 * Outbound email helper for the Canvas Hub storefront.
 *
 * Selects a provider based on env vars at call time:
 *   - RESEND_API_KEY  -> Resend (https://resend.com)
 *   - BREVO_API_KEY   -> Brevo  (https://developers.brevo.com)
 *
 * EMAIL_FROM (e.g. "Canvas Hub <orders@canvhub.com>") is required when a
 * provider is configured. EMAIL_REPLY_TO is optional. EMAIL_BCC is optional.
 *
 * Per-purpose overrides are supported: any caller that passes a `purpose`
 * (currently "order") will resolve EMAIL_FROM_<PURPOSE>, EMAIL_REPLY_TO_<PURPOSE>,
 * and EMAIL_BCC_<PURPOSE> first, falling back to the bare EMAIL_FROM /
 * EMAIL_REPLY_TO / EMAIL_BCC. This lets order-confirmation mail come from
 * order@canvhub.com while other channels keep their own from-address.
 *
 * Order-confirmation mail (kind = "confirmed" / "in_progress" /
 * "out_for_delivery" / "received" / "refund_requested" /
 * "refund_succeeded" / "refund_failed") additionally honours an admin-edited
 * `orderEmail` subtree on the storefront-config KV: per-kind subject /
 * heading / intro plus shared chrome (logo, banner, fonts, palette,
 * template, dividers, button style, footer). When the subtree is missing,
 * absent, or a kind is disabled the renderer falls back to the hard-coded
 * defaults below so existing deployments stay green.
 *
 * If no key is configured, sendEmail() resolves to
 *   { delivered: false, skipped: true, reason: "not configured" }
 * so callers can still record their notification entry without crashing.
 */

import { getCloudflareEnv } from "./context.js";
import { getStore } from "./kv-stores.js";
import { recordNotification } from "./d1.js";
import {
  DEFAULT_BRAND_LOGO_DATA_URI,
  FOOTER_ICON_DATA_URIS,
} from "./email-assets-data.js";
import {
  renderInactiveDeletionEmail as reactRenderInactiveDeletionEmail,
  renderNewOrderAdminAlert as reactRenderNewOrderAdminAlert,
  renderOrderEmail as reactRenderOrderEmail,
  renderVoucherEmail as reactRenderVoucherEmail,
  renderWelcomeEmail as reactRenderWelcomeEmail,
} from "../../../src/emails/render.ts";

const envOf = (name) => getCloudflareEnv()[name] || "";

// Fire-and-forget D1 logger. Never throws, never blocks the actual send.
// The send wrappers below call this after the provider returns so the
// admin Notification log panel has a single queryable view of every
// outgoing message attempt across email + push.
const logNotification = (channel, kind, recipient, orderId, result) => {
  try {
    void recordNotification({ channel, kind, recipient, orderId, result });
  } catch {
    /* swallow — logging must never break the send path */
  }
};

// Match every <img …> tag whose src is a base64 data: URI for a
// supported bitmap MIME. Captures: full src attribute (group 1),
// MIME minor type (group 2), base64 payload (group 3).
//
// We anchor on the `src=` attribute rather than just the data: URI
// itself so we can do a clean string replace on the attribute later.
//
// Allowed minor MIME types match the welcome-asset endpoint's
// allowlist (jpeg/jpg/png/webp/avif/gif). SVG is intentionally
// excluded — it is XML and can carry inline `<script>` payloads
// that would execute inside an email client's renderer.
const INLINE_DATA_IMG_RE =
  /src=(?:"|')(data:image\/(png|jpeg|jpg|gif|webp|avif);base64,([A-Za-z0-9+/=]+))(?:"|')/g;

// Stable, dependency-free 32-bit FNV-1a hash. Used to derive a short
// unique Content-ID for each unique base64 payload so identical
// images (e.g. the same footer icon used twice) collapse to a single
// MIME part instead of being attached twice.
const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

/**
 * Walk the rendered email HTML, replace every inline `data:image/…`
 * src with `cid:<id>` and emit a matching CID-attachment for the
 * MIME multipart/related body. Returns `{ html, cidAttachments }`.
 *
 * Why: Gmail (and most consumer email clients in 2025) does not
 * reliably render `<img src="data:image/…;base64,…">` tags. Either
 * the image rewriter strips the src entirely or it fails to fetch
 * the data URL through Google's image proxy, leaving the recipient
 * with a broken-image icon. Shipping the same bytes as a CID
 * attachment (multipart/related) is the documented, supported path
 * — Resend exposes it via `attachments[].content_id`.
 *
 * Idempotent: HTML that contains zero inline data URIs is returned
 * unchanged with an empty attachments array. Identical payloads
 * collapse to one attachment via the FNV-1a hash so the resulting
 * MIME body stays small even when the same icon appears 12 times.
 *
 * Pure: no I/O, no env access — safe to call from any context.
 */
export const transformInlineImagesToCidAttachments = (html) => {
  if (typeof html !== "string" || !html.includes("data:image/")) {
    return { html, cidAttachments: [] };
  }
  const seen = new Map();
  const transformed = html.replace(
    INLINE_DATA_IMG_RE,
    (_match, _full, mimeMinor, b64) => {
      const id = fnv1a(b64);
      if (!seen.has(id)) {
        const minor = mimeMinor === "jpg" ? "jpeg" : mimeMinor;
        seen.set(id, {
          contentId: id,
          filename: `inline-${id}.${minor === "jpeg" ? "jpg" : minor}`,
          contentType: `image/${minor}`,
          content: b64,
          inline: true,
        });
      }
      return `src="cid:${id}"`;
    },
  );
  return { html: transformed, cidAttachments: Array.from(seen.values()) };
};

/**
 * Resolve an EMAIL_* env var, preferring the per-purpose override
 * (EMAIL_<NAME>_<PURPOSE>) when set, otherwise the bare EMAIL_<NAME>.
 * Exported so admin metrics can show the value that will actually be
 * used for a given purpose without duplicating the lookup logic.
 */
export const resolveEmailEnv = (name, purpose) => {
  const suffix = String(purpose || "")
    .trim()
    .toUpperCase();
  if (suffix) {
    const override = envOf(`EMAIL_${name}_${suffix}`);
    if (override) return override;
  }
  return envOf(`EMAIL_${name}`);
};

const PROVIDERS = {
  resend: {
    envKey: "RESEND_API_KEY",
    send: sendViaResend,
  },
  brevo: {
    envKey: "BREVO_API_KEY",
    send: sendViaBrevo,
  },
};

// Order-email kinds — every transactional email the order pipeline can
// fire. Exposed so storefront-config.js can sanitize a kinds map of the
// same shape and the admin UI can iterate the same list to render tabs.
export const ORDER_EMAIL_KINDS = [
  "confirmed",
  "in_progress",
  "out_for_delivery",
  "received",
  "refund_requested",
  "refund_succeeded",
  "refund_failed",
];

// Hard-coded defaults the renderer falls back to when the admin hasn't
// customised a kind (or when the storefront-config KV doc is missing).
// Placeholders supported in subject + heading + intro:
//   {{name}}          - customer's full name (or "Collector" fallback)
//   {{firstName}}     - first token of {{name}}
//   {{orderId}}       - human-readable order id
//   {{total}}         - formatted PHP total
//   {{itemCount}}     - number of line items
//   {{itemPlural}}    - empty string for 1 item, "s" for 2+ items
//   {{courier}}       - shipment courier (out_for_delivery only)
//   {{trackingNumber}} - shipment tracking number (out_for_delivery only)
//   {{refundAmount}}  - formatted PHP refund amount (refund_* only)
//   {{failureMessage}} - refund-failed details (refund_failed only)
export const DEFAULT_ORDER_EMAIL_KINDS = {
  confirmed: {
    subject: "Order {{orderId}} confirmed",
    heading: "Thanks — your order is confirmed",
    intro:
      "Hi {{name}},\n\nThanks for your order at Canvas Hub. We've recorded your payment of {{total}} and the team is getting your painting{{itemPlural}} ready. We'll send another note the moment the artist starts on it.",
  },
  in_progress: {
    subject: "Order {{orderId}}: in progress",
    heading: "Painting in progress",
    intro:
      "Hi {{name}},\n\nGood news — the artist has started working on your order. We'll send another note the moment it ships.",
  },
  out_for_delivery: {
    subject: "Order {{orderId}}: shipped",
    heading: "Out for delivery",
    intro:
      "Hi {{name}},\n\nYour painting is on its way! Tracking details are below — keep them handy in case you'd like to follow the parcel's journey.",
  },
  received: {
    subject: "Order {{orderId}}: delivered",
    heading: "Order delivered — thank you",
    intro:
      "Hi {{name}},\n\nWe've marked your order as received. We hope your painting feels right at home — we'd love to hear what you think.",
  },
  refund_requested: {
    subject: "Refund initiated for order {{orderId}}",
    heading: "Refund in progress",
    intro:
      "Hi {{name}},\n\nYour refund of {{refundAmount}} for order {{orderId}} has been initiated and should land back in your wallet shortly.",
  },
  refund_succeeded: {
    subject: "Refund completed for order {{orderId}}",
    heading: "Refund completed",
    intro:
      "Hi {{name}},\n\nYour refund of {{refundAmount}} for order {{orderId}} has been credited back. Thank you for your patience.",
  },
  refund_failed: {
    subject: "Refund failed for order {{orderId}}",
    heading: "Refund could not be processed",
    intro:
      "Hi {{name}},\n\nUnfortunately your refund for order {{orderId}} could not be processed automatically{{failureMessage}}. Please reply to this email and we'll sort it out manually.",
  },
};

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const getEmailProvider = () => {
  if (envOf("RESEND_API_KEY")) return "resend";
  if (envOf("BREVO_API_KEY")) return "brevo";
  return null;
};

export const isEmailConfigured = (purpose) =>
  Boolean(getEmailProvider()) && Boolean(resolveEmailEnv("FROM", purpose));

async function sendViaResend({
  from,
  to,
  subject,
  html,
  text,
  replyTo,
  bcc,
  attachments,
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envOf("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(bcc ? { bcc } : {}),
      // Resend attachment shape: { filename, content (base64) }.
      // Inline images use `content_id` to match `<img src="cid:…">`
      // references in the rendered HTML and are emitted as
      // multipart/related parts by Resend.
      ...(Array.isArray(attachments) && attachments.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType ? { content_type: a.contentType } : {}),
              ...(a.contentId ? { content_id: a.contentId } : {}),
            })),
          }
        : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      delivered: false,
      provider: "resend",
      error: data?.message || data?.error || `Resend HTTP ${res.status}`,
    };
  }
  return {
    delivered: true,
    provider: "resend",
    providerId: data?.id || "",
  };
}

async function sendViaBrevo({
  from,
  to,
  subject,
  html,
  text,
  replyTo,
  bcc,
  attachments,
}) {
  const parsedFrom = parseAddress(from);
  const recipients = (Array.isArray(to) ? to : [to]).map(parseAddress);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": envOf("BREVO_API_KEY"),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: parsedFrom,
      to: recipients,
      subject,
      htmlContent: html,
      textContent: text,
      ...(replyTo ? { replyTo: parseAddress(replyTo) } : {}),
      ...(bcc
        ? {
            bcc: (Array.isArray(bcc) ? bcc : [bcc]).map(parseAddress),
          }
        : {}),
      // Brevo attachment shape: { name, content (base64) }.
      ...(Array.isArray(attachments) && attachments.length
        ? {
            attachment: attachments.map((a) => ({
              name: a.filename,
              content: a.content,
            })),
          }
        : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      delivered: false,
      provider: "brevo",
      error: data?.message || data?.code || `Brevo HTTP ${res.status}`,
    };
  }
  return {
    delivered: true,
    provider: "brevo",
    providerId: data?.messageId || "",
  };
}

const parseAddress = (raw) => {
  if (!raw || typeof raw !== "string") return { email: "" };
  const match = raw.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: raw.trim() };
};

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
  purpose,
  from: fromOverride,
  attachments,
}) => {
  if (!to || !subject) {
    return { delivered: false, skipped: true, reason: "missing fields" };
  }
  const providerKey = getEmailProvider();
  if (!providerKey) {
    return { delivered: false, skipped: true, reason: "not configured" };
  }
  const from = fromOverride || resolveEmailEnv("FROM", purpose);
  if (!from) {
    const suffix = String(purpose || "")
      .trim()
      .toUpperCase();
    return {
      delivered: false,
      skipped: true,
      reason: suffix
        ? `EMAIL_FROM_${suffix} / EMAIL_FROM not set`
        : "EMAIL_FROM not set",
    };
  }
  const provider = PROVIDERS[providerKey];

  // Convert any inline `data:image/…;base64,…` <img> srcs in the
  // rendered HTML to `cid:<id>` references and emit matching CID
  // attachments. Gmail and most consumer mail clients in 2025 do
  // not reliably render inline data: URIs (the image rewriter
  // strips them), so anything we want to ship as part of the
  // brand chrome (default C-logo, footer social icons, …) has to
  // ride as a multipart/related CID part. Resend supports this
  // natively via `attachments[].content_id`. Brevo doesn't expose
  // CID inlining anymore (deprecated in API v3) — those payloads
  // will arrive as plain attachments instead, which is harmless
  // (the email body is still readable; the icons just don't show).
  // Plain attachments (e.g. the order waybill PDF) are preserved
  // as-is and merged with any newly extracted CID parts.
  const { html: cidHtml, cidAttachments } =
    transformInlineImagesToCidAttachments(html);
  const callerAttachments = Array.isArray(attachments) ? attachments : [];
  const mergedAttachments =
    cidAttachments.length || callerAttachments.length
      ? [...callerAttachments, ...cidAttachments]
      : undefined;

  try {
    return await provider.send({
      from,
      to,
      subject,
      html: cidHtml,
      text: text || stripTags(cidHtml),
      replyTo: resolveEmailEnv("REPLY_TO", purpose) || undefined,
      bcc: resolveEmailEnv("BCC", purpose) || undefined,
      attachments: mergedAttachments,
    });
  } catch (err) {
    return {
      delivered: false,
      provider: providerKey,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

const stripTags = (s) =>
  String(s || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const formatPHP = (n) =>
  `\u20b1${(Number(n) || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })}`;

// Hard-coded fallback chrome used when no admin orderEmail config has
// been saved yet. Mirrors the field shape stored in storefront-config
// (DEFAULT_ORDER_EMAIL) so wrapWelcomeHtml renders the same way it
// would for an admin-customised brand. Keeping every customer- AND
// admin-facing order email on the same chrome ensures "identical
// template style" across status changes / new-order alerts.
const DEFAULT_ORDER_CHROME = {
  fromName: "Canvas Hub",
  fromEmail: "order@canvhub.com",
  primaryColor: "#1c1c1c",
  accentColor: "#7a7468",
  logoUrl: "",
  bannerUrl: "",
  showLogo: true,
  showBanner: false,
  bodyFont: "inter",
  template: "classic",
  headerAlign: "left",
  dividerStyle: "line",
  buttonStyle: "filled",
  footerTagline: "original Filipino paintings",
  footerLinks: [],
  trackButtonText: "Track shipment",
  reviewButtonText: "Write a review",
};

// Public site host for outbound deep links in transactional emails.
// Mirrors the canonical hostname used in sitemap.js and policies.js.
const PUBLIC_SITE_ORIGIN = "https://canvhub.com";

// Deep-link a customer back to their order tracker (so the "Write a
// review" CTA in the delivered email lands them straight on the form).
// Mirrors the `?track=<orderId>` pattern OrderTracker reads on mount,
// and the `#order-review-form` anchor exposed by DeliveredReviewPrompt
// so the page also auto-scrolls to the rating UI.
const buildOrderTrackUrl = (orderId) =>
  orderId
    ? `${PUBLIC_SITE_ORIGIN}/account?track=${encodeURIComponent(orderId)}#order-review-form`
    : "";

// Format a `sizeCm` line-item field for human display in the order
// email. Returns empty string when the line has no size on it (legacy
// orders, or a customer who never opened "View on your wall"). One
// decimal so 30 × 40 stays integer but 105.5 still renders.
const formatSizeForEmail = (sizeCm) => {
  if (!sizeCm || typeof sizeCm !== "object") return "";
  const w = Number(sizeCm.widthCm);
  const h = Number(sizeCm.heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return "";
  if (w <= 0 || h <= 0) return "";
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(w)} \u00d7 ${fmt(h)} cm`;
};

const renderItemsTable = (items = []) => {
  if (!items.length) return "";
  const rows = items
    .map((i) => {
      // Prefer the admin-provided dimensions string (new orders); fall
      // back to the legacy structured sizeCm for historical orders.
      const dimensionsLabel =
        typeof i.dimensions === "string" && i.dimensions.trim()
          ? i.dimensions.trim()
          : formatSizeForEmail(i.sizeCm);
      const sizeLine = dimensionsLabel
        ? `<div style="margin-top:2px;font-size:11px;color:#7a7468;">Dimensions: ${escapeHtml(dimensionsLabel)}</div>`
        : "";
      return `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#1c1c1c;">
            ${escapeHtml(i.title)} <span style="color:#7a7468;">&times; ${
              Number(i.quantity) || 1
            }</span>${sizeLine}
          </td>
          <td style="padding:8px 0;font-size:13px;text-align:right;color:#1c1c1c;vertical-align:top;">
            ${formatPHP((Number(i.price) || 0) * (Number(i.quantity) || 1))}
          </td>
        </tr>`;
    })
    .join("");
  return `
    <table role="presentation" width="100%" style="border-top:1px solid #efece4;border-bottom:1px solid #efece4;margin:16px 0;">
      ${rows}
    </table>
  `;
};

// When the storefront is in Lalamove-paid-to-rider mode the order's
// `shippingFee` is 0 because the rider's fee is collected separately
// in cash on delivery. We swap the standard "Shipping: ₱X" row for a
// clearer note so the buyer doesn't think delivery is free.
const isLalamoveOrder = (order) => {
  const courier = String(order?.orderInfo?.courier || "").toLowerCase();
  return courier === "lalamove";
};

const renderTotals = (order) => {
  const lalamovePaidToRider =
    isLalamoveOrder(order) && (Number(order?.shippingFee) || 0) === 0;
  const shippingRow = lalamovePaidToRider
    ? `<tr><td style="color:#7a7468;">Shipping</td><td style="text-align:right;color:#7a7468;font-style:italic;">Lalamove — paid to rider on delivery</td></tr>`
    : order.shippingFee
      ? `<tr><td style="color:#7a7468;">Shipping</td><td style="text-align:right;">${formatPHP(order.shippingFee)}</td></tr>`
      : "";
  return `
  <table role="presentation" width="100%" style="font-size:13px;">
    <tr><td style="color:#7a7468;">Subtotal</td><td style="text-align:right;">${formatPHP(order.subtotal)}</td></tr>
    ${shippingRow}
    ${
      order.discount
        ? `<tr><td style="color:#7a7468;">Discount${order.voucherCode ? ` (${escapeHtml(order.voucherCode)})` : ""}</td><td style="text-align:right;">- ${formatPHP(order.discount)}</td></tr>`
        : ""
    }
    <tr><td style="padding-top:8px;font-weight:600;">Total</td><td style="padding-top:8px;text-align:right;font-weight:600;">${formatPHP(order.total)}</td></tr>
  </table>
`;
};

// Substitute {{placeholder}} tokens in admin-edited template strings.
// Returns a plain (un-escaped) string suitable for use as the email
// subject. Unknown placeholders are dropped (replaced with empty string).
const substituteOrderTemplate = (template, vars) => {
  if (!template) return "";
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
};

// HTML-render the admin-edited intro: every static segment AND every
// substituted value is escaped so admins can't inject markup, then
// double-newlines become paragraph breaks and single newlines become
// <br>. Returns a string of one or more <p> blocks.
const renderOrderIntroHtml = (template, vars) => {
  if (!template) return "";
  const parts = [];
  let last = 0;
  const re = /\{\{(\w+)\}\}/g;
  let m;
  while ((m = re.exec(template)) !== null) {
    parts.push(escapeHtml(template.slice(last, m.index)));
    const v = vars[m[1]];
    parts.push(v === undefined || v === null ? "" : escapeHtml(String(v)));
    last = re.lastIndex;
  }
  parts.push(escapeHtml(template.slice(last)));
  const escaped = parts.join("");
  return escaped
    .split(/\n{2,}/)
    .filter((p) => p.length)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
};

// Resolve which orderEmail config + per-kind override to use. Falls back
// to DEFAULT_ORDER_EMAIL_KINDS when the admin hasn't customised the kind
// or the orderEmail subtree is missing.
const resolveOrderKindConfig = (orderEmail, kind) => {
  const def =
    DEFAULT_ORDER_EMAIL_KINDS[kind] || DEFAULT_ORDER_EMAIL_KINDS.confirmed;
  const adminKind = orderEmail?.kinds?.[kind];
  if (!adminKind || typeof adminKind !== "object")
    return { ...def, enabled: true };
  return {
    enabled: adminKind.enabled !== false,
    subject:
      typeof adminKind.subject === "string" && adminKind.subject.trim()
        ? adminKind.subject
        : def.subject,
    heading:
      typeof adminKind.heading === "string" && adminKind.heading.trim()
        ? adminKind.heading
        : def.heading,
    intro:
      typeof adminKind.intro === "string" && adminKind.intro.trim()
        ? adminKind.intro
        : def.intro,
  };
};

/**
 * Build subject + html + text for a given notification kind. `extra` may
 * include shipment / refund-specific values. `orderEmail` is the
 * admin-edited storefront-config.orderEmail subtree (optional — when
 * absent the renderer falls back to the hard-coded chrome / copy).
 *
 * Renders via the React Email pipeline in `src/emails/templates/OrderEmail`
 * so all 7 order kinds (confirmed / in_progress / out_for_delivery /
 * received / refund_*) share the same BaseEmail chrome with the welcome /
 * admin-alert / voucher / inactive-deletion emails.
 *
 * Async because @react-email/render returns a Promise — callers must
 * `await buildOrderEmail(...)`.
 */
export const buildOrderEmail = async (
  kind,
  order,
  extra = {},
  orderEmail = null,
) => {
  const effectiveConfig = orderEmail || DEFAULT_ORDER_CHROME;
  const config = prepareReactChromeConfig(effectiveConfig, "order");
  const rendered = await reactRenderOrderEmail({
    kind,
    order,
    extra: extra || {},
    config,
  });
  return rendered;
};

/**
 * Convenience wrapper around buildOrderEmail + sendEmail. Returns a value
 * suitable for stamping onto a notification record.
 */
/**
 * Load the orderEmail subtree from the storefront-config KV. Returns null
 * when the binding or the doc isn't there yet so callers can no-op cleanly
 * (the renderer falls back to its hard-coded defaults).
 */
export const loadOrderEmailConfig = async () => {
  try {
    const store = getStore("storefront-config");
    const raw = await store.get("config", { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    if (!raw.orderEmail || typeof raw.orderEmail !== "object") return null;
    return raw.orderEmail;
  } catch {
    return null;
  }
};

export const sendOrderEmail = async ({ kind, order, extra }) => {
  const recipient = order?.orderInfo?.email;
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "no recipient" };
  }
  const orderEmail = await loadOrderEmailConfig();
  // Master switch — admin can disable all order email globally.
  if (orderEmail && orderEmail.enabled === false) {
    return { delivered: false, skipped: true, reason: "disabled" };
  }
  // Per-kind switch — admin can mute individual stages without disabling
  // the whole channel.
  const kindCfg = orderEmail?.kinds?.[kind];
  if (kindCfg && kindCfg.enabled === false) {
    return { delivered: false, skipped: true, reason: "kind disabled" };
  }
  const built = await buildOrderEmail(kind, order, extra || {}, orderEmail);
  // Resolve the from address: storefront config → env var → fallback.
  // The orderEmail config (admin-editable) carries fromName + fromEmail
  // which we format as "Name <email>". This lets the admin set
  // "order@canvhub.com" in the dashboard without needing a separate
  // EMAIL_FROM_ORDER Cloudflare env var.
  const cfgEmail = (orderEmail?.fromEmail || "order@canvhub.com").trim();
  const cfgName = (orderEmail?.fromName || "Canvas Hub").trim();
  const configFrom = cfgEmail
    ? cfgName
      ? `${cfgName} <${cfgEmail}>`
      : cfgEmail
    : "";
  // Attach the client-built waybill PDF (base64) when supplied. We
  // only attach on the "confirmed" kind so subsequent status mails
  // don't repeat the same file.
  const waybillPdfBase64 =
    typeof extra?.waybillPdfBase64 === "string" ? extra.waybillPdfBase64 : "";
  const attachments =
    kind === "confirmed" && waybillPdfBase64
      ? [
          {
            filename: `${order?.id || "order"}-waybill.pdf`,
            content: waybillPdfBase64,
            contentType: "application/pdf",
          },
        ]
      : undefined;
  const result = await sendEmail({
    to: recipient,
    subject: built.subject,
    html: built.html,
    text: built.text,
    purpose: "order",
    from: configFrom || undefined,
    attachments,
  });
  logNotification("email", `order.${kind}`, recipient, order?.id, result);
  return result;
};

/**
 * Send a fake order through the order-email pipeline so admins can preview
 * a specific kind in their inbox before flipping anything live. Always
 * forces the master + kind switches on so the test send works even when
 * the channel is paused.
 */
export const sendOrderTestEmail = async ({ kind, to, name, orderEmail }) => {
  const recipient = String(to || "").trim();
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "no recipient" };
  }
  if (!isEmailConfigured("order")) {
    return { delivered: false, skipped: true, reason: "not configured" };
  }
  const safeKind = ORDER_EMAIL_KINDS.includes(kind) ? kind : "confirmed";
  const fakeOrder = {
    id: "TEST-1234",
    orderInfo: {
      email: recipient,
      fullName: String(name || "Test collector").slice(0, 80),
    },
    items: [
      { title: "Sunset over Mayon", quantity: 1, price: 4500 },
      { title: "Banaue rice terraces", quantity: 1, price: 6500 },
    ],
    subtotal: 11000,
    shippingFee: 250,
    discount: 0,
    total: 11250,
    voucherCode: "",
    refund: { amount: 11250 },
  };
  const fakeExtra = {
    courier: "LBC Express",
    trackingNumber: "LBC-PREVIEW-001",
    trackingUrl: "https://www.lbcexpress.com/track",
    refundAmount: 11250,
    failureMessage: "insufficient wallet balance at provider",
  };
  // Force master + kind switches on for previews.
  const previewOrderEmail = orderEmail
    ? {
        ...orderEmail,
        enabled: true,
        kinds: {
          ...orderEmail.kinds,
          [safeKind]: {
            ...(orderEmail.kinds?.[safeKind] || {}),
            enabled: true,
          },
        },
      }
    : null;
  const built = await buildOrderEmail(
    safeKind,
    fakeOrder,
    fakeExtra,
    previewOrderEmail,
  );
  const cfgEmail = (orderEmail?.fromEmail || "order@canvhub.com").trim();
  const cfgName = (orderEmail?.fromName || "Canvas Hub").trim();
  const configFrom = cfgEmail
    ? cfgName
      ? `${cfgName} <${cfgEmail}>`
      : cfgEmail
    : "";
  return await sendEmail({
    to: recipient,
    subject: `[Test] ${built.subject}`,
    html: built.html,
    text: built.text,
    purpose: "order",
    from: configFrom || undefined,
  });
};

/**
 * Fire a concise "new order" alert to the storefront operator. Separate
 * from the customer-facing confirmation so admins get a phone-push from
 * Gmail/Outlook the moment an order lands, even when they're not staring
 * at the dashboard.
 *
 * Recipient resolution:
 *   1. orderEmail.adminRecipient (admin-editable in the dashboard)
 *   2. ADMIN_ORDER_RECIPIENT env var (deploy-time fallback)
 *   3. EMAIL_BCC_ORDER env var (legacy fallback)
 *
 * Skips silently when no recipient is configured — the customer
 * confirmation is the source of truth, this is purely operator nice-to-have.
 */
export const sendNewOrderAdminAlert = async ({ order }) => {
  const orderEmail = await loadOrderEmailConfig();
  const recipient =
    String(orderEmail?.adminRecipient || "").trim() ||
    String(resolveEmailEnv("ADMIN_RECIPIENT", "order") || "").trim() ||
    String(resolveEmailEnv("BCC", "order") || "").trim();
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "no admin recipient" };
  }
  if (!isEmailConfigured("order")) {
    return { delivered: false, skipped: true, reason: "not configured" };
  }
  // Resolve the same chrome the customer-facing order emails use so the
  // admin alert lands in the inbox with matching logo / palette / fonts /
  // footer. Renders through the same React Email NewOrderAdminAlert
  // template so the alert and the customer copy that arrive seconds
  // later are visually identical.
  const effectiveConfig = orderEmail || DEFAULT_ORDER_CHROME;
  const config = prepareReactChromeConfig(effectiveConfig, "order");
  const built = await reactRenderNewOrderAdminAlert({ order, config });

  // Resolve the same from-address the customer copies use so admin
  // inbox threading groups them together (Gmail/Outlook collapse by
  // sender + subject root).
  const cfgEmail = (effectiveConfig.fromEmail || "order@canvhub.com").trim();
  const cfgName = (effectiveConfig.fromName || "Canvas Hub").trim();
  const configFrom = cfgEmail
    ? cfgName
      ? `${cfgName} <${cfgEmail}>`
      : cfgEmail
    : "";

  const result = await sendEmail({
    to: recipient,
    subject: built.subject,
    html: built.html,
    text: built.text,
    purpose: "order",
    from: configFrom || undefined,
  });
  logNotification("email", "admin.new-order", recipient, order?.id, result);
  return result;
};

const renderTemplateString = (template, vars) =>
  String(template ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });

const isSafeColor = (value) =>
  typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim());

const isSafeUrl = (value) =>
  typeof value === "string" &&
  /^(https?:\/\/|mailto:|data:image\/)/i.test(value.trim());

// Resolve the storefront origin we should use for absolute URLs in the
// rendered email (logo / banner / product image hosting). Prefers the
// admin-configured CTA URL, falls back to the production origin.
const resolveBaseUrl = (welcome) => {
  const fallback = "https://canvhub.com";
  const raw = String(welcome?.ctaUrl || "").trim();
  if (!/^https?:\/\//i.test(raw)) return fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
};

// Resolve an admin-uploaded image (logo / banner / avatar /
// per-product thumbnail) into the URL the email <img> tag should
// carry.
//
// Strategy: emit the data: URI **as-is**. The send pipeline in
// `sendEmail` runs `transformInlineImagesToCidAttachments` over the
// rendered HTML right before handing it to Resend, which extracts
// every `<img src="data:image/…">` into a CID-referenced
// multipart/related attachment. Net effect: the email body Resend
// transmits contains short `<img src="cid:<id>">` references, the
// bytes ride alongside as proper attachments, and Gmail / iCloud /
// Outlook all render them inline.
//
// The previous implementation pointed at `/api/welcome-asset/<slot>`
// instead, which kept the body small but required Cloudflare to
// successfully serve the bytes to Gmail's image proxy. Cloudflare
// Bot Fight Mode now intermittently challenges that proxy, leaving
// the recipient with broken-image icons. CID attachments sidestep
// the network fetch entirely and are not sensitive to dashboard
// security toggles.
//
// Non-data values (admins who paste an HTTPS URL) are returned
// untouched so externally-hosted images keep working as before.
//
// `welcome` and `slot` are unused in the new path but kept in the
// signature so call sites stay readable and so we can quickly
// re-enable the rehost path if a deliverability regression appears.
const rehostEmailImage = (welcome, _slot, value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return `${resolveBaseUrl(welcome)}${trimmed}`;
  return trimmed;
};

/**
 * Pre-rehost the chrome-relevant URLs (logo, banner) on the config doc
 * so the React Email render path receives plain HTTPS URLs instead of
 * inline data:image/png;base64,... blobs (which Gmail/Outlook routinely
 * truncate or strip). Returns a *new* object — input is untouched.
 *
 * Order emails go through the dedicated `order-logo` / `order-banner`
 * slots so they don't collide with the welcome email's slots.
 *
 * Exported so callers outside email.js (newsletter.js, user-auth.js)
 * can use the same prep + rehosting before invoking the React render
 * functions directly.
 */
const prepareReactChromeConfig = (rawConfig, channel) => {
  const cfg = rawConfig || {};
  const logoSlot = channel === "order" ? "order-logo" : "logo";
  const bannerSlot = channel === "order" ? "order-banner" : "banner";
  return {
    ...cfg,
    logoUrl: rehostEmailImage(cfg, logoSlot, cfg.logoUrl),
    bannerUrl: rehostEmailImage(cfg, bannerSlot, cfg.bannerUrl),
  };
};

// External-facing alias so newsletter.js / user-auth.js can prep their
// chrome the same way without reaching into internal helpers.
export const prepareReactChromeConfigForExternal = prepareReactChromeConfig;

/**
 * Pre-rehost the welcome-email-specific URLs (avatar + product/custom
 * thumbnails) so the React Email render path receives plain HTTPS URLs
 * for every <Img> tag.
 */
const prepareReactWelcomeProducts = (welcome, products) => {
  if (!Array.isArray(products) || products.length === 0) return [];
  return products.map((p) => {
    const id = String(p?.id || "");
    if (p && p.__custom) {
      return {
        ...p,
        imageUrl: rehostEmailImage(
          welcome,
          `custom/${encodeURIComponent(id)}`,
          p.imageUrl,
        ),
      };
    }
    const rawImg = productThumbnailUrl(p);
    const price = p && p.salePrice && p.salePrice > 0 ? p.salePrice : p?.price;
    return {
      id,
      title: String(p?.title || "Untitled"),
      imageUrl: rehostEmailImage(
        welcome,
        `product/${encodeURIComponent(id)}`,
        rawImg,
      ),
      price: Number(price) || 0,
    };
  });
};

// Footer link URLs additionally allow tel: for phone numbers, but Gmail
// strips javascript: and other schemes either way.
const isSafeLinkUrl = (value) =>
  typeof value === "string" &&
  /^(https?:\/\/|mailto:|tel:)/i.test(value.trim());

// Body font choices exposed in the admin. Keys match the schema's
// `bodyFont` enum; values are the email-safe CSS font-family stack to
// stamp into the body wrapper. We always end with a system fallback so
// the email reads even if the embedded webfonts fail to load.
const BODY_FONT_STACKS = {
  inter: "Inter, Helvetica, Arial, sans-serif",
  playfair: "'Playfair Display', Georgia, 'Times New Roman', serif",
  garamond: "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif",
  georgia: "Georgia, 'Times New Roman', serif",
};

const resolveBodyFont = (welcome) => {
  const key = String(welcome?.bodyFont || "inter").toLowerCase();
  return BODY_FONT_STACKS[key] || BODY_FONT_STACKS.inter;
};

// Layout presets. Each one is a small palette of "wrapper" tokens that
// the email renderer uses to dress the outer card — page background,
// card surface color + border, section padding, body text color. The
// per-field controls (font / alignment / divider style / button style)
// are still authoritative for their own concern; templates only theme
// the surrounding chrome. This keeps each control independently
// overridable while still letting an admin pick a one-click "look".
const TEMPLATE_PRESETS = {
  classic: {
    pageBg: "#f5f3ee",
    cardBg: "#ffffff",
    cardBorder: "1px solid #e5e1d8",
    cardRadius: "6px",
    headerPad: "24px 28px",
    contentPad: "24px 28px",
    footerPad: "18px 28px",
    bodyColor: "#1c1c1c",
    headingColor: "#1c1c1c",
    headerSeparator: "1px solid #efece4",
    footerSeparator: "1px solid #efece4",
  },
  editorial: {
    // Magazine-style: warm paper page, generous padding, hairline
    // borders top + bottom only (no card surround), bigger headline
    // breathing room.
    pageBg: "#f1ede4",
    cardBg: "#fdfbf6",
    cardBorder: "none",
    cardRadius: "0",
    headerPad: "32px 36px 24px",
    contentPad: "16px 36px 32px",
    footerPad: "22px 36px",
    bodyColor: "#1c1c1c",
    headingColor: "#1c1c1c",
    headerSeparator: "1px solid #d8d3c6",
    footerSeparator: "1px solid #d8d3c6",
  },
  minimal: {
    // Tight, modern, no card. Crisp white page, single hairline
    // separators, condensed padding.
    pageBg: "#ffffff",
    cardBg: "#ffffff",
    cardBorder: "none",
    cardRadius: "0",
    headerPad: "20px 24px",
    contentPad: "16px 24px 24px",
    footerPad: "16px 24px",
    bodyColor: "#1c1c1c",
    headingColor: "#1c1c1c",
    headerSeparator: "1px solid #e7e3da",
    footerSeparator: "1px solid #e7e3da",
  },
  gallery: {
    // Dark hero card with gold accents — feels like a private-view
    // invitation. The default body color is light cream so paragraphs
    // remain readable against the dark surface.
    pageBg: "#1c1c1c",
    cardBg: "#262422",
    cardBorder: "1px solid #3a3631",
    cardRadius: "6px",
    headerPad: "28px 28px 22px",
    contentPad: "24px 28px",
    footerPad: "20px 28px",
    bodyColor: "#f5f3ee",
    headingColor: "#f5f3ee",
    headerSeparator: "1px solid #3a3631",
    footerSeparator: "1px solid #3a3631",
  },
};

const resolveTemplate = (welcome) => {
  const key = String(welcome?.template || "classic").toLowerCase();
  return TEMPLATE_PRESETS[key] || TEMPLATE_PRESETS.classic;
};

const resolveHeaderAlign = (welcome) =>
  welcome?.headerAlign === "center" ? "center" : "left";

// Brush divider art lifted from the storefront's BrushDivider component
// so the email matches the homepage. Inline SVG works in Apple Mail and
// modern Outlook; Gmail strips it but the line above falls back via
// `dividerStyle="line"` for Gmail-only users.
const BRUSH_DIVIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 12" preserveAspectRatio="none" style="display:block;width:100%;height:12px;">
  <path d="M2 7 C 40 1, 80 11, 120 4 S 180 9, 198 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  <circle cx="198" cy="5" r="1.4" fill="currentColor" />
</svg>`;

const sectionDividerHtml = (welcome, accent) => {
  const style = String(welcome?.dividerStyle || "line").toLowerCase();
  if (style === "none") return "";
  if (style === "brush") {
    return `<div style="margin:24px 0;color:${accent};line-height:0;">${BRUSH_DIVIDER_SVG}</div>`;
  }
  // hairline rule
  return `<hr style="border:none;border-top:1px solid ${accent}33;margin:24px 0;" />`;
};

// Render the CTA / discount-button as filled / outline / underline.
const renderActionLink = ({ label, url, primary, style }) => {
  if (!label || !url) return "";
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  const baseLabelStyle =
    "font-size:13px;letter-spacing:0.18em;text-transform:uppercase;font-weight:500;";
  if (style === "outline") {
    return `<a href="${safeUrl}" style="display:inline-block;padding:11px 22px;background:transparent;color:${primary};text-decoration:none;border:1px solid ${primary};border-radius:4px;${baseLabelStyle}">${safeLabel}</a>`;
  }
  if (style === "underline") {
    return `<a href="${safeUrl}" style="display:inline-block;padding:6px 0;color:${primary};text-decoration:underline;text-underline-offset:4px;${baseLabelStyle}">${safeLabel}</a>`;
  }
  // filled — current default
  return `<a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:${primary};color:#ffffff;text-decoration:none;border-radius:4px;${baseLabelStyle}">${safeLabel}</a>`;
};

// Map a footer link "kind" (instagram, tiktok, mail, …) to a small
// inlined PNG generated at build time from /public/email-icons/. We
// inline the bytes as data: URIs (instead of hot-linking the file on
// canvhub.com) so a Cloudflare bot challenge — which can intermittently
// 403 image-proxy fetches from Gmail / iCloud / Outlook — never breaks
// the rendered footer. Source PNGs and base64 strings are kept in sync
// by `npm run generate:email-assets`. The slug "twitter" is a synonym
// for "x" and shares the same icon.
const FOOTER_ICON_SLUGS = {
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  x: "x",
  twitter: "x",
  youtube: "youtube",
  pinterest: "pinterest",
  threads: "threads",
  mail: "mail",
  phone: "phone",
  globe: "globe",
  headphones: "headphones",
  custom: "custom",
};

const footerIconUrl = (_welcome, kind) => {
  const slug = FOOTER_ICON_SLUGS[kind] || FOOTER_ICON_SLUGS.custom;
  return FOOTER_ICON_DATA_URIS[slug] || FOOTER_ICON_DATA_URIS.custom;
};

// Plain-text fallback. Email clients that fall back to text/plain still
// see "Instagram: https://...   Email: support@canvhub.com" so the
// admin's contact intent isn't silently dropped.
const formatFooterLinksText = (welcome) => {
  const links = Array.isArray(welcome?.footerLinks) ? welcome.footerLinks : [];
  const visible = links.filter((l) => l && (l.url || l.label));
  if (!visible.length) return "";
  const lines = visible.map((l) => {
    const label = (l.label || l.kind || "").toString().trim();
    const url = (l.url || "").toString().trim();
    if (label && url) return `${label}: ${url}`;
    return url || label;
  });
  return `\n\n${lines.join("\n")}`;
};

const buildFooterLinksHtml = (welcome, accent) => {
  const links = Array.isArray(welcome?.footerLinks) ? welcome.footerLinks : [];
  const visible = links.filter((l) => l && (l.url || l.label));
  if (!visible.length) return "";
  const cells = visible
    .map((l) => {
      const url = isSafeLinkUrl(l.url) ? l.url : "";
      const labelText = String(l.label || "").trim();
      const escapedLabel = escapeHtml(labelText);
      const iconSrc = footerIconUrl(welcome, l.kind || "custom");
      const inner = `
        <img src="${iconSrc}" alt="" width="16" height="16" style="display:inline-block;vertical-align:middle;width:16px;height:16px;border:0;outline:none;" />
        ${labelText ? `<span style="display:inline-block;vertical-align:middle;margin-left:6px;">${escapedLabel}</span>` : ""}
      `.trim();
      const cellStyle = `padding:4px 10px;font-size:12px;color:${accent};line-height:1;`;
      if (url) {
        return `<td style="${cellStyle}"><a href="${escapeHtml(url)}" style="color:${accent};text-decoration:none;">${inner}</a></td>`;
      }
      return `<td style="${cellStyle}">${inner}</td>`;
    })
    .join("");
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 10px;">
          <tr>${cells}</tr>
        </table>`;
};

/**
 * Render the baked-in brand identity for the email header — just the
 * gold "C" medallion sitting on the warm-black rounded square that
 * matches the storefront's icon.svg / icon-512.png. We do NOT render
 * the "Canvas Hub" wordmark or the EST. 2026 tagline anymore: the
 * brand is the C, full stop, identical to the storefront favicon /
 * PWA icon. Used everywhere a custom logoUrl hasn't been uploaded.
 *
 * Implementation: the PNG is inlined as a base64 data: URI by
 * scripts/generate-email-assets.mjs at build time. Inlining avoids a
 * round-trip back to canvhub.com — which can fail intermittently when
 * Cloudflare's bot challenge is enabled — and keeps the email
 * self-contained. Email clients that block data: URIs (rare in 2026,
 * but possible on legacy Outlook) fall back to the alt text "C" —
 * never the words "Canvas Hub". `tpl` and `fromName` are accepted for
 * back-compat with the previous medallion+wordmark renderer; both are
 * now intentionally unused (the brand mark is template-agnostic and
 * never uses the configurable from-name as a wordmark).
 *
 * Mirrored byte-for-byte by `renderDefaultBrandLogoHtml` in
 * `src/components/admin/WelcomeEmailSection.tsx` so admin previews
 * match the sent email.
 */
const defaultBrandLogoHtml = (_fromName, _tpl, headerAlign) => {
  const tableAlign = headerAlign === "center" ? "center" : "left";
  const tableMargin = headerAlign === "center" ? "0 auto" : "0";
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${tableAlign}" style="border-collapse:collapse;margin:${tableMargin};">
          <tr>
            <td style="padding:0;line-height:0;font-size:0;">
              <img src="${DEFAULT_BRAND_LOGO_DATA_URI}" alt="C" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
            </td>
          </tr>
        </table>`;
};

const wrapWelcomeHtml = (welcome, contentHtml) => {
  const accent = isSafeColor(welcome.accentColor)
    ? welcome.accentColor
    : "#7a7468";
  const tpl = resolveTemplate(welcome);
  const headerAlign = resolveHeaderAlign(welcome);
  const fromName = escapeHtml(welcome.fromName || "Canvas Hub");
  const showLogo = welcome.showLogo !== false && welcome.logoUrl;
  const showBanner = Boolean(welcome.showBanner) && welcome.bannerUrl;
  // _logoSlot / _bannerSlot let the order-email renderer route uploads
  // through /api/welcome-asset/order-logo|order-banner so welcome and
  // order assets don't collide. Welcome callers don't set these and
  // fall through to the default "logo"/"banner" slots.
  const logoSlot = welcome._logoSlot || "logo";
  const logoSrc =
    showLogo && isSafeUrl(welcome.logoUrl)
      ? rehostEmailImage(welcome, logoSlot, welcome.logoUrl)
      : "";
  const bannerSlot = welcome._bannerSlot || "banner";
  const bannerSrc =
    showBanner && isSafeUrl(welcome.bannerUrl)
      ? rehostEmailImage(welcome, bannerSlot, welcome.bannerUrl)
      : "";
  // When a hero banner is present (the banner image typically already
  // includes the wordmark / branding), suppress the small logo block
  // above it. Otherwise we end up stacking a tiny redundant logo on
  // top of the full brand banner — which looked wrong in the wild
  // (small black "C" square hovering above the proper Canvas Hub
  // banner). The admin can still override by clearing the banner if
  // they want both visible.
  const headerHtml = bannerSrc
    ? ""
    : (() => {
        const logoInner = logoSrc
          ? `<img src="${escapeHtml(logoSrc)}" alt="${fromName}" style="max-height:48px;max-width:200px;display:${headerAlign === "center" ? "inline-block" : "block"};" />`
          : defaultBrandLogoHtml(fromName, tpl, headerAlign);
        return headerAlign === "center"
          ? `<div style="text-align:center;">${logoInner}</div>`
          : logoInner;
      })();
  const bannerHtml = bannerSrc
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(bannerSrc)}" alt="${fromName}" style="display:block;width:100%;max-width:560px;height:auto;" /></td></tr>`
    : "";
  const bodyFontStack = resolveBodyFont(welcome);
  const footerLinksHtml = buildFooterLinksHtml(welcome, accent);
  const footerTagline = String(
    welcome.footerTagline || "original Filipino paintings",
  ).trim();
  const footerTaglineHtml = footerTagline
    ? `&mdash; ${escapeHtml(footerTagline)}`
    : "";
  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${fromName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Playfair+Display:wght@400;500;600&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:24px;background:${tpl.pageBg};font-family:${bodyFontStack};color:${tpl.bodyColor};">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:${tpl.cardBg};border:${tpl.cardBorder};border-radius:${tpl.cardRadius};overflow:hidden;">
    ${
      headerHtml
        ? `<tr>
      <td style="padding:${tpl.headerPad};border-bottom:${tpl.headerSeparator};text-align:${headerAlign};">
        ${headerHtml}
      </td>
    </tr>`
        : ""
    }
    ${bannerHtml}
    <tr>
      <td style="padding:${tpl.contentPad};font-size:14px;line-height:1.6;color:${tpl.bodyColor};font-family:${bodyFontStack};">
        ${contentHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:${tpl.footerPad};border-top:${tpl.footerSeparator};font-size:11px;color:${accent};text-align:${headerAlign};">
        ${footerLinksHtml}
        <span style="font-family:'EB Garamond',Georgia,'Playfair Display',serif;font-style:italic;font-size:14px;letter-spacing:0.02em;color:#c4a86a;">${fromName}</span> ${footerTaglineHtml}
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
};

const ctaButtonHtml = (welcome) => {
  const label = String(welcome.ctaLabel || "").trim();
  const url = String(welcome.ctaUrl || "").trim();
  if (!label || !url || !isSafeUrl(url)) return "";
  const primary = isSafeColor(welcome.primaryColor)
    ? welcome.primaryColor
    : "#1c1c1c";
  const buttonStyle = String(welcome.buttonStyle || "filled").toLowerCase();
  const link = renderActionLink({ label, url, primary, style: buttonStyle });
  return `<p style="margin:24px 0;">${link}</p>`;
};

const buildTemplateVars = (user) => {
  const email = String(user?.email || "");
  const name = String(user?.name || "").trim();
  const firstName = name.split(/\s+/)[0] || name || email.split("@")[0] || "";
  return { name: name || firstName, firstName, email };
};

const formatPromoDescription = (promo) => {
  if (!promo) return "";
  switch (promo.type) {
    case "percent":
      return `${promo.value}% off`;
    case "fixed":
    case "flat":
      return `${formatPHP(promo.value)} off`;
    case "free_shipping":
      return "Free shipping";
    default:
      return "";
  }
};

const productThumbnailUrl = (product) => {
  if (!product) return "";
  if (Array.isArray(product.images) && product.images[0]?.url) {
    return String(product.images[0].url);
  }
  if (typeof product.image === "string") return product.image;
  return "";
};

/**
 * Render a small round profile photo + sender label inside the email body
 * (above the signature) so the message feels personal even when the inbox
 * client doesn't show the Gravatar avatar yet. Skipped entirely when the
 * admin hasn't uploaded an avatar or has hidden it.
 */
const buildAvatarHtml = (welcome) => {
  if (!welcome) return "";
  if (welcome.showAvatar !== true) return "";
  // Only render the in-body avatar block when the admin has explicitly
  // uploaded a profile photo. The C-mark fallback was removed — the brand
  // "C" lives in the Gmail sender Gravatar instead.
  if (!welcome.avatarUrl || !isSafeUrl(welcome.avatarUrl)) return "";
  const name = escapeHtml(
    String(welcome.avatarName || welcome.fromName || "Canvas Hub team").trim(),
  );
  const fromEmail = escapeHtml(String(welcome.fromEmail || "").trim());
  const avatarSrc = escapeHtml(
    rehostEmailImage(welcome, "avatar", welcome.avatarUrl),
  );
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:28px;">
      <tr>
        <td valign="middle" style="padding:0 12px 0 0;line-height:0;">
          <img src="${avatarSrc}" alt="${name}" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:9999px;object-fit:cover;border:1px solid #efece4;" />
        </td>
        <td valign="middle" style="font-size:13px;color:#1c1c1c;line-height:1.4;">
          <div style="font-weight:500;">${name}</div>
          <div style="color:#7a7468;font-size:12px;">${fromEmail}</div>
        </td>
      </tr>
    </table>`;
};

// Resolve the thumbnail src + click destination for one row of the email
// "products" grid. Storefront products link to the public product page;
// email-only custom uploads link to /preview/<id> on the storefront.
const productEmailRow = (welcome, item) => {
  const baseUrl = resolveBaseUrl(welcome);
  const isCustom = item && item.__custom === true;
  if (isCustom) {
    const id = String(item.id || "");
    const rawImg = String(item.imageUrl || "");
    return {
      img: rehostEmailImage(
        welcome,
        `custom/${encodeURIComponent(id)}`,
        rawImg,
      ),
      title: String(item.title || "Untitled"),
      link: `${baseUrl}/preview/${encodeURIComponent(id)}`,
      price: Number(item.price) || 0,
      description: String(item.description || ""),
    };
  }
  const id = String(item?.id || "");
  const rawImg = productThumbnailUrl(item);
  const price =
    item && item.salePrice && item.salePrice > 0 ? item.salePrice : item?.price;
  return {
    img: rehostEmailImage(welcome, `product/${encodeURIComponent(id)}`, rawImg),
    title: String(item?.title || "Untitled"),
    link: `${baseUrl}/product/${encodeURIComponent(id)}`,
    price: Number(price) || 0,
    description: "",
  };
};

const buildProductsHtml = (welcome, products) => {
  const cfg = welcome?.products;
  if (!cfg || cfg.enabled === false) return "";
  const list = Array.isArray(products) ? products.slice(0, cfg.count || 4) : [];
  if (list.length === 0) return "";
  const heading = escapeHtml(cfg.sectionTitle || "A glimpse of the collection");
  // Layout decision:
  //   - 1 item   → single full-width card.
  //   - 2 items  → 2-up grid (50% / 50%).
  //   - 3 items  → 3-up grid (33% / 33% / 33%) so the row stays balanced
  //                and we don't end up with a stranded cell. On narrow
  //                clients the cells naturally wrap.
  //   - 4+ items → 2-up grid; counts always pair cleanly.
  // Email clients are notoriously inconsistent about CSS grid / flex,
  // so we stick with `<table>` + percentage widths (the email-safe
  // pattern) rather than reaching for grid.
  const columns = list.length === 3 ? 3 : list.length === 1 ? 1 : 2;
  const cellWidth = `${Math.floor(100 / columns)}%`;
  const renderCell = (item) => {
    if (!item) return `<td style="width:${cellWidth};padding:6px;"></td>`;
    const row = productEmailRow(welcome, item);
    const title = escapeHtml(row.title);
    // Explicit `width` and `height` on the <img> tag ensure Gmail
    // mobile (which strips most CSS) still reserves space for the
    // image. The placeholder div uses a fixed pixel height for the
    // same reason — `aspect-ratio` is not supported in Gmail.
    const safeImg =
      row.img && isSafeUrl(row.img)
        ? `<img src="${escapeHtml(row.img)}" alt="${title}" width="240" style="display:block;width:100%;max-width:100%;height:auto;border-radius:4px;border:1px solid #efece4;" />`
        : `<div style="width:100%;height:160px;border-radius:4px;border:1px solid #efece4;background:#f5f3ee;"></div>`;
    const priceLine =
      cfg.showPrice && row.price > 0
        ? `<div style="margin-top:4px;font-size:12px;color:#7a7468;">${formatPHP(row.price)}</div>`
        : "";
    const descLine = row.description
      ? `<div style="margin-top:4px;font-size:12px;color:#7a7468;line-height:1.4;">${escapeHtml(row.description)}</div>`
      : "";
    return `<td valign="top" style="padding:6px;width:${cellWidth};"><a href="${row.link}" style="text-decoration:none;color:inherit;display:block;">${safeImg}<div style="margin-top:8px;font-size:13px;color:#1c1c1c;line-height:1.35;">${title}</div>${priceLine}${descLine}</a></td>`;
  };
  const rows = [];
  for (let i = 0; i < list.length; i += columns) {
    const cells = [];
    for (let c = 0; c < columns; c += 1) {
      cells.push(renderCell(list[i + c]));
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `
    <h3 style="margin:32px 0 12px;font-family:'Playfair Display',Georgia,serif;font-size:18px;color:#1c1c1c;">${heading}</h3>
    <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:0;">
      ${rows.join("")}
    </table>
  `;
};

const formatExpiryLabel = (iso) => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const buildDiscountHtml = (welcome, discount) => {
  if (!discount || !discount.code) return "";
  const primary = isSafeColor(welcome.primaryColor)
    ? welcome.primaryColor
    : "#1c1c1c";
  const accent = isSafeColor(welcome.accentColor)
    ? welcome.accentColor
    : "#7a7468";
  const headline = escapeHtml(discount.headline || "Your welcome gift");
  const description = escapeHtml(discount.description || "");
  const code = escapeHtml(discount.code);
  const expiry = formatExpiryLabel(discount.expiresAt || "");
  const expiryLine = expiry
    ? `<div style="margin-top:6px;font-size:11px;color:${accent};">Use before ${escapeHtml(expiry)}.</div>`
    : "";
  return `
    <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:0;margin:24px 0;">
      <tr>
        <td style="background:${primary};padding:18px 20px;border-radius:6px;color:#ffffff;text-align:center;">
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:16px;letter-spacing:0.04em;">${headline}</div>
          ${description ? `<div style="margin-top:4px;font-size:13px;opacity:0.92;">${description}</div>` : ""}
          <div style="margin-top:12px;display:inline-block;padding:8px 14px;border:1px dashed rgba(255,255,255,0.55);border-radius:4px;font-family:'Courier New',monospace;font-size:18px;letter-spacing:0.18em;">${code}</div>
          ${expiryLine}
        </td>
      </tr>
    </table>
  `;
};

const formatDiscountText = (discount) => {
  if (!discount || !discount.code) return "";
  const lines = [discount.headline || "Your welcome gift"];
  if (discount.description) lines.push(discount.description);
  lines.push(`Code: ${discount.code}`);
  const expiry = formatExpiryLabel(discount.expiresAt || "");
  if (expiry) lines.push(`Use before ${expiry}.`);
  return `\n\n${lines.join("\n")}`;
};

const formatProductsText = (welcome, products) => {
  const cfg = welcome?.products;
  if (!cfg || cfg.enabled === false) return "";
  const list = Array.isArray(products) ? products.slice(0, cfg.count || 4) : [];
  if (list.length === 0) return "";
  const lines = [`\n\n${cfg.sectionTitle || "A glimpse of the collection"}:`];
  for (const item of list) {
    const row = productEmailRow(welcome, item);
    const price =
      cfg.showPrice && row.price > 0 ? ` — ${formatPHP(row.price)}` : "";
    lines.push(`• ${row.title}${price}`);
  }
  return lines.join("\n");
};

/**
 * Build the welcome email subject/html/text from the admin-edited template.
 * Templates may include {{name}}, {{firstName}}, {{email}} placeholders.
 *
 * Optional `context` carries pre-resolved data:
 *   - products[]: products to render in the "glimpse" grid
 *   - discount:   { headline, code, description, expiresAt } already resolved
 *                 from either a linked promo code or the inline draft.
 */
export const buildWelcomeEmail = async (welcome, user, context = {}) => {
  // Pre-rehost admin-uploaded images so the React Email pipeline always
  // receives plain HTTPS URLs (Gmail / Outlook strip data: URLs).
  const config = {
    ...prepareReactChromeConfig(welcome, "welcome"),
    avatarUrl: rehostEmailImage(welcome, "avatar", welcome?.avatarUrl),
  };
  const products = prepareReactWelcomeProducts(welcome, context.products);
  const rendered = await reactRenderWelcomeEmail({
    config,
    user: user || { email: "" },
    discount: context.discount || null,
    products,
  });
  return rendered;
};

/**
 * Pull the products that should appear in the welcome email based on the
 * configured mode (`auto` = newest first, `manual` = the explicit id list).
 * Skips products marked as draft so unfinished listings aren't promoted.
 */
export const loadWelcomeEmailProducts = async (welcomeProducts) => {
  if (!welcomeProducts || welcomeProducts.enabled === false) return [];
  const count = Math.max(1, Math.min(8, Number(welcomeProducts.count) || 4));
  // Custom mode is fully self-contained — items live in the welcomeEmail
  // doc itself, so there's no KV lookup to do. Tag each row with __custom
  // so the renderer knows to point clicks at /preview/<id>.
  if (welcomeProducts.mode === "custom") {
    return (welcomeProducts.customItems || [])
      .filter((it) => it && (it.imageUrl || it.title))
      .slice(0, count)
      .map((it) => ({ ...it, __custom: true }));
  }
  try {
    const store = getStore("products");
    const all = await store.get("all-products", { type: "json" });
    if (!Array.isArray(all)) return [];
    const visible = all.filter((p) => p && p.availability !== "draft");
    if (welcomeProducts.mode === "manual") {
      const byId = new Map(visible.map((p) => [p.id, p]));
      return (welcomeProducts.manualIds || [])
        .map((id) => byId.get(id))
        .filter(Boolean)
        .slice(0, count);
    }
    return [...visible]
      .sort(
        (a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0),
      )
      .slice(0, count);
  } catch {
    return [];
  }
};

/**
 * Resolve the welcome-email discount for an outgoing message. Returns null
 * when nothing should be rendered (disabled, missing data, expired linked
 * promo, etc.) so the renderer can simply skip the section.
 */
export const resolveWelcomeEmailDiscount = async (welcomeDiscount) => {
  if (!welcomeDiscount || welcomeDiscount.enabled === false) return null;
  if (welcomeDiscount.source === "inline") {
    if (!welcomeDiscount.inlineCode) return null;
    return {
      headline: welcomeDiscount.inlineHeadline,
      code: welcomeDiscount.inlineCode,
      description: welcomeDiscount.inlineDescription,
      expiresAt: welcomeDiscount.inlineExpiresAt || "",
    };
  }
  // Linked: look up the configured promo code in the storefront-config doc.
  if (!welcomeDiscount.linkedCode) return null;
  try {
    const store = getStore("storefront-config");
    const raw = await store.get("config", { type: "json" });
    const promos = Array.isArray(raw?.promoCodes) ? raw.promoCodes : [];
    const promo = promos.find(
      (p) =>
        p &&
        p.enabled !== false &&
        String(p.code || "").toUpperCase() ===
          String(welcomeDiscount.linkedCode).toUpperCase(),
    );
    if (!promo) return null;
    if (promo.expiresAt) {
      const t = Date.parse(promo.expiresAt);
      if (Number.isFinite(t) && t < Date.now()) return null;
    }
    if (
      typeof promo.usageLimit === "number" &&
      promo.usageLimit > 0 &&
      typeof promo.usageCount === "number" &&
      promo.usageCount >= promo.usageLimit
    ) {
      return null;
    }
    return {
      headline: "Your welcome gift",
      code: promo.code,
      description: promo.description || formatPromoDescription(promo),
      expiresAt: promo.expiresAt || "",
    };
  } catch {
    return null;
  }
};

/**
 * Load the welcomeEmail subtree from the storefront-config KV. Returns null
 * when the binding or the doc isn't there yet so callers can no-op cleanly.
 */
export const loadWelcomeEmailConfig = async () => {
  try {
    const store = getStore("storefront-config");
    const raw = await store.get("config", { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    if (!raw.welcomeEmail || typeof raw.welcomeEmail !== "object") return null;
    return raw.welcomeEmail;
  } catch {
    return null;
  }
};

/**
 * Send the configured welcome email to a single recipient. Resolves to a
 * skipped result when the welcome email is disabled or no transport is
 * configured, so callers can ignore the return value safely.
 */
export const sendWelcomeEmail = async ({ welcome, user, override }) => {
  const recipient = override?.to || user?.email;
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "no recipient" };
  }
  if (!welcome || welcome.enabled === false) {
    return { delivered: false, skipped: true, reason: "disabled" };
  }
  if (!isEmailConfigured()) {
    return { delivered: false, skipped: true, reason: "not configured" };
  }
  const [products, discount] = await Promise.all([
    loadWelcomeEmailProducts(welcome.products),
    resolveWelcomeEmailDiscount(welcome.discount),
  ]);
  const built = await buildWelcomeEmail(welcome, user || { email: recipient }, {
    products,
    discount,
  });
  if (override?.subjectPrefix) {
    built.subject = `${override.subjectPrefix}${built.subject}`;
  }
  const result = await sendEmail({
    to: recipient,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });
  logNotification("email", "welcome", recipient, null, result);
  return result;
};
