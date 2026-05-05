/**
 * Shared helpers for the email templates: HTML escaping, currency
 * formatting, {{var}} substitution, and safe-image URL resolution.
 */

export const escapeHtml = (input: unknown): string =>
  String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const formatPHP = (value: unknown): string => {
  const n = Number(value) || 0;
  return `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
};

/**
 * Substitute {{var}} placeholders in admin-edited template strings.
 * Returns plain (un-escaped) text suitable for the email subject. Unknown
 * placeholders collapse to empty strings.
 */
export const substituteTemplate = (
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string => {
  if (!template) return "";
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
};

export const isSafeImageUrl = (value: string | undefined): value is string =>
  typeof value === "string" &&
  /^(https?:\/\/|data:image\/)/i.test(value.trim());

/**
 * Build the customer-facing tracker deep link. Mirrors what
 * functions/api/_lib/email.js exports so both server-side and template
 * code agree on the shape (`/account?track=<id>#order-review-form`).
 */
export const PUBLIC_SITE_ORIGIN = "https://canvhub.com";

export const buildOrderTrackUrl = (orderId: string | undefined): string =>
  orderId
    ? `${PUBLIC_SITE_ORIGIN}/account?track=${encodeURIComponent(orderId)}#order-review-form`
    : "";

export const buildAdminOrderUrl = (orderId: string | undefined): string =>
  orderId
    ? `${PUBLIC_SITE_ORIGIN}/admin?order=${encodeURIComponent(orderId)}`
    : `${PUBLIC_SITE_ORIGIN}/admin`;
