# Future Enhancements

Deferred features and architectural improvements for Canvas Hub.

---

## Product Variants (Size / Frame / Canvas)

Allow a single artwork listing to offer multiple purchasable configurations.

### Suggested Schema Changes

```ts
interface ProductVariant {
  id: string;
  productId: string;
  label: string; // e.g. "16×20 Canvas, No Frame"
  size: { w: number; h: number; unit: "in" | "cm" };
  canvas: "stretched" | "rolled" | "panel";
  frame: string | null; // null = unframed, otherwise frame SKU
  pricePHP: number;
  stock: number; // -1 = made-to-order (unlimited)
  weightGrams: number; // for shipping rate calc
}
```

- Add a `variants` array to the product KV value.
- Cart items reference `variantId` instead of bare `productId`.
- Product page renders a variant picker (size dropdown + frame toggle).
- Shipping fee calculation uses `weightGrams` from the selected variant.

---

## Additional Payment Methods

### Cash on Delivery (COD)

- Add `cod` to the `PaymentMethod` union type.
- COD orders skip the PayMongo flow and go straight to `confirmed` status.
- Enforce a COD surcharge (configurable in admin Storefront settings).
- Limit COD to Metro Manila or a configurable set of provinces.

### Bank Transfer / Direct Deposit

- Add `bank_transfer` to `PaymentMethod`.
- Display bank account details (BDO / BPI / UnionBank) after order placement.
- Admin marks payment as received via the order management panel.
- Auto-cancel unpaid bank-transfer orders after 48 hours (configurable).

---

## Pagination / Virtual Scroll for Collection Page

The current collection page loads all artworks into memory. As the catalogue grows past ~200 items, this will degrade performance.

### Options

1. **Cursor-based pagination** via the API (`/api/artworks?cursor=X&limit=24`).
   - Requires a stable sort key (e.g. `createdAt` descending).
   - URL params: `?page=2` or `?cursor=abc123`.
   - Skeleton grid shown while next page loads.

2. **Virtual scroll** using `@tanstack/react-virtual`.
   - All items fetched upfront (acceptable up to ~500 items).
   - Only visible rows rendered in the DOM.
   - Preserves current filter/sort UX without pagination controls.

3. **Hybrid**: fetch first 48 eagerly, virtual-scroll the rest on demand.

### Recommendation

Start with option 1 (cursor pagination) since it scales indefinitely and aligns with the existing TanStack Query cache strategy.

---

## Order Cancellation

### Requirements

- Customer can cancel within a configurable window (default: 1 hour after placement).
- After the window, cancellation requires admin approval.
- Cancellation triggers:
  - PayMongo refund (full or partial).
  - Inventory restoration (if stock-tracked variants exist).
  - Email notification to customer and admin.
  - Order status transitions to `cancelled`.
- Admin can force-cancel any order from the dashboard.

### Suggested Status Flow

```
confirmed → cancellation_requested → cancelled (refund issued)
confirmed → in_production → cancellation_requested → admin_review → cancelled | resumed
```

### API Endpoints

- `POST /api/orders/:id/cancel` — customer-initiated.
- `POST /api/admin/orders/:id/cancel` — admin force-cancel.
- `POST /api/admin/orders/:id/approve-cancel` — approve pending cancellation.
