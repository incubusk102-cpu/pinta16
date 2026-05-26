# Canvas Hub — Combined Improvement Roadmap

> Remaining UI/UX improvements (carried over from IMPROVEMENTS.md) plus
> comprehensive database query organization improvements.
> Track progress by checking off completed items.

---

## Part A — Remaining UI/UX Improvements

### A1. Reduce Context Provider Nesting (Performance)

**File:** `src/routes/__root.tsx` (lines 232–298)

**Problem:** 15 nested context providers at the root. Every state change in any provider potentially re-renders the entire tree boundary. Niche providers (`CompareProvider`, `FlyToCartProvider`, `QuickSpinProvider`, `CommandPaletteProvider`) are used by a minority of visitors.

**Tasks:**

- [x] Audit which providers are actually consumed on first page load vs. on interaction
- [x] Skip storefront-only providers on `/admin/*` routes so the admin shell pays zero re-render cost (PR #550)
- [ ] Lazy-mount `CompareProvider` only when user first triggers compare
- [ ] Lazy-mount `FlyToCartProvider` only on first add-to-cart
- [ ] Lazy-mount `QuickSpinProvider` and `CommandPaletteProvider` on first invocation
- [ ] Alternatively: consolidate related contexts (e.g., merge Compare + Wishlist into a single "SavedItems" context)
- [ ] Measure re-render counts with React DevTools Profiler before/after

**Status:** Partial — admin-route bypass landed (PR #550). Per-provider lazy mounting on the storefront still open as a follow-up; the more compact provider tree from IMPROVEMENTS.md item 6 (PR #540) already collapsed 15 levels into 3 grouped components, so the re-render cost is no longer acute.

---

### A2. Separate Preview and Production KV Namespaces (Security)

**File:** `wrangler.toml` (lines 135–138, 176–179)

**Problem:** `SECURITY_EVENTS` and `WISHLISTS` use the same namespace ID for both `id` and `preview_id`. Preview deploys share production data.

**Tasks:**

- [ ] Create separate preview KV namespaces for `SECURITY_EVENTS` and `WISHLISTS`
- [ ] Update `preview_id` values in `wrangler.toml`
- [x] Audit all other `[[kv_namespaces]]` entries for the same issue (every other binding has separate IDs; the two shared ones are the only outliers)
- [x] Document namespace mapping in `docs/infrastructure.md` (PR #540, IMPROVEMENTS.md item 8)

**Status:** Blocked on Cloudflare dashboard access. Audit + docs are done (only `SECURITY_EVENTS` and `WISHLISTS` share IDs, documented with a risk note in `docs/infrastructure.md`). Creating the two new preview namespaces and pasting their IDs into `wrangler.toml` requires Cloudflare dashboard write access — ops task.

---

### A3. Clean Up tsconfig.json Comments

**File:** `tsconfig.json` (lines 10–13)

**Tasks:**

- [x] Remove `// ✅ ADD THIS` comment from `"baseUrl": "."` line (PR #540, IMPROVEMENTS.md item 10)
- [x] Remove `// ✅ remove ./ (cleaner)` comment from `"@/*": ["src/*"]` line (PR #540, IMPROVEMENTS.md item 10)

**Status:** Done (PR #540).

---

### A4. Address Missing D1 Migration 0009

**Problem:** Migration files jump from `0008_stock_events.sql` to `0010_tiktok_posts.sql`. Migration `0009` is missing from `migrations/`.

**Tasks:**

- [x] Investigate whether migration 0009 was intentionally skipped or accidentally deleted (intentional — reworked and re-numbered before any environment applied it)
- [x] Document the gap in `migrations/README.md` (PR #540, IMPROVEMENTS.md item 12) with rationale and "do not reuse 0009" rule
- [x] Verify `wrangler d1 migrations list` shows no gaps in applied migrations (production migrations table never recorded a `0009`, so there is nothing to skip)

**Status:** Done (PR #540). Slot `0009` is permanently retired and documented in `migrations/README.md`. No placeholder file is needed because no environment ever applied a `0009`.

---

### A5. Enable Abandoned Carts Feature

**File:** `wrangler.toml` (lines 160–163)

**Problem:** The `ABANDONED_CARTS` KV namespace binding is commented out, but endpoint/cron code exists.

**Tasks:**

- [ ] Create the production and preview KV namespaces via `wrangler kv:namespace create`
- [ ] Uncomment and fill in the actual namespace IDs
- [ ] Test the abandoned cart recovery flow end-to-end
- [x] If not ready for launch: document timeline and keep commented with a `TODO(date)` marker (PR #540, IMPROVEMENTS.md item 13 — `TODO(2026-08)` block in `wrangler.toml` documents the decision deadline)

**Status:** Deferred to `TODO(2026-08)`. The decision "ship abandoned-cart recovery or delete the dead code" sits with the product owner; the binding stays commented out until then. Creating the namespaces requires Cloudflare dashboard write access — ops task once the product call is made.

---

## Part B — Database Query Organization Improvements

### Overview

The current D1 integration (`functions/api/_lib/d1.js`) is a 1,500+ line monolith containing 38 exported functions with inline SQL strings spread across orders, customers, wishlists, coupons, returns, page events, search events, hero-slide events, notification log, stock events, and new-user-modal events. The schema definition (`functions/api/_lib/d1-schema.js`, 276 lines) duplicates the migration SQL. Admin analytics queries are scattered between `functions/api/admin/d1.js` and `functions/api/_lib/d1.js`.

This section proposes extracting, organizing, and documenting these queries for maintainability, testability, and type safety.

---

### B1. Create Query Repository Directory Structure

**Problem:** All D1 queries live in a single 1,500-line file (`functions/api/_lib/d1.js`). Finding, updating, or reviewing a specific query requires scrolling through unrelated domain logic.

**Tasks:**

- [x] Create `functions/api/_lib/queries/` directory (PR #549)
- [x] Create domain-specific sub-directories (PR #549; `customers/` added by the B9 PR):
  ```
  functions/api/_lib/queries/
  ├── orders/          # order + order_item queries + revenue analytics
  ├── customers/       # customer summary aggregates
  ├── wishlists/       # wishlist sync, top-wishlisted
  ├── coupons/         # redemption recording, per-customer caps, analytics
  ├── returns/         # return request mirror, listing, analytics
  ├── products/        # PRODUCTS KV mirror + top-N analytics
  ├── page-events/     # page view recording, funnel, top paths, referrers, daily, device
  ├── search-events/   # search recording, top queries, zero-result, recent
  ├── hero-slides/     # hero slide event recording + stats
  ├── notifications/   # notification log recording, daily, by-kind, recent
  ├── stock-events/    # stock event recording, daily, by-product, recent
  ├── newuser-modal/   # new-user modal event recording + stats
  └── index.js         # barrel re-export for backward compatibility
  ```
- [x] Add a `README.md` inside `queries/` explaining the directory layout and conventions (PR #549)

**Status:** Done (PR #549, extended in the B9 PR).

---

### B2. Extract SQL Strings into Standalone `.sql` Files

**Problem:** SQL statements are embedded as template literals inside JavaScript functions (e.g., `functions/api/_lib/d1.js:62–73`, `:105–112`, `:196–199`, `:255–258`, `:317–329`, `:387–408`, `:493–495`, `:526–528`, `:605–608`, `:633–639`, `:657–668`, `:686–692`, `:712–720`, `:737–741`). This makes it hard to syntax-highlight, lint, review, or reuse SQL independently of JavaScript.

**Tasks:**

- [ ] Create `.sql` files for each query, named by operation:
  ```
  queries/orders/upsert-customer.sql
  queries/orders/mirror-order.sql
  queries/orders/delete-order-items.sql
  queries/orders/insert-order-item.sql
  queries/wishlists/delete-user-items.sql
  queries/wishlists/insert-item.sql
  queries/coupons/record-redemption.sql
  queries/coupons/count-customer-redemptions.sql
  queries/coupons/analytics-top-codes.sql
  queries/returns/upsert-return-request.sql
  queries/returns/list-by-status.sql
  queries/returns/list-all.sql
  queries/returns/analytics-by-status.sql
  queries/products/upsert-product.sql
  queries/page-events/insert-event.sql
  queries/page-events/funnel.sql
  queries/page-events/top-paths.sql
  queries/page-events/top-referrers.sql
  queries/page-events/daily-timeseries.sql
  queries/page-events/device-mix.sql
  queries/search-events/insert-event.sql
  queries/search-events/top-queries.sql
  queries/search-events/zero-result-queries.sql
  queries/search-events/recent.sql
  queries/hero-slides/insert-event.sql
  queries/hero-slides/stats.sql
  queries/notifications/insert-log.sql
  queries/notifications/daily.sql
  queries/notifications/by-kind.sql
  queries/notifications/recent.sql
  queries/stock-events/insert-event.sql
  queries/stock-events/daily.sql
  queries/stock-events/by-product.sql
  queries/stock-events/recent.sql
  queries/newuser-modal/insert-event.sql
  queries/newuser-modal/stats.sql
  ```
- [ ] Ensure each `.sql` file has a header comment with purpose, expected parameters, and return shape
- [ ] Add `.sql` to any applicable lint/format config (e.g., Prettier SQL plugin or `sql-formatter`)

**Status:** Not started.

---

### B3. Implement Query Loader Module

**File (new):** `functions/api/_lib/queries/loader.js`

**Problem:** Pages Functions does not bundle non-JS assets automatically. A lightweight loader is needed to import `.sql` files at build time or read them as string constants at runtime.

**Tasks:**

- [ ] Create `loader.js` that exports a `loadQuery(domain, name)` helper
- [ ] Option A (build-time): Write a Vite plugin or `esbuild` plugin for the Functions build that inlines `.sql` files as ES module string exports
- [ ] Option B (runtime): Co-locate each `.sql` alongside a thin `.js` wrapper that exports the SQL as a template literal (simpler, no build tooling change)
- [ ] Add caching so repeated calls to `loadQuery` don't re-read from disk
- [ ] Export a `prepareQuery(db, domain, name, params)` convenience that loads + prepares + binds in one call
- [ ] Document the chosen approach in `queries/README.md`

**Status:** Not started.

---

### B4. Refactor Domain-Specific Modules

**File:** `functions/api/_lib/d1.js` (1,506 lines, 38 exported functions)

**Problem:** The monolithic `d1.js` mixes low-level helpers (`getD1`, `d1Run`, `d1All`, `d1First`, `d1Batch`) with domain logic for 10+ distinct domains. Each domain section (orders, wishlists, coupons, returns, page events, search events, hero slides, notifications, stock events, new-user modal) should be its own module.

**Tasks:**

- [ ] Extract `getD1`, `isD1Available`, `d1Run`, `d1All`, `d1First`, `d1Batch` → `queries/core.js`
  - File: `functions/api/_lib/d1.js` lines 1–48
- [ ] Extract `upsertCustomerFromOrder`, `mirrorOrderToD1` → `queries/orders/index.js`
  - File: `functions/api/_lib/d1.js` lines 50–168
- [ ] Extract `syncWishlistToD1` → `queries/wishlists/index.js`
  - File: `functions/api/_lib/d1.js` lines 171–222
- [ ] Extract `recordCouponRedemption`, `customerCouponRedemptionCount`, `couponAnalytics` → `queries/coupons/index.js`
  - File: `functions/api/_lib/d1.js` lines 224–349
- [ ] Extract `mirrorReturnRequestToD1`, `listReturnRequests`, `returnAnalytics` → `queries/returns/index.js`
  - File: `functions/api/_lib/d1.js` lines 351–516
- [ ] Extract `mirrorProductToD1` → `queries/products/index.js`
  - File: `functions/api/_lib/d1.js` lines 518–544
- [ ] Extract `recordPageEvent`, `pageEventFunnel`, `topPagePaths`, `topReferrerHosts`, `pageEventDaily`, `pageEventDeviceMix` → `queries/page-events/index.js`
  - File: `functions/api/_lib/d1.js` lines 546–752
- [ ] Extract `recordSearchEvent`, `topSearchQueries`, `zeroResultSearchQueries`, `recentSearchEvents` → `queries/search-events/index.js`
  - File: `functions/api/_lib/d1.js` lines 754–908
- [ ] Extract `recordHeroSlideEvent`, `heroSlideStats` → `queries/hero-slides/index.js`
  - File: `functions/api/_lib/d1.js` lines 910–1002
- [ ] Extract `recordNotification`, `notificationLogDaily`, `notificationLogByKind`, `recentNotificationLog` → `queries/notifications/index.js`
  - File: `functions/api/_lib/d1.js` lines 1004–1226
- [ ] Extract `recordStockEvent`, `stockEventsDaily`, `stockEventsByProduct`, `recentStockEvents` → `queries/stock-events/index.js`
  - File: `functions/api/_lib/d1.js` lines 1228–1426
- [x] Extract `getD1`, `isD1Available`, `d1Run`, `d1All`, `d1First`, `d1Batch` → `queries/core.js` (PR #549)
- [x] Extract `upsertCustomerFromOrder`, `mirrorOrderToD1` → `queries/orders/index.js` (PR #549)
- [x] Extract `syncWishlistToD1` → `queries/wishlists/index.js` (PR #549)
- [x] Extract `recordCouponRedemption`, `customerCouponRedemptionCount`, `couponAnalytics` → `queries/coupons/index.js` (PR #549)
- [x] Extract `mirrorReturnRequestToD1`, `listReturnRequests`, `returnAnalytics` → `queries/returns/index.js` (PR #549)
- [x] Extract `mirrorProductToD1` → `queries/products/index.js` (PR #549)
- [x] Extract page-events helpers → `queries/page-events/index.js` (PR #549)
- [x] Extract search-events helpers → `queries/search-events/index.js` (PR #549)
- [x] Extract hero-slide helpers → `queries/hero-slides/index.js` (PR #549)
- [x] Extract notification helpers → `queries/notifications/index.js` (PR #549)
- [x] Extract stock-events helpers → `queries/stock-events/index.js` (PR #549)
- [x] Extract `recordNewUserModalEvent`, `newUserModalStats` → `queries/newuser-modal/index.js` (PR #549)
- [x] Keep `d1.js` as a thin barrel re-export of all domain modules for backward compatibility (PR #549)
- [x] Update all import sites across `functions/api/` to use the new paths (or verify barrel re-exports work — every legacy `from "./d1.js"` still resolves)
- [x] Verify no circular dependencies (manual inspection of the small dependency graph; every domain module only imports from `core.js`)

**Status:** Done (PR #549).

---

### B5. Consolidate and Deduplicate Schema Definitions

**Files:**

- `functions/api/_lib/d1-schema.js` (276 lines — inline `CREATE TABLE` statements)
- `migrations/0001_initial.sql` through `migrations/0013_tiktok_post_engagement.sql` (13 migration files)

**Problem:** The schema is defined in two places: migration `.sql` files (source of truth for `wrangler d1 migrations apply`) and `d1-schema.js` (runtime bootstrap for `POST /api/admin/d1?action=apply-schema`). Changes to one must be manually mirrored to the other. The comment at `d1-schema.js:7` acknowledges this duplication.

**Tasks:**

- [x] Create a build script (`scripts/generate-d1-schema.mjs`) that reads all `migrations/*.sql` files in order and generates the `D1_SCHEMA_STATEMENTS` array automatically (PR #551)
- [x] Run this script as part of `npm run prebuild` so `d1-schema.js` is always in sync (PR #551, via `npm run prebuild`)
- [x] Add a CI check that verifies `d1-schema.js` matches the generated output (`--check` flag in the generator; `npm run prebuild` runs it in check mode and fails the build on drift)
- [x] Document the single-source-of-truth flow in `queries/README.md` (PR #551)

**Status:** Done (PR #551).

---

### B6. Add Type Definitions for Query Parameters and Results

**File (new):** `functions/api/_lib/queries/types.d.ts`

**Problem:** All D1 helper functions accept and return untyped objects (`order`, `request`, `item`). Callers have no IDE autocompletion or compile-time safety for the shapes they pass in or receive back. The `d1Run`/`d1All`/`d1First` helpers return `any`.

**Tasks:**

- [ ] Define TypeScript interfaces for each domain's input and output shapes:
  ```ts
  // Example shapes
  interface D1Order {
    id: string;
    customerId?: string;
    status: string;
    total: number; /* ... */
  }
  interface D1Customer {
    id: string;
    email: string;
    totalOrders: number;
    totalSpent: number; /* ... */
  }
  interface D1OrderItem {
    id: string;
    orderId: string;
    productId: string;
    unitPrice: number; /* ... */
  }
  interface D1PageEvent {
    id: string;
    sessionId: string;
    path: string;
    pathKind: string; /* ... */
  }
  interface D1SearchEvent {
    id: string;
    query: string;
    resultsCount: number; /* ... */
  }
  interface D1StockEvent {
    id: string;
    productId: string;
    fromState: string;
    toState: string; /* ... */
  }
  interface D1CouponRedemption {
    id: string;
    code: string;
    orderId: string;
    discountCents: number; /* ... */
  }
  interface D1ReturnRequest {
    id: string;
    orderId: string;
    status: string;
    reason: string; /* ... */
  }
  interface D1Notification {
    id: string;
    channel: string;
    kind: string;
    delivered: boolean; /* ... */
  }
  interface D1HeroSlideEvent {
    id: string;
    sessionId: string;
    slideId: string;
    eventType: string; /* ... */
  }
  interface D1NewUserModalEvent {
    id: string;
    sessionId: string;
    eventType: string; /* ... */
  }
  interface D1Product {
    id: string;
    title: string;
    category?: string;
    price: number; /* ... */
  }
  interface D1WishlistItem {
    id: string;
    userId: string;
    productId: string; /* ... */
  }
  ```
- [ ] Add JSDoc `@param` and `@returns` annotations to each exported function in the domain modules
- [ ] Ensure `npx tsc --noEmit` passes with the new type definitions
- [ ] Consider adding generic wrappers: `d1All<T>(sql, params): Promise<T[] | null>`

**Status:** Not started.

---

### B7. Add Query Documentation

**File (new):** `functions/api/_lib/queries/README.md`

**Problem:** There is no documentation explaining the D1 query architecture, conventions, or how to add new queries. New contributors must read all 1,500+ lines of `d1.js` to understand the patterns.

**Tasks:**

- [x] Document the hybrid KV+D1 architecture (PR #549; see `queries/README.md`)
- [x] Explain the null-safe pattern: every function checks `getD1()` and returns `null` when D1 is unbound (PR #549)
- [x] Explain the idempotency conventions: `INSERT OR REPLACE`, `INSERT OR IGNORE`, `ON CONFLICT` (PR #549)
- [x] List all domain modules with a one-liner per exported function (PR #549; layout table covers every module)
- [ ] Describe the query file naming convention (`.sql` files) — deferred until B2 lands
- [x] Add a "How to add a new query" step-by-step guide (PR #549)
- [ ] Add an entity-relationship diagram (Mermaid) showing the D1 tables and their foreign keys

**Status:** Mostly done (PR #549). Two follow-ups remain (`.sql` naming convention, ERD); both are blocked on B2.

---

### B8. Create Testing Infrastructure for Queries

**Problem:** There are no unit tests for the 38 D1 helper functions in `functions/api/_lib/d1.js`. The `vitest.config.ts` include paths (`functions/api/_lib/**/*.js`) would pick them up, but no test files exist for the D1 layer.

**Tasks:**

- [ ] Create `tests/unit/d1/` directory for query unit tests
- [ ] Add a D1 mock/stub module (`tests/unit/d1/mock-d1.js`) that implements the `prepare().bind().run()/all()/first()` interface using an in-memory SQLite via `better-sqlite3` or `sql.js`
- [ ] Write tests for core helpers:
  - `tests/unit/d1/core.test.js` — `getD1`, `isD1Available`, `d1Run`, `d1All`, `d1First`, `d1Batch` null-safety
- [ ] Write tests for each domain:
  - `tests/unit/d1/orders.test.js` — `upsertCustomerFromOrder`, `mirrorOrderToD1` idempotency
  - `tests/unit/d1/wishlists.test.js` — `syncWishlistToD1` replace semantics
  - `tests/unit/d1/coupons.test.js` — `recordCouponRedemption` idempotency, `customerCouponRedemptionCount`, `couponAnalytics`
  - `tests/unit/d1/returns.test.js` — `mirrorReturnRequestToD1`, `listReturnRequests`, `returnAnalytics`
  - `tests/unit/d1/page-events.test.js` — `recordPageEvent` validation, `pageEventFunnel`, `topPagePaths`
  - `tests/unit/d1/search-events.test.js` — `recordSearchEvent`, `topSearchQueries`, `zeroResultSearchQueries`
  - `tests/unit/d1/hero-slides.test.js` — `recordHeroSlideEvent`, `heroSlideStats`
  - `tests/unit/d1/notifications.test.js` — `recordNotification`, `notificationLogDaily`, `recentNotificationLog`
  - `tests/unit/d1/stock-events.test.js` — `recordStockEvent`, `stockEventsDaily`, `recentStockEvents`
  - `tests/unit/d1/newuser-modal.test.js` — `recordNewUserModalEvent`, `newUserModalStats`
- [x] Created `tests/unit/_lib/` covers the D1 layer (uses existing vitest include path; PR #552)
- [x] Added a D1 fake at `tests/unit/_lib/fake-d1.ts` implementing the `prepare().bind().run()/all()/first()` interface (PR #552)
- [x] Wrote tests for core helpers in `tests/unit/_lib/d1-core.test.ts` (PR #552)
- [x] Wrote tests for every domain (orders, wishlists, coupons, returns, page-events, search-events, hero-slides, notifications, stock-events, newuser-modal, tiktok) under `tests/unit/_lib/*.test.ts` (PR #552)
- [x] Tests pass with `npx vitest run`
- [x] Target ≥ 80% line coverage for the D1 layer (covered)

**Status:** Done (PR #552). The B9 PR layered additional tests for `orders/analytics.js`, `products/analytics.js`, `customers/index.js`.

---

### B9. Admin Analytics Query Consolidation

**File:** `functions/api/admin/d1.js` (286 lines)

**Problem:** The admin D1 endpoint (`functions/api/admin/d1.js`) contains inline SQL for revenue summaries, top-products, and customer analytics (lines 63–222) that duplicates patterns already in `_lib/d1.js`. These queries should live in the query repository alongside the rest.

**Tasks:**

- [x] Extract revenue queries (this-month, last-month, all-time, 6-month sparkline) → `queries/orders/analytics.js` (`.sql` extraction deferred to B2)
- [x] Extract top-products query → `queries/products/analytics.js`
- [x] Extract customers-summary query → `queries/customers/index.js`
- [x] Refactor `functions/api/admin/d1.js` to import from the query modules instead of inlining SQL
- [x] Verify admin analytics panel still works correctly after refactor (helpers are behaviour-preserving; tests cover the boundary semantics)

**Status:** Done. The `.sql`-per-file split waits on B2 (loader infrastructure).

---

### B10. TikTok Query Extraction

**Files:**

- `functions/api/_lib/tiktok.js` (1,262 lines — 10 inline SQL statements)
- `functions/api/admin/tiktok.js` (551 lines — 13 inline SQL statements)

**Problem:** TikTok-related D1 queries (post recording, engagement metrics, publish tracking) are embedded in the TikTok integration modules rather than the query repository. These are the second-largest source of inline SQL after `d1.js`.

**Tasks:**

- [ ] Create `queries/tiktok/` directory
- [ ] Extract SQL from `functions/api/_lib/tiktok.js`:
  - Post upsert (line ~432)
  - Engagement update (lines ~917–1021)
  - Post lookup/listing (lines ~1158–1203)
- [ ] Extract SQL from `functions/api/admin/tiktok.js`:
  - Post listing with filters (lines ~88–176)
  - Engagement refresh queries (lines ~210–246)
  - Bulk operations (lines ~431–484)
- [ ] Create wrapper functions in `queries/tiktok/index.js`
- [ ] Update both `_lib/tiktok.js` and `admin/tiktok.js` to import from the query module
- [ ] Add tests in `tests/unit/d1/tiktok.test.js`

**Status:** Not started. (Note: PR #552 already added a `tests/unit/_lib/tiktok.test.ts` covering the existing helpers; the extraction itself is still pending.)

---

## Part C — Verification Checklist

After completing improvements, verify:

### Build & Lint

- [ ] `npm run build` completes without errors
- [ ] `npx tsc --noEmit` passes with no type errors
- [ ] `npm run lint` passes with no errors
- [ ] No console errors on initial page load

### Test Suite

- [ ] All E2E tests pass (`npx playwright test`)
- [ ] All unit tests pass (`npx vitest run`)
- [ ] D1 query test coverage ≥ 80%

### Query Organization

- [ ] All `.sql` files have header comments with purpose and parameter descriptions
- [ ] `queries/README.md` is up-to-date with the current module list
- [ ] `d1.js` barrel re-exports maintain backward compatibility (no import breakage)
- [ ] `d1-schema.js` matches the output of `scripts/generate-d1-schema.mjs`
- [ ] No circular dependencies between query modules

### Infrastructure & Security

- [ ] Preview and production KV namespaces are properly separated
- [ ] `wrangler d1 migrations list` shows no gaps
- [ ] Abandoned cart KV namespaces are provisioned (or documented with TODO)

### Performance

- [ ] Context provider lazy-mounting reduces initial re-render count
- [ ] Lighthouse score remains ≥ 90 for Performance, Accessibility, Best Practices, SEO

---

_Last updated: <!-- auto-fill date on commit -->_
