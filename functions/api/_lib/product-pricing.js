// Tiny shared pricing helper so the products API can sort + filter by
// effective price (sale price when active, otherwise list price)
// without dragging in any React-side imports. The same predicate
// lives in `src/contexts/ProductContext.tsx` (`getEffectivePrice`)
// for the SPA, and the two must agree or server-paginated price
// ranges won't match the prices rendered on the gallery card.

export const getEffectivePrice = (product) => {
  if (!product || typeof product !== "object") return 0;
  const price = typeof product.price === "number" ? product.price : 0;
  const sale = typeof product.salePrice === "number" ? product.salePrice : null;
  if (sale !== null && sale > 0 && sale < price) return sale;
  return price;
};
