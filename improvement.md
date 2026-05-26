# Canvas Hub — Improvement Roadmap

> Remaining UI/UX tasks carried forward from the original roadmap, plus a
> comprehensive plan for reorganising the 1 500-line D1 query monolith
> (`functions/api/_lib/d1.js`) into domain-scoped modules.
>
> Items 1-5, 7, 9, 11, 14 from the previous `IMPROVEMENTS.md` have been
> completed and removed.

---

## A. Remaining UI/UX Improvements

### A1. Reduce Context Provider Nesting (Performance)

**File:** `src/routes/__root.tsx` (lines 137–141, 232–298)

**Status:** Not started

**Problem:** 15 nested context providers at the root. Every state change
in any provider potentially re-renders the entire tree boundary. Niche
providers (`CompareProvider`, `FlyToCartProvider`, `QuickSpinProvider`,
`CommandPaletteProvider`) are used by a minority of visitors.

**Tasks:**

- [ ] Audit which providers are consumed on first page load vs. on interaction
- [ ] Lazy-mount `CompareProvider` only when user first triggers compare
- [ ] Lazy-mount `FlyToCartProvider` only on first add-to-cart
- [ ] Lazy-mount `QuickSpinProvider` and `CommandPaletteProvider` on first invocation
- [ ] Alternatively: consolidate related contexts (e.g., merge Compare + Wishlist into a single "SavedItems" context)
- [ ] Measure re-render counts with React DevTools Profiler before/after

---

### A2. Separate Preview and Production KV Namespaces (Security)

**File:** `wrangler.toml` (lines 135–138, 176–179)

**Status:** Not started

**Problem:** `SECURITY_EVENTS` and `WISHLISTS` use the same namespace ID
for both `id` and `preview_id`. Preview deploys share production data.

**Tasks:**

- [ ] Create separate preview KV namespaces for `SECURITY_EVENTS` and `WISHLISTS`
- [ ] Update `preview_id` values in `wrangler.toml`
- [ ] Audit all other `[[kv_namespaces]]` entries for the same issue
- [ ] Document namespace mapping in `docs/infrastructure.md` or similar

---

### A3. Clean Up tsconfig.json Comments

**File:** `tsconfig.json` (lines 10–13)

**Status:** Not started — trivial cleanup

**Tasks:**

- [ ] Remove `// ✅ ADD THIS` comment from `"baseUrl": "."` line
- [ ] Remove `// ✅ remove ./ (cleaner)` comment from `"@/*": ["src/*"]` line

---

### A4. Address Missing D1 Migration 0009

**Status:** Not started

**Problem:** Migration files jump from `0008_stock_events.sql` to
`0010_tiktok_posts.sql`. Migration `0009` is missing from
`migrations/`.

**Tasks:**

- [ ] Investigate whether migration 0009 was intentionally skipped or accidentally deleted
- [ ] If skipped: add a placeholder `0009_placeholder.sql` with a comment explaining the gap
- [ ] If deleted: reconstruct or document what it contained
- [ ] Verify `wrangler d1 migrations list` shows no gaps in applied migrations

---

### A5. Enable Abandoned Carts Feature

**File:** `wrangler.toml` (lines 160–163)

**Status:** Not started — infrastructure ready, binding commented out

**Problem:** The `ABANDONED_CARTS` KV namespace binding is commented out,
but endpoint and cron code already exists.

**Tasks:**

- [ ] Create the production and preview KV namespaces via `wrangler kv:namespace create`
- [ ] Uncomment and fill in the actual namespace IDs in `wrangler.toml`
- [ ] Test the abandoned cart recovery flow end-to-end
- [ ] If not ready for launch: document timeline and keep commented with a `TODO(date)` marker

---

## B. Database Query Organisation

### Problem Statement

`functions/api/_lib/d1.js` is a **1 506-line monolith** containing ~40
exported functions and ~40 inline SQL statements spanning 8+ unrelated
domains (orders, customers, wishlists, coupons, returns, page analytics,
search events, hero slides, notifications, stock events, new-user modal
events). This causes:

- **Poor discoverability** — finding the query for "top referrer hosts"
  means scrolling past order-mirroring, coupon analytics, and return
  handling.
- **Merge conflicts** — any two PRs touching different domains edit the
  same file.
- **Untestable queries** — SQL strings are buried inside business-logic
  functions with no way to unit-test the SQL independently.
- **No type safety** — query parameters and return shapes are untyped;
  callers rely on runtime inspection.

### Target Architecture

