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
 * If no key is configured, sendEmail() resolves to
 *   { delivered: false, skipped: true, reason: "not configured" }
 * so callers can still record their notification entry without crashing.
 */

import { getCloudflareEnv } from "./context.js";
import { getStore } from "./kv-stores.js";

const envOf = (name) => getCloudflareEnv()[name] || "";

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

export const isEmailConfigured = () =>
  Boolean(getEmailProvider()) && Boolean(envOf("EMAIL_FROM"));

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

export const sendEmail = async ({ to, subject, html, text }) => {
  if (!to || !subject) {
    return { delivered: false, skipped: true, reason: "missing fields" };
  }
  const providerKey = getEmailProvider();
  if (!providerKey) {
    return { delivered: false, skipped: true, reason: "not configured" };
  }
  const from = envOf("EMAIL_FROM");
  if (!from) {
    return {
      delivered: false,
      skipped: true,
      reason: "EMAIL_FROM not set",
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
      replyTo: envOf("EMAIL_REPLY_TO") || undefined,
      bcc: envOf("EMAIL_BCC") || undefined,
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

const wrapHtml = (heading, bodyHtml) =>
  `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:24px;background:#f5f3ee;font-family:Inter,Helvetica,Arial,sans-serif;color:#1c1c1c;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e1d8;border-radius:6px;">
    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #efece4;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;letter-spacing:0.02em;color:#1c1c1c;">Canvas Hub</div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#7a7468;margin-top:4px;">${escapeHtml(heading)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;font-size:14px;line-height:1.6;color:#1c1c1c;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;border-top:1px solid #efece4;font-size:11px;color:#7a7468;">
        Canvas Hub &mdash; original Filipino paintings.
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

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

/**
 * Build subject + html + text for a given notification kind. `extra` may
 * include shipment / refund-specific values.
 */
export const buildOrderEmail = (kind, order, extra = {}) => {
  const id = escapeHtml(order.id || "");
  const name = escapeHtml(order.orderInfo?.fullName || "Collector");
  const itemsHtml = renderItemsTable(order.items);
  const totalsHtml = renderTotals(order);

  const trackUrl = extra.trackingUrl || extra.shipment?.trackingUrl;
  const courier = extra.courier || extra.shipment?.courier;
  const trackingNumber = extra.trackingNumber || extra.shipment?.trackingNumber;

  let subject;
  let heading;
  let intro;

  switch (kind) {
    case "confirmed":
      subject = `Order ${order.id} confirmed`;
      heading = "Order received";
      intro = `Hi ${name}, thanks for your order at Canvas Hub. We've recorded your payment and we're getting your painting${(order.items || []).length > 1 ? "s" : ""} ready.`;
      break;
    case "in_progress":
      subject = `Order ${order.id}: in progress`;
      heading = "Painting in progress";
      intro = `Good news ${name}! The artist has started working on your painting.`;
      break;
    case "out_for_delivery":
    case "shipped":
      subject = `Order ${order.id}: shipped`;
      heading = "Out for delivery";
      intro = `Hi ${name}, your order has shipped${courier ? ` via <strong>${escapeHtml(courier)}</strong>` : ""}${trackingNumber ? ` &mdash; tracking <code>${escapeHtml(trackingNumber)}</code>` : ""}.`;
      break;
    case "received":
      subject = `Order ${order.id}: received`;
      heading = "Order delivered";
      intro = `Hi ${name}, we've marked your order as received. We'd love to hear what you think &mdash; your review really helps other collectors.`;
      break;
    case "refund_requested":
      subject = `Refund initiated for ${order.id}`;
      heading = "Refund in progress";
      intro = `Hi ${name}, your refund of <strong>${formatPHP(extra.refundAmount ?? order.refund?.amount ?? 0)}</strong> is being processed and should land back in your QR Ph wallet shortly.`;
      break;
    case "refund_succeeded":
      subject = `Refund completed for ${order.id}`;
      heading = "Refund completed";
      intro = `Hi ${name}, your refund of <strong>${formatPHP(extra.refundAmount ?? order.refund?.amount ?? 0)}</strong> has been credited back. Thank you for your patience.`;
      break;
    case "refund_failed":
      subject = `Refund failed for ${order.id}`;
      heading = "Refund failed";
      intro = `Hi ${name}, unfortunately your refund could not be processed${
        extra.failureMessage ? `: ${escapeHtml(extra.failureMessage)}` : ""
      }. Please reply to this email and we'll sort it out manually.`;
      break;
    default:
      subject = `Update on order ${order.id}`;
      heading = "Order update";
      intro = extra.message
        ? escapeHtml(extra.message)
        : `Hi ${name}, there's an update on your order.`;
  }

  const trackingBlock =
    trackUrl && trackingNumber
      ? `
    <p style="margin:16px 0;">
      <a href="${trackUrl}" style="display:inline-block;padding:10px 18px;background:#1c1c1c;color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;border-radius:4px;">
        Track shipment
      </a>
    </p>`
      : "";

  const bodyHtml = `
    <p style="margin:0 0 12px;">${intro}</p>
    <p style="margin:0 0 12px;color:#7a7468;font-size:12px;letter-spacing:0.05em;">Order ${id}</p>
    ${itemsHtml}
    ${totalsHtml}
    ${trackingBlock}
    <p style="margin:24px 0 0;font-size:12px;color:#7a7468;">
      Questions? Just reply to this email.
    </p>
  `;

  const text = stripTags(
    `${heading}\n\n${intro}\n\nOrder ${id}\nTotal ${formatPHP(order.total)}${trackUrl ? `\nTrack: ${trackUrl}` : ""}`,
  );

  return { subject, html: wrapHtml(heading, bodyHtml), text };
};

/**
 * Convenience wrapper around buildOrderEmail + sendEmail. Returns a value
 * suitable for stamping onto a notification record.
 */
export const sendOrderEmail = async ({ kind, order, extra }) => {
  const recipient = order?.orderInfo?.email;
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "no recipient" };
  }
  const built = buildOrderEmail(kind, order, extra || {});
  return await sendEmail({
    to: recipient,
    subject: built.subject,
    html: built.html,
    text: built.text,
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

/**
 * Render the default Canvas Hub wordmark when no custom logo has been
 * uploaded. Just the italic gold wordmark — the brand "C" lives in the
 * Gmail sender profile picture (Gravatar), not inside the email body.
 */
const defaultBrandLogoHtml = (fromName) =>
  `<div style="font-family:'EB Garamond',Georgia,'Playfair Display',serif;font-style:italic;font-size:28px;letter-spacing:0.02em;color:#c4a86a;">${fromName}</div>`;

const wrapWelcomeHtml = (welcome, contentHtml) => {
  const primary = isSafeColor(welcome.primaryColor)
    ? welcome.primaryColor
    : "#1c1c1c";
  const accent = isSafeColor(welcome.accentColor)
    ? welcome.accentColor
    : "#7a7468";
  const fromName = escapeHtml(welcome.fromName || "Canvas Hub");
  const showLogo = welcome.showLogo !== false && welcome.logoUrl;
  const showBanner = Boolean(welcome.showBanner) && welcome.bannerUrl;
  const logoSrc =
    showLogo && isSafeUrl(welcome.logoUrl)
      ? rehostEmailImage(welcome, "logo", welcome.logoUrl)
      : "";
  const logoHtml = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="${fromName}" style="max-height:48px;max-width:200px;display:block;" />`
    : defaultBrandLogoHtml(fromName);
  const bannerSrc =
    showBanner && isSafeUrl(welcome.bannerUrl)
      ? rehostEmailImage(welcome, "banner", welcome.bannerUrl)
      : "";
  const bannerHtml = bannerSrc
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(bannerSrc)}" alt="" style="display:block;width:100%;max-width:560px;height:auto;" /></td></tr>`
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
<body style="margin:0;padding:24px;background:#f5f3ee;font-family:${bodyFontStack};color:#1c1c1c;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e1d8;border-radius:6px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #efece4;">
        ${logoHtml}
      </td>
    </tr>
    ${bannerHtml}
    <tr>
      <td style="padding:24px 28px;font-size:14px;line-height:1.6;color:${primary};font-family:${bodyFontStack};">
        ${contentHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;border-top:1px solid #efece4;font-size:11px;color:${accent};">
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
  return `
    <p style="margin:24px 0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:${primary};color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;border-radius:4px;">
        ${escapeHtml(label)}
      </a>
    </p>`;
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
  const renderCell = (item) => {
    if (!item) return `<td style="width:50%;padding:6px;"></td>`;
    const row = productEmailRow(welcome, item);
    const title = escapeHtml(row.title);
    // row.img has already been routed through rehostEmailImage so any
    // data: URL has been replaced with a public /api/welcome-asset/...
    // URL Gmail can fetch.
    const safeImg =
      row.img && isSafeUrl(row.img)
        ? `<img src="${escapeHtml(row.img)}" alt="${title}" style="display:block;width:100%;height:auto;border-radius:4px;border:1px solid #efece4;" />`
        : `<div style="width:100%;aspect-ratio:1/1;border-radius:4px;border:1px solid #efece4;background:#f5f3ee;"></div>`;
    const priceLine =
      cfg.showPrice && row.price > 0
        ? `<div style="margin-top:4px;font-size:12px;color:#7a7468;">${formatPHP(row.price)}</div>`
        : "";
    const descLine = row.description
      ? `<div style="margin-top:4px;font-size:12px;color:#7a7468;line-height:1.4;">${escapeHtml(row.description)}</div>`
      : "";
    return `<td valign="top" style="padding:6px;width:50%;"><a href="${row.link}" style="text-decoration:none;color:inherit;display:block;">${safeImg}<div style="margin-top:8px;font-size:13px;color:#1c1c1c;line-height:1.35;">${title}</div>${priceLine}${descLine}</a></td>`;
  };
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(`<tr>${renderCell(list[i])}${renderCell(list[i + 1])}</tr>`);
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

  const paragraphsHtml = bodyText
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(para)}</p>`,
    )
    .join("");

  const signatureHtml = signature
    ? `<p style="margin:24px 0 0;color:#7a7468;font-size:13px;white-space:pre-line;">${escapeHtml(signature)}</p>`
    : "";

  const avatarHtml = buildAvatarHtml(welcome);

  const productsHtml = buildProductsHtml(welcome, context.products);
  const discountHtml = buildDiscountHtml(welcome, context.discount);

  const contentHtml = `
    ${paragraphsHtml}
    ${discountHtml}
    ${productsHtml}
    ${ctaButtonHtml(welcome)}
    ${avatarHtml}
    ${signatureHtml}
  `;

  const text =
    `${bodyText}` +
    formatDiscountText(context.discount) +
    formatProductsText(welcome, context.products) +
    (signature ? `\n\n${signature}` : "") +
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
