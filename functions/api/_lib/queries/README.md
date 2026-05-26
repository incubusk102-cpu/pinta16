# D1 query repository

This directory holds the SQL helpers for the Cloudflare D1 mirror of the
Canvas Hub KV+D1 hybrid architecture. It was extracted from the
1,500-line `functions/api/_lib/d1.js` monolith as the first step of the
"Database Query Organization" roadmap in [`improvement.md`](../../../../improvement.md)
(items B1, B4, B7).

`_lib/d1.js` still exists — it is now a thin barrel re-export from this
directory so every legacy `import { ... } from "./d1.js"` call site keeps
working. New code SHOULD import the domain module directly
(`from "./queries/orders/index.js"`) so the dependency graph is obvious
at review time.

## Layout

```text
queries/
├── core.js               # getD1 / isD1Available / d1Run / d1All / d1First / d1Batch + shared helpers
├── index.js              # barrel re-export (every legacy symbol)
├── orders/               # order + customer mirror
├── wishlists/            # WISHLISTS KV mirror
├── coupons/              # redemption ledger + per-customer caps + analytics
├── returns/              # RMA mirror + analytics
├── products/             # PRODUCTS KV mirror so order_items can JOIN
├── page-events/          # /api/page-events beacon + funnel/top-paths/etc.
├── search-events/        # /api/search-events beacon + top/zero-result/recent
├── hero-slides/          # /api/hero-slide-events beacon + per-slide CTR
├── notifications/        # email + push delivery ledger
├── stock-events/         # product-availability transitions
└── newuser-modal/        # discount-modal A/B variant analytics
```

Each domain module is a single `index.js` that exports the public helpers
for that domain. The grouping mirrors the migration filenames in
`migrations/` so a query repository file maps to a single CREATE TABLE
statement.

## Conventions

All helpers in this repository follow these conventions. New domain
modules MUST do the same so the surface stays uniform.

1. **Null-safe on the binding.** Every public helper starts with
   `const db = getD1(); if (!db) return null;`. When `env.DB` is unbound
   (no D1 database provisioned, or running locally without `--d1`),
   the helper resolves to `null` and the caller falls back to the
   pre-D1 behaviour (KV-only). The site keeps working unchanged.
2. **Idempotent writes.** Recorders use one of:
   - `INSERT OR IGNORE (id, …)` when the caller supplies a stable id
     (page events, search events, hero slide events, …), so retries
     from a flaky network are free and silent.
   - `INSERT OR REPLACE` when the row represents a single mutable
     entity (`orders`, `products`).
   - `ON CONFLICT(...) DO UPDATE SET ...` for upserts that need to
     merge fields (`customers`, `return_requests`).
3. **Errors never escape.** Recorders wrap the SQL in `try { } catch`
   and return `{ recorded: false, reason }` instead of throwing. A
   logging failure must not break the user-visible KV write.
4. **Constants are SETS.** Allow-listed enums (`PAGE_EVENT_KINDS`,
   `STOCK_STATES`, `NEWUSER_MODAL_EVENT_TYPES`, …) are
   `new Set([...])` so callers use `.has(...)` for O(1) validation.
5. **Trailing-window aggregations use `sinceFromDays`** from
   `core.js` so every "last N days" query has identical semantics.

## How to add a new query

1. Pick the right domain directory (or create a new one if the query
   crosses an existing boundary in a meaningful way). The directory
   name should match the underlying D1 table name.
2. Add the helper to that domain's `index.js`. Follow the conventions
   above:
   - Null-safe on `getD1()`.
   - `try { ... } catch` around the `db.prepare(...).bind(...).run()`
     /`.all()`/`.first()` calls.
   - JSDoc comment describing purpose, parameters, return shape.
3. Re-export the new symbol from `queries/index.js` (the barrel) so
   the legacy `from "../_lib/d1.js"` imports keep working.
4. If the query needs new schema, add a numbered migration in
   `migrations/` (see `migrations/README.md` for the numbering
   convention — slot `0009` is permanently retired).
5. Update `_lib/d1-schema.js` to match — until the schema generator
   from `improvement.md` item B5 lands, the runtime bootstrap path
   `POST /api/admin/d1?action=apply-schema` still reads from
   `d1-schema.js`.
6. Add a unit test under `tests/unit/_lib/` mirroring the existing
   `stock-events.test.ts` / `hero-slide-events.test.ts` /
   `newuser-modal-events.test.ts` style.

## What didn't change

This refactor is **behaviour-preserving**: every helper still has the
same signature, same SQL, same parameter validation, and same return
shape. The only difference is the import path. `tests/unit/_lib/*.test.ts`
all keep importing from `_lib/d1.js` (the barrel) and continue to pass
unmodified.

The follow-up roadmap items in `improvement.md` will extract the
inline SQL into `.sql` files (B2 / B3), generate `d1-schema.js` from
the migration files (B5), add TypeScript types (B6), expand unit-test
coverage (B8), and pull in the analytics queries from `admin/d1.js`
(B9) and `_lib/tiktok.js` (B10).
