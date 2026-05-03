# AGENTS.md

Guidance for AI agents (Devin, Claude Code, Cursor, …) and human
contributors working on `incubusk102-cpu/pinta16` /
[canvhub.com](https://canvhub.com/). For an end-user / new-developer
overview, start with [`README.md`](README.md).

## Mental model

This repo is **a single Cloudflare Pages deployment** that ships:

1. A React 19 SPA built with Vite (`src/`, output to `dist/`).
2. A JSON API as Pages Functions (`functions/api/*`).
3. 14 KV namespaces for persistent state (`wrangler.toml`).

There is **no Node.js server, no Docker, no Postgres**, and no
separate "back-end" repo. Anything that needs to persist past a page
load lives in KV; anything that needs Node-only APIs runs as a Pages
Function on the Workers runtime, not in the SPA bundle.

When adding a feature:

- UI lives in `src/` (page = `src/routes/`, leaf component =
  `src/components/`, business logic = `src/lib/`).
- Server logic lives in `functions/api/<endpoint>.js`. Yes, JS not
  TS — Pages Functions does not transpile TypeScript automatically.
- New persistent state needs a new KV namespace binding in
  `wrangler.toml` AND in the Cloudflare Pages dashboard.
- Anything customer-visible needs an entry in `src/locales/` (en + fil).

## Run / build / verify, in that order

```bash
# Install (will also wire up Husky pre-commit hooks via `prepare`)
npm ci

# Dev server (HMR, no SSR)
npm run dev

# Build for production — fails on TS or Vite errors
npm run build

# Lint — non-blocking warnings allowed, errors block commits
npm run lint

# Strict typecheck — currently 0 errors on main
npx tsc --noEmit

# Format the whole tree
npm run format
```

CI runs `npm ci && npm run build` (see `.github/workflows/deploy.yml`).
Anything that builds locally with the steps above will build in CI.

## Conventions

### TypeScript and React

- **Strict typing** — do not use `any`, `as unknown as`, `getattr`-style
  dynamic access, or `// @ts-ignore` to silence errors. Read the type
  and fix the call site.
- Prefer `interface` for public component / context shapes,
  `type` for unions / utilities.
- React 19 — use the new `use()` hook for context where it reads more
  cleanly, but classic `useContext` is still fine.
- Components default to **client-only** (no SSR). If you add anything
  that touches `window`, `document`, or `localStorage`, guard it with
  `typeof window !== "undefined"` or move it inside a `useEffect`.
- File-based routing via TanStack Router — every file in
  `src/routes/` is a route. Do not register routes manually.

### Styling

- **Tailwind 4** is the only styling system. Do not introduce
  CSS-in-JS, CSS modules, or `<style>` blocks.
- Reuse the design tokens defined in `src/index.css` and the existing
  Tailwind config. The site has a designed colour palette
  (`#1c1c1c` foreground, `#f5f3ee` background, gold accents); do not
  pick fresh colours from scratch.
- Spacing follows multiples of `0.25rem` (Tailwind defaults). Do not
  use arbitrary `[18px]`-style values unless absolutely necessary.
- Animations come from `framer-motion` for component-level motion and
  from `tw-animate-css` for utility-class animations. Honour
  `prefers-reduced-motion`.

### State management

- React Context is used heavily — see `src/contexts/`. There is no
  Redux / Zustand / Jotai.
- Cart, wishlist, theme, locale, auth state all persist via
  `localStorage` with versioned keys (e.g. `canvhub_cart_v3`). Bump
  the version suffix on a breaking schema change so older clients
  drop the old shape.
- Server state goes through `@tanstack/react-query` — `queryKey`s
  follow `["resource", id]` shape.

### Pages Functions (the API)

- Files in `functions/api/` are **plain JavaScript**, ESM modules
  exporting `onRequestGet`, `onRequestPost`, etc.
- KV bindings are accessed as `env.PRODUCTS`, `env.ORDERS`, etc.
  Never hardcode namespace IDs.
- Always use the helpers in `functions/api/_lib/`:
  - `rate-limit.js` — sliding-window limiter (cache + KV backends).
  - `admin-auth.js` — PBKDF2-protected admin sessions.
  - `mail.js` — transactional email helper.
  - `turnstile.js` — bot challenge verification.
- API responses default to `Cache-Control: no-store` (set globally
  in `public/_headers` for `/api/*`).
- Never log full payloads — they may contain customer email or
  shipping address.

### Security

- **Never** commit a secret. Real secrets live in Cloudflare Pages
  _Settings → Environment variables_ and GitHub Actions
  _Settings → Secrets and variables → Actions_. The repo's `.env*`
  files (excluded by `.gitignore`) are only for local fixtures.
- The CSP in `public/_headers` is strict; if you add a third-party
  script (analytics, error monitoring), update CSP and add a brief
  note to the file's header comment explaining why.
- Rate-limit any endpoint that mutates state, sends email, or hits a
  third party. See existing limits in `_lib/rate-limit.js`.
- Customer card data never touches the SPA or our Functions —
  PayMongo's hosted checkout flow is the only path for tokenisation.

## Pull requests

- One change per PR. Small, focused, easy to review.
- Branch name: `feature/<short>` for additions,
  `fix/<short>` for bug fixes,
  `chore/<short>` for tooling.
- The PR template asks for a _Summary_, _Review & Testing Checklist_,
  and _Notes_ — please fill all three. The checklist should reflect
  the actual risk: 0–3 items for green changes, 1–3 for yellow, 3–5
  for red.
- A pre-commit hook (Husky + lint-staged) runs ESLint + Prettier on
  staged files. CI runs `npm run build`, which fails on type errors.
- Do **not** force-push to `main`. Force-push (with
  `--force-with-lease`) on your own feature branch is fine when
  rebasing.

## Domain knowledge

A few opinions baked into the codebase that are easy to miss:

- **Currency is PHP**, formatted via `Intl.NumberFormat("en-PH")`.
  Never display raw numbers without a formatter.
- **Address validation** uses the PSGC (Philippine Standard Geographic
  Code) data in `src/data/ph-regions.ts`. Region / Province / City /
  Barangay are all dropdowns, never free text.
- **Couriers** are an enum in `src/lib/shipment.ts`. Do not let
  customers type a courier name; pick from `COURIERS`.
- **Time zone**: PHT (UTC+8). When formatting dates for end users,
  use `Asia/Manila` explicitly — Cloudflare Workers run in UTC and
  forgetting this is a frequent source of off-by-one bugs.
- **Visitor heartbeats**: the SPA pings `/api/visitors` every ~4
  minutes (`src/hooks/useVisitorHeartbeat.ts`). The `VISITORS` KV
  namespace stores live counts and 24h hourly history. Bot UAs are
  filtered server-side; do not add IP-based filtering (legal / DPA).

## What not to do

- Do not `npm install` a heavy dependency (anything > 50 KB
  uncompressed) without checking it can be replaced by a few
  hand-rolled lines or by a built-in.
- Do not add a runtime `Buffer` / `process` polyfill to the SPA;
  Vite's `vite-tsconfig-paths` and the `nodejs_compat` flag on the
  Pages side are enough.
- Do not edit files under `public/images/_resp/` — they are
  regenerated by `scripts/optimize-images.mjs`. Edit the source PNGs
  in `public/images/` and let the build do the rest.
- Do not use `getattr`-style dynamic property access in TypeScript
  (`obj[someStringVariable]` without a typed key). Add the union
  type and let TS verify.
- Do not introduce a database. KV is enough.
- Do not amend / force-push merged commits on `main`.

## Runbooks for common operator tasks

| Task                               | Doc                                                               |
| ---------------------------------- | ----------------------------------------------------------------- |
| Restore a KV namespace from backup | [`docs/backup-recovery.md`](docs/backup-recovery.md)              |
| Rotate the admin password          | `/admin → Settings → Security`                                    |
| Rotate `BACKUP_TOKEN`              | [`docs/backup-recovery.md`](docs/backup-recovery.md) § "Rotation" |
| Toggle Bot Fight Mode / WAF        | [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md)            |
| Add a Turnstile site key           | [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md)            |
| Publish or edit a legal policy     | `/admin → Policies` (writes to `POLICIES` KV)                     |

## Help

- Production issues: [support@canvhub.com](mailto:support@canvhub.com)
- Repo questions: open a GitHub Discussion or ping @incubusk102-cpu
- For agent sessions specifically — keep PRs small, push to a
  `devin/<timestamp>-<slug>` branch, and add the session URL to the
  PR description (the bot does this automatically).
