// Tripwire email sent to the admin every time someone successfully logs
// in. The whole point is "I get an email about a login I didn't do →
// rotate password / disable 2FA / investigate" so the message is
// deliberately sparse and non-branded — it just needs to reach the inbox.
//
// Resolves the recipient in this order:
//   1. The configured `loginAlertEmail` from SECURITY_CONFIG (admin sets
//      it at /admin → Security).
//   2. ADMIN_RECIPIENT env var (already used by order alerts).
//   3. EMAIL_BCC env var.
// If none of those are configured, this is a no-op.

import { isEmailConfigured, resolveEmailEnv, sendEmail } from "./email.js";
import { getSecurityConfig } from "./security-config.js";

const escape = (input) =>
  String(input == null ? "" : input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sendAdminLoginAlert = async ({
  ip,
  country,
  userAgent,
  outcome = "success",
  detail = "",
} = {}) => {
  let cfg;
  try {
    cfg = await getSecurityConfig();
  } catch {
    cfg = null;
  }
  if (cfg && cfg.loginAlertEnabled === false) {
    return { delivered: false, skipped: true, reason: "alert disabled" };
  }
  const recipient =
    String(cfg?.loginAlertEmail || "").trim() ||
    String(resolveEmailEnv("ADMIN_RECIPIENT", "admin") || "").trim() ||
    String(resolveEmailEnv("BCC", "admin") || "").trim();
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "no recipient" };
  }
  if (!isEmailConfigured("admin")) {
    return { delivered: false, skipped: true, reason: "not configured" };
  }

  const when = new Date().toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "long",
  });
  const safeIp = escape(ip || "unknown");
  const safeCountry = escape(country || "");
  const safeUa = escape((userAgent || "").slice(0, 200));
  const safeDetail = escape(detail || "");
  const subject =
    outcome === "recovery"
      ? "Admin login (recovery code)"
      : outcome === "success"
        ? "Admin login"
        : `Admin login (${outcome})`;
  const html = `
    <p style="margin:0 0 12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1c1c1c;">
      A successful admin login just happened on Canvas Hub. If this was you,
      you can ignore this email.
    </p>
    <table style="width:100%;border-collapse:collapse;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#1c1c1c;">
      <tr><td style="padding:4px 8px;background:#f5f3ee;width:120px;"><strong>When</strong></td><td style="padding:4px 8px;">${escape(when)} (PHT)</td></tr>
      <tr><td style="padding:4px 8px;background:#f5f3ee;"><strong>IP</strong></td><td style="padding:4px 8px;font-family:monospace;">${safeIp}${safeCountry ? ` &middot; ${safeCountry}` : ""}</td></tr>
      <tr><td style="padding:4px 8px;background:#f5f3ee;"><strong>Browser</strong></td><td style="padding:4px 8px;font-family:monospace;font-size:11px;">${safeUa || "&mdash;"}</td></tr>
      ${safeDetail ? `<tr><td style="padding:4px 8px;background:#f5f3ee;"><strong>Note</strong></td><td style="padding:4px 8px;">${safeDetail}</td></tr>` : ""}
    </table>
    <p style="margin:16px 0 0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;color:#7a7468;">
      If this <strong>wasn&rsquo;t</strong> you: rotate the admin password
      immediately at /admin &rarr; Settings &rarr; Security, and review the
      Threat Dashboard for unfamiliar IPs.
    </p>
  `;
  const text =
    `Admin login on Canvas Hub\n\n` +
    `When: ${when} (PHT)\n` +
    `IP: ${ip || "unknown"}${country ? ` (${country})` : ""}\n` +
    (userAgent ? `Browser: ${userAgent}\n` : "") +
    (detail ? `Note: ${detail}\n` : "") +
    `\nIf this wasn't you, rotate the admin password immediately.\n`;

  return await sendEmail({
    to: recipient,
    subject,
    html,
    text,
    purpose: "admin",
  });
};
