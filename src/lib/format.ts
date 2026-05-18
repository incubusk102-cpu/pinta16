// Shared currency formatter for PHP (Philippine Peso).
// Every storefront price display should go through `formatPHP` so the
// site renders a consistent "₱1,200" shape everywhere — no bare
// integers, no mismatched locale grouping.

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export const formatPHP = (amount: number): string =>
  phpFormatter.format(amount);

// Shared "Philippine Time" date formatter. Customers, riders and the
// support team all operate in Asia/Manila, so render every visible
// timestamp pinned to that zone — `new Date().toLocaleString()`
// without a timezone defaults to the visitor's locale, which would
// show the wrong wall-clock time to anyone reading the site from
// abroad (e.g. an OFW checking on their order).
//
// Pass any `Date | string | number | null | undefined`; non-parseable
// inputs and falsy values fall back to the supplied placeholder
// (default `"—"`) so callers don't have to guard each call site.
export const formatDatePHT = (
  value: Date | string | number | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
  placeholder = "—",
): string => {
  if (value == null || value === "") return placeholder;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    // If the caller handed us an already-formatted string, return it
    // verbatim rather than the placeholder so the UI still surfaces
    // whatever data it had.
    return typeof value === "string" ? value : placeholder;
  }
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    ...options,
  });
};
