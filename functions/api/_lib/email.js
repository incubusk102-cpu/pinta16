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

const envOf = (name) => getCloudflareEnv()[name] || "";

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

async function sendViaResend({ from, to, subject, html, text, replyTo, bcc }) {
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

async function sendViaBrevo({ from, to, subject, html, text, replyTo, bcc }) {
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
  try {
    return await provider.send({
      from,
      to,
      subject,
      html,
      text: text || stripTags(html),
      replyTo: resolveEmailEnv("REPLY_TO", purpose) || undefined,
      bcc: resolveEmailEnv("BCC", purpose) || undefined,
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

const renderItemsTable = (items = []) => {
  if (!items.length) return "";
  const rows = items
    .map(
      (i) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#1c1c1c;">
            ${escapeHtml(i.title)} <span style="color:#7a7468;">&times; ${
              Number(i.quantity) || 1
            }</span>
          </td>
          <td style="padding:8px 0;font-size:13px;text-align:right;color:#1c1c1c;">
            ${formatPHP((Number(i.price) || 0) * (Number(i.quantity) || 1))}
          </td>
        </tr>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" style="border-top:1px solid #efece4;border-bottom:1px solid #efece4;margin:16px 0;">
      ${rows}
    </table>
  `;
};

const renderTotals = (order) => `
  <table role="presentation" width="100%" style="font-size:13px;">
    <tr><td style="color:#7a7468;">Subtotal</td><td style="text-align:right;">${formatPHP(order.subtotal)}</td></tr>
    ${
      order.shippingFee
        ? `<tr><td style="color:#7a7468;">Shipping</td><td style="text-align:right;">${formatPHP(order.shippingFee)}</td></tr>`
        : ""
    }
    ${
      order.discount
        ? `<tr><td style="color:#7a7468;">Discount${order.voucherCode ? ` (${escapeHtml(order.voucherCode)})` : ""}</td><td style="text-align:right;">- ${formatPHP(order.discount)}</td></tr>`
        : ""
    }
    <tr><td style="padding-top:8px;font-weight:600;">Total</td><td style="padding-top:8px;text-align:right;font-weight:600;">${formatPHP(order.total)}</td></tr>
  </table>
`;

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
 */
export const buildOrderEmail = (kind, order, extra = {}, orderEmail = null) => {
  const id = String(order.id || "");
  const fullName =
    String(order.orderInfo?.fullName || "").trim() || "Collector";
  const firstName = fullName.split(/\s+/)[0] || fullName;
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const itemPlural = itemCount > 1 ? "s" : "";
  const totalFormatted = formatPHP(order.total);

  const trackUrl = extra.trackingUrl || extra.shipment?.trackingUrl || "";
  const courier = extra.courier || extra.shipment?.courier || "";
  const trackingNumber =
    extra.trackingNumber || extra.shipment?.trackingNumber || "";
  const refundAmountRaw = extra.refundAmount ?? order.refund?.amount ?? 0;
  const refundAmount = formatPHP(refundAmountRaw);
  const failureMessage = extra.failureMessage
    ? `: ${extra.failureMessage}`
    : "";

  const vars = {
    name: fullName,
    firstName,
    orderId: id,
    total: totalFormatted,
    itemCount: String(itemCount),
    itemPlural,
    courier,
    trackingNumber,
    refundAmount,
    failureMessage,
  };

  const tpl = resolveOrderKindConfig(orderEmail, kind);

  const subject = substituteOrderTemplate(tpl.subject, vars);
  const heading = substituteOrderTemplate(tpl.heading, vars);
  const introHtml = renderOrderIntroHtml(tpl.intro, vars);

  const itemsHtml = renderItemsTable(order.items);
  const totalsHtml = renderTotals(order);

  // Auto-rendered shipment line for out_for_delivery (and any kind that
  // happens to have shipment data attached). Sits between the intro and
  // the items table so admins don't need to bake it into every kind's
  // intro template.
  const shipmentLine =
    courier || trackingNumber
      ? `<p style="margin:0 0 12px;color:#7a7468;font-size:13px;">${
          courier ? `Shipped via <strong>${escapeHtml(courier)}</strong>` : ""
        }${courier && trackingNumber ? " &mdash; " : ""}${
          trackingNumber
            ? `tracking <code>${escapeHtml(trackingNumber)}</code>`
            : ""
        }.</p>`
      : "";

  // Shared chrome: track-shipment button (out_for_delivery only). Uses
  // the admin-edited button label + button style; falls back to a black
  // pill when no orderEmail config is loaded.
  const trackButtonText =
    (orderEmail && typeof orderEmail.trackButtonText === "string"
      ? orderEmail.trackButtonText
      : "") || "Track shipment";
  const buttonStyle = String(orderEmail?.buttonStyle || "filled").toLowerCase();
  const primary = isSafeColor(orderEmail?.primaryColor)
    ? orderEmail.primaryColor
    : "#1c1c1c";
  const trackingBlock =
    trackUrl && isSafeUrl(trackUrl)
      ? `<p style="margin:16px 0;">${renderActionLink({
          label: trackButtonText,
          url: trackUrl,
          primary,
          style: buttonStyle,
        })}</p>`
      : "";

  // Surface a "Write a review" CTA on the delivered (`received`) email
  // so customers don't have to remember to come back to leave a rating.
  // The existing reviewButtonText config (admin-editable, sanitized in
  // storefront-config.js) was previously stored but never rendered;
  // this block plumbs it through. Deep-links into /account?track=<id>
  // so OrderTracker auto-loads the order and shows the review form.
  const reviewButtonText =
    (orderEmail && typeof orderEmail.reviewButtonText === "string"
      ? orderEmail.reviewButtonText
      : "") || "Write a review";
  const reviewUrl = kind === "received" ? buildOrderTrackUrl(id) : "";
  const reviewBlock =
    reviewUrl && isSafeUrl(reviewUrl)
      ? `<p style="margin:16px 0;">${renderActionLink({
          label: reviewButtonText,
          url: reviewUrl,
          primary,
          style: buttonStyle,
        })}</p>`
      : "";

  // Section divider (admin-tunable). Mirrors the welcome email's chrome
  // so order + welcome can share a visual identity.
  const accent = isSafeColor(orderEmail?.accentColor)
    ? orderEmail.accentColor
    : "#7a7468";
  const divider = sectionDividerHtml(orderEmail || {}, accent);

  const bodyHtml = `
    ${introHtml}
    <p style="margin:0 0 12px;color:${accent};font-size:12px;letter-spacing:0.05em;">Order ${escapeHtml(id)}</p>
    ${shipmentLine}
    ${divider}
    ${itemsHtml}
    ${totalsHtml}
    ${trackingBlock}
    ${reviewBlock}
    <p style="margin:24px 0 0;font-size:12px;color:${accent};">
      Questions? Just reply to this email.
    </p>
  `;

  const introText = stripTags(introHtml);
  const text = stripTags(
    `${heading}\n\n${introText}\n\nOrder ${id}\nTotal ${totalFormatted}${
      trackUrl ? `\nTrack: ${trackUrl}` : ""
    }`,
  );

  // Always render through the shared branded chrome (logo / banner /
  // palette / template / footer links). When no admin config is saved we
  // use sensible defaults so order emails look professional out of the
  // box — never fall back to the plain-text wrapper.
  const effectiveConfig = orderEmail || DEFAULT_ORDER_CHROME;
  const html = wrapWelcomeHtml(
    {
      ...effectiveConfig,
      // Route order-channel uploads through dedicated asset slots so
      // they don't collide with welcome's logo/banner.
      _logoSlot: "order-logo",
      _bannerSlot: "order-banner",
    },
    bodyHtml,
  );

  return { subject, html, text };
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
  const built = buildOrderEmail(kind, order, extra || {}, orderEmail);
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
  return await sendEmail({
    to: recipient,
    subject: built.subject,
    html: built.html,
    text: built.text,
    purpose: "order",
    from: configFrom || undefined,
  });
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
  const built = buildOrderEmail(
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
  const id = String(order?.id || "");
  const customer =
    String(order?.orderInfo?.fullName || "").trim() || "Anonymous guest";
  const customerEmail = String(order?.orderInfo?.email || "").trim();
  const customerPhone = String(order?.orderInfo?.phone || "").trim();
  const total = formatPHP(order?.total);
  const itemCount = Array.isArray(order?.items) ? order.items.length : 0;
  const itemPlural = itemCount === 1 ? "" : "s";
  const itemRows = (order?.items || [])
    .slice(0, 20)
    .map(
      (it) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #efece4;">${escapeHtml(
          it.title || "Item",
        )} &times; ${Number(it.quantity) || 1}</td><td style="padding:6px 8px;border-bottom:1px solid #efece4;text-align:right;">${formatPHP(
          (Number(it.price) || 0) * (Number(it.quantity) || 1),
        )}</td></tr>`,
    )
    .join("");
  const subject = `New order ${id} — ${total}`;
  const adminLink = `${PUBLIC_SITE_ORIGIN}/admin?order=${encodeURIComponent(id)}`;

  // Resolve the same chrome the customer-facing order emails use so the
  // admin alert lands in the inbox with matching logo / palette / fonts /
  // footer. Previously this rendered through the legacy plain wrapHtml
  // wrapper and looked visually disconnected from the customer copy that
  // arrived seconds later.
  const effectiveConfig = orderEmail || DEFAULT_ORDER_CHROME;
  const accent = isSafeColor(effectiveConfig.accentColor)
    ? effectiveConfig.accentColor
    : "#7a7468";
  const primary = isSafeColor(effectiveConfig.primaryColor)
    ? effectiveConfig.primaryColor
    : "#1c1c1c";
  const buttonStyle = String(
    effectiveConfig.buttonStyle || "filled",
  ).toLowerCase();
  const adminButton = renderActionLink({
    label: "Open in admin",
    url: adminLink,
    primary,
    style: buttonStyle,
  });

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${accent};">New order received</p>
    <p style="margin:0 0 12px;">A new order just came in.</p>
    <p style="margin:0 0 4px;"><strong>Order:</strong> <code style="background:#f5f3ee;padding:2px 6px;border-radius:3px;">${escapeHtml(id)}</code></p>
    <p style="margin:0 0 4px;"><strong>Customer:</strong> ${escapeHtml(customer)}</p>
    ${customerEmail ? `<p style="margin:0 0 4px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(customerEmail)}" style="color:${primary};">${escapeHtml(customerEmail)}</a></p>` : ""}
    ${customerPhone ? `<p style="margin:0 0 4px;"><strong>Phone:</strong> ${escapeHtml(customerPhone)}</p>` : ""}
    <p style="margin:0 0 12px;"><strong>Items:</strong> ${itemCount} item${itemPlural} &middot; <strong>Total:</strong> ${total}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;color:${primary};margin:0 0 16px;">
      ${itemRows}
    </table>
    <p style="margin:16px 0;">${adminButton}</p>
  `;

  const html = wrapWelcomeHtml(
    {
      ...effectiveConfig,
      _logoSlot: "order-logo",
      _bannerSlot: "order-banner",
    },
    bodyHtml,
  );

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

  return await sendEmail({
    to: recipient,
    subject,
    html,
    text:
      `New order ${id}\n\n` +
      `Customer: ${customer}\n` +
      (customerEmail ? `Email: ${customerEmail}\n` : "") +
      (customerPhone ? `Phone: ${customerPhone}\n` : "") +
      `Items: ${itemCount}\n` +
      `Total: ${total}\n\n` +
      `Open: ${adminLink}\n`,
    purpose: "order",
    from: configFrom || undefined,
  });
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

const isDataImageUrl = (value) =>
  typeof value === "string" && /^data:image\//i.test(value.trim());

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

// Quick non-cryptographic 32-bit hash → hex. Just enough entropy to
// bust Gmail's image proxy cache when an admin re-uploads the same
// slot, without pulling in crypto.subtle (which is async).
const shortHash = (input) => {
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Fold to 32-bit unsigned and hex-stringify.
  return (h >>> 0).toString(16).padStart(8, "0");
};

// Convert a data: image URL into a hosted /api/welcome-asset/<slot>
// URL that Gmail will actually fetch. Non-data URLs are returned
// untouched so admins who paste an HTTPS URL keep working.
const rehostEmailImage = (welcome, slot, value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (!isDataImageUrl(trimmed)) return trimmed;
  const base = resolveBaseUrl(welcome);
  const v = shortHash(trimmed);
  return `${base}/api/welcome-asset/${slot}?v=${v}`;
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

// Map a footer link "kind" (instagram, tiktok, mail, …) to the public
// PNG hosted under /public/email-icons. We use absolute URLs because
// most email clients won't load /relative paths and Gmail blocks data:
// image URIs.
const FOOTER_ICON_FILES = {
  instagram: "instagram.png",
  facebook: "facebook.png",
  tiktok: "tiktok.png",
  x: "x.png",
  twitter: "x.png",
  youtube: "youtube.png",
  pinterest: "pinterest.png",
  threads: "threads.png",
  mail: "mail.png",
  phone: "phone.png",
  globe: "globe.png",
  headphones: "headphones.png",
  custom: "custom.png",
};

const footerIconUrl = (welcome, kind) => {
  const file = FOOTER_ICON_FILES[kind] || FOOTER_ICON_FILES.custom;
  return `${resolveBaseUrl(welcome)}/email-icons/${file}`;
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

// Storefront URL for the baked-in brand C-logo PNG. Hosted on the
// Cloudflare Pages origin so every email client can fetch it without
// CORS / signature dance. Kept in sync with PUBLIC_SITE_ORIGIN above.
const DEFAULT_BRAND_LOGO_URL = `${PUBLIC_SITE_ORIGIN}/icon-512.png`;

/**
 * Render the baked-in brand identity for the email header — just the
 * gold "C" medallion sitting on the warm-black rounded square that
 * matches the storefront's icon.svg / icon-512.png. We do NOT render
 * the "Canvas Hub" wordmark or the EST. 2026 tagline anymore: the
 * brand is the C, full stop, identical to the storefront favicon /
 * PWA icon. Used everywhere a custom logoUrl hasn't been uploaded.
 *
 * Implementation: the canonical PNG is hosted at
 * `${PUBLIC_SITE_ORIGIN}/icon-512.png` (Cloudflare Pages, public, CDN-
 * cached, identical to the storefront brand mark). Email clients that
 * block remote images fall back to the alt text "C" — never the words
 * "Canvas Hub". `tpl` and `fromName` are accepted for back-compat
 * with the previous medallion+wordmark renderer; both are now
 * intentionally unused (the brand mark is template-agnostic and never
 * uses the configurable from-name as a wordmark).
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
              <img src="${DEFAULT_BRAND_LOGO_URL}" alt="C" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:12px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
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
export const buildWelcomeEmail = (welcome, user, context = {}) => {
  const vars = buildTemplateVars(user);
  const subject = renderTemplateString(welcome.subject, vars).slice(0, 240);
  const bodyText = renderTemplateString(welcome.body, vars);
  const signature = String(welcome.signature || "").trim();

  // Guard against the common authoring mistake where the body's last
  // paragraph already ends with the same sender line that's also stored
  // as the signature (e.g. body finishes with "The Canvas Hub team" and
  // signature is "The Canvas Hub team" — we'd otherwise render it
  // twice). Compare line-by-line, case-insensitive, after trimming.
  const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const signatureLines = signature.split(/\n+/).map(normalize).filter(Boolean);
  const bodyLines = bodyText.split(/\n+/).map(normalize).filter(Boolean);
  const signatureDuplicatesBody =
    signatureLines.length > 0 &&
    signatureLines.every((line) => bodyLines.includes(line));

  const paragraphsHtml = bodyText
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(para)}</p>`,
    )
    .join("");

  const signatureHtml =
    signature && !signatureDuplicatesBody
      ? `<p style="margin:24px 0 0;color:#7a7468;font-size:13px;white-space:pre-line;">${escapeHtml(signature)}</p>`
      : "";

  const avatarHtml = buildAvatarHtml(welcome);

  const productsHtml = buildProductsHtml(welcome, context.products);
  const discountHtml = buildDiscountHtml(welcome, context.discount);
  const ctaHtml = ctaButtonHtml(welcome);

  // Walk the section blocks in order, dropping empty ones, and join
  // with the configured divider (line / brush / none) between them.
  // This avoids stamping dividers above empty blocks (e.g. when the
  // discount or products section is disabled).
  const accentColor = isSafeColor(welcome.accentColor)
    ? welcome.accentColor
    : "#7a7468";
  const divider = sectionDividerHtml(welcome, accentColor);
  const blocks = [paragraphsHtml, discountHtml, productsHtml, ctaHtml].filter(
    (block) => block && block.trim(),
  );
  const sectionsHtml = divider ? blocks.join(divider) : blocks.join("");

  const contentHtml = `
    ${sectionsHtml}
    ${avatarHtml}
    ${signatureHtml}
  `;

  const text =
    `${bodyText}` +
    formatDiscountText(context.discount) +
    formatProductsText(welcome, context.products) +
    (signature && !signatureDuplicatesBody ? `\n\n${signature}` : "") +
    formatFooterLinksText(welcome);

  return {
    subject,
    html: wrapWelcomeHtml(welcome, contentHtml),
    text,
  };
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
  const built = buildWelcomeEmail(welcome, user || { email: recipient }, {
    products,
    discount,
  });
  if (override?.subjectPrefix) {
    built.subject = `${override.subjectPrefix}${built.subject}`;
  }
  return await sendEmail({
    to: recipient,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });
};