```
functions/api/_lib/
├── d1.js                         # Core helpers only (getD1, d1Run, d1All, …)
├── d1-schema.js                  # Schema statements (unchanged)
├── queries/
│   ├── index.js                  # Re-exports all domain modules
│   ├── loader.js                 # SQL file loader (reads .sql at build/dev)
│   ├── orders.js                 # mirrorOrderToD1, order analytics
│   ├── orders.sql                # Raw SQL for orders domain
│   ├── customers.js              # upsertCustomerFromOrder, customer queries
│   ├── customers.sql             # Raw SQL for customers domain
│   ├── wishlists.js              # syncWishlistToD1, wishlist analytics
│   ├── wishlists.sql             # Raw SQL for wishlists domain
│   ├── coupons.js                # recordCouponRedemption, couponAnalytics
│   ├── coupons.sql               # Raw SQL for coupons domain
│   ├── returns.js                # mirrorReturnRequestToD1, returnAnalytics
│   ├── returns.sql               # Raw SQL for returns domain
│   ├── page-events.js            # recordPageEvent, funnel, top paths, …
│   ├── page-events.sql           # Raw SQL for page events domain
│   ├── search-events.js          # recordSearchEvent, topSearchQueries, …
│   ├── search-events.sql         # Raw SQL for search events domain
│   ├── hero-slides.js            # recordHeroSlideEvent, heroSlideStats
│   ├── hero-slides.sql           # Raw SQL for hero slides domain
│   ├── notifications.js          # recordNotification, daily/kind/recent
│   ├── notifications.sql         # Raw SQL for notifications domain
│   ├── stock-events.js           # recordStockEvent, daily/by-product/recent
│   ├── stock-events.sql          # Raw SQL for stock events domain
│   ├── newuser-modal.js          # recordNewUserModalEvent, stats
│   └── newuser-modal.sql         # Raw SQL for new-user modal domain
├── types/
│   └── d1.d.ts                   # Shared TypeScript type definitions
└── __tests__/
    ├── orders.test.js
    ├── customers.test.js
    ├── coupons.test.js
    └── ...                       # One test file per domain module
```

---

### B1. Create Query Repository Directory Structure

**Status:** Not started

**Tasks:**

- [ ] Create `functions/api/_lib/queries/` directory
- [ ] Create `functions/api/_lib/types/` directory
- [ ] Create `functions/api/_lib/__tests__/` directory
- [ ] Add a `functions/api/_lib/queries/README.md` explaining the naming convention and how to add new domain modules

---

### B2. Extract SQL into Standalone `.sql` Files

**Status:** Not started

Extract the ~40 inline SQL strings from `d1.js` into named `.sql` files
grouped by domain. Each file contains multiple named queries separated by
`-- @query <name>` markers.

**Current locations in `functions/api/_lib/d1.js`:**

| Domain         | Lines     | Queries                                                                               | Target file                                      |
| -------------- | --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Orders         | 94–169    | `INSERT OR REPLACE INTO orders`, `INSERT INTO order_items`, `DELETE FROM order_items` | `queries/orders.sql`                             |
| Customers      | 51–91     | `INSERT INTO customers … ON CONFLICT`                                                 | `queries/customers.sql`                          |
| Wishlists      | 179–232   | `DELETE FROM wishlists`, `INSERT INTO wishlists`, `SELECT … GROUP BY`                 | `queries/wishlists.sql`                          |
| Coupons        | 233–362   | `INSERT INTO coupon_redemptions`, `SELECT COUNT(*)`, analytics aggregation            | `queries/coupons.sql`                            |
| Returns        | 363–518   | `INSERT OR REPLACE INTO return_requests`, `SELECT … JOIN`, analytics                  | `queries/returns.sql`                            |
| Products       | 519–552   | `INSERT OR REPLACE INTO products`                                                     | `queries/orders.sql` (or `queries/products.sql`) |
| Page events    | 553–730   | `INSERT INTO page_events`, funnel, top paths, referrers, daily, device mix            | `queries/page-events.sql`                        |
| Search events  | 766–903   | `INSERT INTO search_events`, top queries, zero-result, recent                         | `queries/search-events.sql`                      |
| Hero slides    | 904–992   | `INSERT INTO hero_slide_events`, stats                                                | `queries/hero-slides.sql`                        |
| Notifications  | 993–1186  | `INSERT INTO notification_log`, daily, by-kind, recent                                | `queries/notifications.sql`                      |
| Stock events   | 1187–1415 | `INSERT INTO stock_events`, daily, by-product, recent                                 | `queries/stock-events.sql`                       |
| New-user modal | 1416–1506 | `INSERT INTO newuser_modal_events`, stats                                             | `queries/newuser-modal.sql`                      |

**Tasks:**

- [ ] Create each `.sql` file with `-- @query <name>` markers for every query
- [ ] Verify every SQL statement from `d1.js` is accounted for (40 queries total)
- [ ] Add header comments to each `.sql` file referencing the source table(s)

---

### B3. Implement Query Loader Module

