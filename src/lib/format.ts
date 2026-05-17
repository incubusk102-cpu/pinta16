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
