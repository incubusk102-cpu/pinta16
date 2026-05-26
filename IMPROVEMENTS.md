# Canvas Hub — Improvement Roadmap

> Generated from full codebase review. Track progress by checking off completed items.

---

## ✅ Status (as of 2026-05-26)

Most roadmap items were implemented by PR #540 (`chore: execute IMPROVEMENTS.md roadmap`).
PR #544 closes a follow-up gap (item #9's ESLint rule) and brings this tracker in line
with the actual state of `main`.

**Genuinely still pending:**

- **#2 (partial)** — provider component tests (`CartProvider`, `UserAuthProvider`, `WishlistProvider`) were never added.
- **#3 (partial)** — EB Garamond subsetting (whole face still loads).
- **#6 (partial)** — providers were _grouped_ into named helpers for readability, but the **lazy-mount** sub-tasks and the "merge Compare + Wishlist into SavedItems" sub-task were not done.
- **#8 (partial)** — `SECURITY_EVENTS` and `WISHLISTS` KV namespaces still share their `id` and `preview_id`. Only the documentation step was completed (see `docs/infrastructure.md`).

Manual / operator-side sub-tasks (Lighthouse measurement, Facebook Sharing Debugger,
device PWA install testing, live D1 + wrangler verification, React DevTools Profiler
measurement) and the **Verification Checklist** at the bottom are intentionally left
unchecked — they require an operator running tools against the deployed environment,
not a code change.

---

## 🔴 High Priority

### 1. Expand Middleware HTML Path Coverage (SEO)

**File:** `functions/_middleware.js` (lines 343–353)

**Problem:** The `isHtmlPath` allow-list only covers `/`, `/product/*`, `/policy/*`, `/preview/*`, `/account`, `/signup`, and `/admin`. Major public pages like `/collection`, `/about`, `/contact`, and `/resources` are missing — crawlers hitting those routes get generic `index.html` fallback meta with no OG tags, description, or structured data.

**Tasks:**

- [x] Add `/collection`, `/about`, `/contact`, `/resources`, and `/resources/*` to the `isHtmlPath` check
- [x] Build per-page meta payloads (title, description, OG tags) for each new path
- [x] Add JSON-LD `WebPage` or `CollectionPage` structured data for `/collection`
- [x] Add JSON-LD `AboutPage` structured data for `/about`
- [x] Add JSON-LD `ContactPage` structured data for `/contact`
- [ ] Test with Facebook Sharing Debugger and Twitter Card Validator

---

### 2. Expand Test Coverage

**Current state:** Only `tests/e2e/smoke.spec.ts` exists. Unit test coverage is scoped to `functions/api/_lib/**/*.js` and `src/lib/**/*.ts` only (per `vitest.config.ts` lines 28–33).

**Tasks:**

- [x] Create `tests/e2e/homepage.spec.ts` — verify homepage loads, has `<h1>`, renders painting marquee, navigation works
- [x] Create `tests/e2e/product.spec.ts` — verify product page renders title, price, and add-to-cart button
- [x] Create `tests/e2e/navigation.spec.ts` — verify `/collection`, `/about`, `/contact` load without errors
- [x] Create `tests/e2e/cart.spec.ts` — verify add-to-cart, quantity update, and cart drawer interaction
- [ ] Add component tests for `CartProvider`, `UserAuthProvider`, `WishlistProvider`
- [x] Expand `vitest.config.ts` coverage `include` to add `src/hooks/**/*.ts` and `src/contexts/**/*.tsx`

---

### 3. Optimize Font Loading (Performance)

**File:** `index.html` (lines 87–90)

**Problem:** Three font families (EB Garamond, Playfair Display, Inter) with many weight variants are loaded in a single render-blocking `<link rel="stylesheet">`. This delays First Contentful Paint.

**Tasks:**