**Target file:** `functions/api/_lib/queries/loader.js`

**Status:** Not started

A thin utility that reads `.sql` files and splits them by `-- @query`
markers into a `Map<string, string>`.

**Tasks:**

- [ ] Implement `loadQueries(sqlFilePath)` → `Map<string, string>`
- [ ] Parse `-- @query <name>` comment markers to split multi-query files
- [ ] Strip SQL comments and normalise whitespace for cleaner prepared statements
- [ ] Handle Cloudflare Workers runtime (no `fs` — embed SQL at build time or inline)
- [ ] Add JSDoc annotations with usage example
- [ ] Export from `queries/index.js`

---

### B4. Refactor Domain-Specific Modules

**Status:** Not started

Move each logical section of `d1.js` into its own module. Each module
imports `d1Run` / `d1All` / `d1First` / `d1Batch` from the core
`d1.js` and its own SQL from the corresponding `.sql` file via the
loader.

**Order of extraction** (by line count, largest first):

| #   | Module file                | Functions to move                                                                                                                    | Source lines |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 1   | `queries/page-events.js`   | `PAGE_EVENT_KINDS`, `recordPageEvent`, `pageEventFunnel`, `topPagePaths`, `topReferrerHosts`, `pageEventDaily`, `pageEventDeviceMix` | 553–765      |
| 2   | `queries/stock-events.js`  | `STOCK_STATES`, `STOCK_SOURCES`, `recordStockEvent`, `stockEventsDaily`, `stockEventsByProduct`, `recentStockEvents`                 | 1187–1415    |
| 3   | `queries/notifications.js` | `NOTIFICATION_CHANNELS`, `recordNotification`, `notificationLogDaily`, `notificationLogByKind`, `recentNotificationLog`              | 993–1186     |
| 4   | `queries/returns.js`       | `mirrorReturnRequestToD1`, `listReturnRequests`, `returnAnalytics`                                                                   | 363–518      |
| 5   | `queries/orders.js`        | `mirrorOrderToD1`                                                                                                                    | 94–169       |
| 6   | `queries/search-events.js` | `recordSearchEvent`, `topSearchQueries`, `zeroResultSearchQueries`, `recentSearchEvents`                                             | 766–903      |
| 7   | `queries/customers.js`     | `upsertCustomerFromOrder`                                                                                                            | 51–91        |
| 8   | `queries/coupons.js`       | `recordCouponRedemption`, `customerCouponRedemptionCount`, `couponAnalytics`                                                         | 233–362      |
| 9   | `queries/wishlists.js`     | `syncWishlistToD1`                                                                                                                   | 179–232      |
| 10  | `queries/hero-slides.js`   | `recordHeroSlideEvent`, `heroSlideStats`                                                                                             | 904–992      |
| 11  | `queries/newuser-modal.js` | `NEWUSER_MODAL_VARIANT_RE`, `NEWUSER_MODAL_EVENT_TYPES`, `recordNewUserModalEvent`, `newUserModalStats`                              | 1416–1506    |
| 12  | `queries/products.js`      | `mirrorProductToD1`                                                                                                                  | 519–552      |

**Tasks:**

- [ ] Extract page-events functions → `queries/page-events.js`
- [ ] Extract stock-events functions → `queries/stock-events.js`
- [ ] Extract notifications functions → `queries/notifications.js`
- [ ] Extract returns functions → `queries/returns.js`
- [ ] Extract orders functions → `queries/orders.js`
- [ ] Extract search-events functions → `queries/search-events.js`
- [ ] Extract customers functions → `queries/customers.js`
- [ ] Extract coupons functions → `queries/coupons.js`
- [ ] Extract wishlists functions → `queries/wishlists.js`
- [ ] Extract hero-slides functions → `queries/hero-slides.js`
- [ ] Extract newuser-modal functions → `queries/newuser-modal.js`
- [ ] Extract products functions → `queries/products.js`
- [ ] Create `queries/index.js` barrel re-exporting every domain module
- [ ] Slim `d1.js` down to core helpers only (`getD1`, `isD1Available`, `d1Run`, `d1All`, `d1First`, `d1Batch`) — ~48 lines
- [ ] Update all import sites across `functions/api/` to use the new paths:
  - `functions/api/admin/d1.js` (lines 15–22)
  - `functions/api/page-events.js` (line 177)
  - `functions/api/search-events.js` (line 175)
  - `functions/api/stock-events.js` (lines 8, 191)
  - `functions/api/hero-slide-events.js`
  - `functions/api/notification-log.js` (line 116)
  - `functions/api/newuser-modal-events.js`
  - `functions/api/wishlist.js` (line 9)
  - `functions/api/customers.js` (line 190)

---

### B5. Add Type Definitions

