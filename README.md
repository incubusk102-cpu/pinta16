# Canvas Hub — `canvhub.com`

[![Cloudflare Pages](https://img.shields.io/badge/cloudflare-pages-orange?logo=cloudflare)](https://canvhub.com/)
[![Node](https://img.shields.io/badge/node-20.x-brightgreen?logo=node.js)](.github/workflows/deploy.yml)

Original-painting gallery and storefront for **Canvas Hub**, a
Philippines-based hand-crafted-art shop. Production site:
**[https://canvhub.com](https://canvhub.com/)**.

The whole site — front-end SPA, JSON API, and persistent storage —
runs on the Cloudflare edge. There is no separate back-end server.

## Stack

| Layer          | What                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front-end      | React 19 + TypeScript, [TanStack Router](https://tanstack.com/router), Tailwind 4, [Radix UI](https://www.radix-ui.com/), framer-motion, [shadcn/ui](https://ui.shadcn.com/)-style primitives |
| Build          | Vite 7 (SPA, output to `dist/`)                                                                                                                                                               |
| Hosting        | Cloudflare Pages (`canvhub` project), deployed by GitHub Actions                                                                                                                              |
| API            | Cloudflare [Pages Functions](https://developers.cloudflare.com/pages/functions/) under `functions/api/*`                                                                                      |
| Storage        | 14 [Cloudflare KV](https://developers.cloudflare.com/kv/) namespaces (orders, products, users, policies, …) — see `wrangler.toml`                                                             |
| Payments       | [PayMongo](https://www.paymongo.com/) (cards, GCash, GrabPay, Maya)                                                                                                                           |
| Email          | Cloudflare email routing + transactional providers                                                                                                                                            |
| Bot mitigation | [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) (admin-toggle-able from `/admin → Security`)                                                                             |
| PWA            | Service worker + Web Push (VAPID) for order-status notifications                                                                                                                              |
| Image pipeline | Build-time `sharp` → responsive WebP variants (`scripts/optimize-images.mjs`)                                                                                                                 |

## Getting started

### Prerequisites

- **Node.js 20.x** (matches `actions/setup-node` in `.github/workflows/deploy.yml` and the `NODE_VERSION` env var in the Pages dashboard).
- **npm 10+** (ships with Node 20).
- A POSIX shell for the optional `wrangler` workflows.

### Install and run

```bash
git clone https://github.com/incubusk102-cpu/pinta16.git canvhub
cd canvhub
npm ci          # exact install from package-lock.json
npm run dev     # Vite dev server on http://localhost:5173
```

The dev server proxies `/api/*` to a local
[`wrangler pages dev`](https://developers.cloudflare.com/pages/functions/local-development/)
instance if one is running on port `8788`; otherwise unauthenticated API
calls fall back to fixture data so the storefront is browseable
without secrets.

### Useful scripts

| Command                    | What                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `npm run dev`              | Vite dev server (HMR, no SSR)                                      |
| `npm run build`            | Production build into `dist/` (runs `prebuild` first)              |
| `npm run prebuild`         | Pre-generate responsive WebP variants under `public/images/_resp/` |
| `npm run preview`          | Preview the built `dist/` locally                                  |
| `npm run lint`             | `eslint .` — fails the commit on errors, warnings OK               |
| `npm run format`           | `prettier --write .` across the repo                               |
| `npx tsc --noEmit`         | Strict TypeScript typecheck (not part of `lint`)                   |
| `npx wrangler pages dev .` | Run Pages Functions locally (needs `wrangler` config)              |

### Pre-commit hooks

The repo uses [Husky](https://typicode.github.io/husky) +
[lint-staged](https://github.com/lint-staged/lint-staged). After
`npm ci`, the `prepare` script wires `core.hooksPath` to `.husky/`
automatically. On every `git commit`, staged files are run through
ESLint (`--fix`) and Prettier; commits that produce remaining ESLint
errors are blocked. To intentionally bypass (e.g. an emergency
hotfix) use `git commit --no-verify` — but please don't.

The hook is intentionally fast (only staged files); a full
`npm run lint` is left for CI.

## Project layout

```
.
├── functions/api/          Cloudflare Pages Functions (the JSON API)
│   ├── _lib/               Shared edge helpers — auth, rate-limit, KV, mail
│   ├── admin/              Admin-only endpoints (export-backup, …)
│   └── …                   One file per public endpoint
├── public/                 Static assets, _headers (CSP/HSTS), robots.txt
│   ├── images/_resp/       Generated WebP variants (do not edit by hand)
│   └── manifest.webmanifest PWA manifest
├── scripts/                Build-time scripts (image optimisation, …)
├── src/
│   ├── admin/              Authenticated admin SPA panels
│   ├── components/         Re-usable UI components
│   ├── contexts/           React Contexts (cart, auth, theme, policies, …)
│   ├── data/               Static seed data (default policy bodies, …)
│   ├── hooks/              Custom hooks (heartbeat, locale, push, …)
│   ├── lib/                Pure-TS helpers — pricing, shipment, push, pwa, …
│   ├── locales/            i18n bundles
│   ├── routes/             TanStack Router file-based routes
│   ├── main.tsx            SPA entry
│   └── router.tsx          Router configuration
├── docs/                   Operator-facing runbooks (backup, Cloudflare setup)
├── workers/                Standalone Worker scripts (if/when used)
├── .github/workflows/      CI/CD — deploy.yml, backup.yml
├── wrangler.toml           Pages config, KV bindings, compatibility flags
└── public/_headers         CSP, HSTS, X-Frame-Options, cache rules
```

## Deployment

The canonical deploy path is GitHub Actions →
`.github/workflows/deploy.yml` → Cloudflare Pages
(`pages deploy dist --project-name=canvhub`).

**Required GitHub Actions secrets** (Repo → Settings → Secrets and
variables → Actions):

| Secret                  | What                                                   |
| ----------------------- | ------------------------------------------------------ |
| `CANVHUB_PAGES_DEPLOY`  | Cloudflare API token with `Cloudflare Pages — Edit`    |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (right sidebar of the dashboard) |
| `BACKUP_TOKEN`          | Bearer token for nightly KV backup workflow            |
| `BACKUP_R2_TOKEN`       | (optional) R2 token for cold-storage of backups        |

KV namespace bindings, the `nodejs_compat` flag, and the
`pages_build_output_dir` live in `wrangler.toml`. Build settings
(Node version 20, build command `npm run build`, output `dist/`)
live in the Cloudflare Pages dashboard under
_Settings → Build & deployments_.

### Required environment variables (Cloudflare Pages → Settings → Environment variables)

| Variable                 | Used by                                | Notes                                 |
| ------------------------ | -------------------------------------- | ------------------------------------- |
| `PAYMONGO_SECRET_KEY`    | `functions/api/create-payment.js`      | Server-only; never exposed to the SPA |
| `VAPID_PUBLIC_KEY`       | `functions/api/push/*`                 | Web Push order-status notifications   |
| `VAPID_PRIVATE_KEY`      | `functions/api/push/*`                 | Server-only                           |
| `BACKUP_TOKEN`           | `functions/api/admin/export-backup.js` | Bearer token for nightly backup       |
| `TURNSTILE_SECRET_KEY`   | `functions/api/_lib/turnstile.js`      | Set when Turnstile is in hard mode    |
| `GOOGLE_OAUTH_CLIENT_ID` | `functions/api/google-callback.js`     | Sign-in-with-Google                   |

Anything client-visible must be prefixed `VITE_` and
configured at build time, not at runtime — Cloudflare Pages
exposes runtime env vars only to Functions, not to the SPA bundle.

## Operator runbooks

| Doc                                                              | What                                |
| ---------------------------------------------------------------- | ----------------------------------- |
| [`docs/cloudflare-setup.md`](docs/cloudflare-setup.md)           | Bot Fight Mode, WAF, Turnstile keys |
| [`docs/cloudflare-zero-trust.md`](docs/cloudflare-zero-trust.md) | Hardening notes for the admin panel |
| [`docs/backup-recovery.md`](docs/backup-recovery.md)             | Nightly KV dump + restore procedure |

## Security and privacy

- All routes served over HTTPS with HSTS preload (`public/_headers`).
- Strict CSP + `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Admin login: PBKDF2-SHA256 100k-iterations, sliding-window rate
  limit, optional Turnstile, audit log in KV.
- Card data never touches the application; PayMongo handles tokenisation.
- See `/policy/privacy` for the customer-facing policy.

## Contributing

1. Branch from `main`: `git checkout -b feature/short-description`.
2. Make your change, ensure `npm run lint` and `npx tsc --noEmit` are
   clean, run `npm run format` if you've touched formatting-sensitive
   files.
3. Commit with a clear message; the pre-commit hook will run
   eslint + prettier on staged files.
4. Open a PR against `main`. CI will build and deploy a preview to
   the Pages project automatically.

For agent / Devin guidance, see [`AGENTS.md`](AGENTS.md).

## License

Proprietary — © Canvas Hub. All paintings, photographs, and copy on
canvhub.com belong to Canvas Hub or the individual artists. The
source code is not currently licensed for re-use; please contact
[support@canvhub.com](mailto:support@canvhub.com) before forking or
re-deploying.