- [x] Split into two `<link>` tags: one for Inter (critical body font) and one for Playfair Display + EB Garamond
- [x] Apply deferred loading pattern to non-critical fonts: `media="print" onload="this.media='all'"`
- [x] Add `<noscript>` fallback for the deferred fonts
- [ ] Consider subsetting EB Garamond (only used for `.font-logo`) to reduce payload
- [ ] Measure FCP/LCP improvement with Lighthouse before/after

---

## 🟡 Medium Priority

### 4. Fix Package Metadata & Dependency Hygiene

**File:** `package.json`

**Tasks:**

- [x] Rename `"name": "tanstack_start_ts"` → `"name": "canvhub"` (line 2)
- [x] Move `"vite-tsconfig-paths": "^6.0.2"` from `dependencies` to `devDependencies` (line 104)
- [x] Remove `"path": "^0.12.7"` from `dependencies` (line 88) — Vite handles Node built-ins natively
- [ ] Run `npm ls path` to confirm nothing runtime-critical imports it

---

### 5. Bump Cloudflare Workers Compatibility Date

**File:** `wrangler.toml` (line 17)

**Problem:** `compatibility_date = "2024-09-23"` is ~20 months stale. Missing runtime security fixes and performance improvements.

**Tasks:**

- [x] Update to `compatibility_date = "2025-05-01"` (or latest stable)
- [x] Review [Cloudflare compatibility flags changelog](https://developers.cloudflare.com/workers/configuration/compatibility-dates/) for breaking changes between 2024-09-23 and new date
- [ ] Test all API functions (`functions/api/`) against the new date in preview
- [ ] Verify middleware (`functions/_middleware.js`) still works correctly

---

### 6. Reduce Context Provider Nesting (Performance)

**File:** `src/routes/__root.tsx` (lines 232–298)

**Problem:** 15 nested context providers at the root. Every state change in any provider potentially re-renders the entire tree boundary. Niche providers (`CompareProvider`, `FlyToCartProvider`, `QuickSpinProvider`, `CommandPaletteProvider`) are used by a minority of visitors.

**Tasks:**

- [ ] Audit which providers are actually consumed on first page load vs. on interaction
- [ ] Lazy-mount `CompareProvider` only when user first triggers compare
- [ ] Lazy-mount `FlyToCartProvider` only on first add-to-cart
- [ ] Lazy-mount `QuickSpinProvider` and `CommandPaletteProvider` on first invocation
- [ ] Alternatively: consolidate related contexts (e.g., merge Compare + Wishlist into a single "SavedItems" context)
- [ ] Measure re-render counts with React DevTools Profiler before/after

---

### 7. Fix PWA Manifest Cart Shortcut

**File:** `public/manifest.webmanifest` (lines 48–53)

**Problem:** The "Cart" shortcut points to `/cart?source=pwa-shortcut`, but there is no `/cart` route — the cart is a drawer component triggered from any page.

**Tasks:**

- [x] Change URL to `/?source=pwa-shortcut&open=cart` or `/collection?open=cart`
- [x] Ensure the app reads the `open=cart` query param on mount and opens the cart drawer
- [ ] Test on Android (Chrome) and iOS (Safari) PWA installs

---

### 8. Separate Preview and Production KV Namespaces (Security)

**File:** `wrangler.toml` (lines 135–138, 176–179)

**Problem:** `SECURITY_EVENTS` and `WISHLISTS` use the same namespace ID for both `id` and `preview_id`. Preview deploys share production data.

**Tasks:**

- [ ] Create separate preview KV namespaces for `SECURITY_EVENTS` and `WISHLISTS`
- [ ] Update `preview_id` values in `wrangler.toml`
- [ ] Audit all other `[[kv_namespaces]]` entries for the same issue
- [x] Document namespace mapping in a `docs/infrastructure.md` or similar

---

## 🟢 Low Priority

### 9. Enable Stricter TypeScript & ESLint Rules

**Files:** `tsconfig.json` (lines 23–24), `eslint.config.js` (line 38)

**Problem:** `noUnusedLocals: false`, `noUnusedParameters: false`, and `@typescript-eslint/no-unused-vars: "off"` allow dead code to accumulate.

**Tasks:**

- [x] Set `"noUnusedLocals": true` in `tsconfig.json`
- [x] Set `"noUnusedParameters": true` in `tsconfig.json`
- [x] Change ESLint rule to `"@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]`
- [x] Run `npx tsc --noEmit` and fix all new violations (prefix intentional unused params with `_`)
- [ ] Run `npm run lint -- --fix` and manually resolve remaining issues

---

### 10. Clean Up tsconfig.json Comments

**File:** `tsconfig.json` (lines 10–13)

**Tasks:**

- [x] Remove `// ✅ ADD THIS` comment from `"baseUrl": "."` line
- [x] Remove `// ✅ remove ./ (cleaner)` comment from `"@/*": ["src/*"]` line

---

### 11. Remove Dead `head()` Config from Index Route

**File:** `src/routes/index.tsx` (lines 103–121)

**Problem:** The `head()` config on `createFileRoute("/")` is a no-op in TanStack Router (client-only, no SSR/Start). `useSEO` handles the actual head management.

**Tasks:**

- [x] Remove the `head: () => ({...})` block from the route config
- [x] Verify `useSEO` is correctly called in the `Index` component with equivalent meta
- [x] Check other route files for similar dead `head()` configs

---

### 12. Address Missing D1 Migration 0009

**Problem:** Migration files appear to jump from `0008_stock_events.sql` to `0010_tiktok_posts.sql`. Migration `0009` is missing.

**Tasks:**

- [x] Investigate whether migration 0009 was intentionally skipped or accidentally deleted
- [x] If skipped: add a placeholder `0009_placeholder.sql` with a comment explaining the gap
- [ ] If deleted: reconstruct or document what it contained
- [ ] Verify `wrangler d1 migrations list` shows no gaps in applied migrations

---

### 13. Enable Abandoned Carts Feature

**File:** `wrangler.toml` (lines 160–163)

**Problem:** The `ABANDONED_CARTS` KV namespace binding is commented out, but endpoint/cron code exists.

**Tasks:**

- [ ] Create the production and preview KV namespaces via `wrangler kv:namespace create`
- [ ] Uncomment and fill in the actual namespace IDs
- [ ] Test the abandoned cart recovery flow end-to-end
- [x] If not ready for launch: document timeline and keep commented with a `TODO(date)` marker

---

### 14. Investigate `style-src 'unsafe-inline'` Removal (Security)

**File:** `public/_headers` (line 11)

**Problem:** CSP allows `'unsafe-inline'` for styles, weakening protection against style-injection attacks.

**Tasks:**

- [x] Audit which libraries inject inline styles (likely Radix UI, Framer Motion, Tailwind runtime)
- [ ] Investigate CSP nonce support for Radix UI components
- [x] If nonces aren't feasible: document the accepted risk and set a re-evaluation date
- [ ] If feasible: implement nonce generation in `_middleware.js` and inject into CSP header

---

## 📋 Verification Checklist (Post-Implementation)

After completing the above tasks, verify:

- [ ] `npm run build` completes without errors
- [ ] `npx tsc --noEmit` passes with no type errors
- [ ] `npm run lint` passes with no errors
- [ ] All E2E tests pass (`npx playwright test`)
- [ ] Lighthouse score ≥ 90 for Performance, Accessibility, Best Practices, SEO
- [ ] Facebook Sharing Debugger shows correct OG meta for `/`, `/collection`, `/about`, `/contact`, `/product/*`
- [ ] Google Rich Results Test passes for product pages
- [ ] PWA install works on Android and iOS with correct shortcuts
- [ ] No console errors on initial page load
- [ ] `wrangler pages deploy` succeeds with new compatibility date

---

_Last updated: <!-- auto-fill date on commit -->_