**Target file:** `functions/api/_lib/types/d1.d.ts`

**Status:** Not started

Provide TypeScript ambient types for the query return shapes so callers
get autocomplete and compile-time validation (Pages Functions are JS, but
editors and `tsc` can still consume `.d.ts` side-cars).

**Tasks:**

- [ ] Define `Order`, `OrderItem`, `Customer` row interfaces
- [ ] Define `CouponRedemption`, `CouponAnalyticsRow` interfaces
- [ ] Define `ReturnRequest`, `ReturnAnalyticsRow` interfaces
- [ ] Define `PageEvent`, `FunnelRow`, `TopPathRow`, `ReferrerRow` interfaces
- [ ] Define `SearchEvent`, `TopSearchQueryRow` interfaces
- [ ] Define `HeroSlideEvent`, `HeroSlideStatsRow` interfaces
- [ ] Define `NotificationLogEntry` interface
- [ ] Define `StockEvent`, `StockDailyRow`, `StockByProductRow` interfaces
- [ ] Define `NewUserModalEvent`, `NewUserModalStatsRow` interfaces
- [ ] Add JSDoc `@typedef` or `@type` annotations in each domain `.js` module referencing the `.d.ts` types

---

### B6. Add Documentation

**Status:** Not started

**Tasks:**

- [ ] Create `functions/api/_lib/queries/README.md` with:
  - Directory layout diagram
  - How to add a new domain module (step-by-step)
  - SQL naming convention (`-- @query <verb>_<noun>`)
  - Import pattern examples
- [ ] Add inline JSDoc to every exported function in each domain module
- [ ] Update `AGENTS.md` § "Pages Functions (the API)" to reference the new `queries/` structure

---

### B7. Testing Infrastructure

**Status:** Not started

**Tasks:**

- [ ] Create `functions/api/_lib/__tests__/orders.test.js` — test `mirrorOrderToD1` with mocked `d1Batch`
- [ ] Create `functions/api/_lib/__tests__/customers.test.js` — test `upsertCustomerFromOrder` with mocked `d1Run`
- [ ] Create `functions/api/_lib/__tests__/coupons.test.js` — test `recordCouponRedemption`, `couponAnalytics`
- [ ] Create `functions/api/_lib/__tests__/returns.test.js` — test `mirrorReturnRequestToD1`, `returnAnalytics`
- [ ] Create `functions/api/_lib/__tests__/page-events.test.js` — test `recordPageEvent`, funnel/path/referrer queries
- [ ] Create `functions/api/_lib/__tests__/search-events.test.js` — test `recordSearchEvent`, `topSearchQueries`
- [ ] Create `functions/api/_lib/__tests__/hero-slides.test.js` — test `recordHeroSlideEvent`, `heroSlideStats`
- [ ] Create `functions/api/_lib/__tests__/notifications.test.js` — test `recordNotification`, daily/kind/recent
- [ ] Create `functions/api/_lib/__tests__/stock-events.test.js` — test `recordStockEvent`, daily/by-product
- [ ] Create `functions/api/_lib/__tests__/newuser-modal.test.js` — test `recordNewUserModalEvent`, `newUserModalStats`
- [ ] Create `functions/api/_lib/__tests__/wishlists.test.js` — test `syncWishlistToD1`
- [ ] Create `functions/api/_lib/__tests__/products.test.js` — test `mirrorProductToD1`
- [ ] Create shared test fixture `functions/api/_lib/__tests__/fixtures/d1-mock.js` providing a fake D1 binding
- [ ] Add `queries/` test glob to `vitest.config.ts` `include` array
- [ ] Verify all new tests pass: `npx vitest run --reporter verbose`

---

## C. Verification Checklist (Post-Implementation)

After completing all tasks above, verify:

- [ ] `npm run build` completes without errors
- [ ] `npx tsc --noEmit` passes with no type errors
- [ ] `npm run lint` passes with no errors (warnings OK)
- [ ] All existing E2E tests pass (`npx playwright test`)
- [ ] All existing unit tests pass (`npx vitest run`)
- [ ] New query module unit tests pass (`npx vitest run functions/api/_lib/__tests__/`)
- [ ] `d1.js` reduced to core helpers only (~48 lines)
- [ ] Every function previously exported from `d1.js` is still importable via `queries/index.js`
- [ ] No circular imports between domain modules
- [ ] `npm run build` output size has not regressed (±5 KB tolerance)
- [ ] Admin analytics panel (`/admin → Analytics`) still renders revenue, top-products, customers summaries
- [ ] `wrangler pages dev .` serves API endpoints using the new module paths
- [ ] No console errors on initial page load
- [ ] `tsconfig.json` comments cleaned up (A3)
- [ ] Migration 0009 gap resolved (A4)

---

_Last updated: 2025-05-26_
