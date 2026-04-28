/**
 * Outbound email helper for the Canvas Hub storefront.
 *
 * Selects a provider based on env vars at call time:
 *   - RESEND_API_KEY  -> Resend (https://resend.com)
 *   - BREVO_API_KEY   -> Brevo  (https://developers.brevo.com)
 *
 * EMAIL_FROM (e.g. "Canvas Hub <orders@pintaterra.com>") is required when a
 * provider is configured. EMAIL_REPLY_TO is optional. EMAIL_BCC is optional.
 *
 * If no key is configured, sendEmail() resolves to
 *   { delivered: false, skipped: true, reason: "not configured" }
 * so callers can still record their notification entry without crashing.
 */

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
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.BREVO_API_KEY) return "brevo";
  return null;
};

export const isEmailConfigured = () =>
  Boolean(getEmailProvider()) && Boolean(process.env.EMAIL_FROM);

async function sendViaResend({ from, to, subject, html, text, replyTo, bcc }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
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
      "api-key": process.env.BREVO_API_KEY,
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
  const from = process.env.EMAIL_FROM;
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
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
      bcc: process.env.EMAIL_BCC || undefined,
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
