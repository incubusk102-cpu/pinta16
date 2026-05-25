# Cloudflare KV / D1 / R2 infrastructure mapping

Canvas Hub deploys as a single Cloudflare Pages project (`canvhub`). All
persistent state lives in Cloudflare-native primitives bound to Pages
Functions. This document lists every binding, the production namespace
ID, the preview namespace ID, and a short note on what it stores so an
operator can audit isolation between production and PR-preview
environments at a glance.

Source of truth is `wrangler.toml` at the repo root — when in doubt,
read that file. This doc summarises it.

## KV namespaces

| Binding             | Stores                                                 | Production ID                      | Preview ID                         | Shared?             |
| ------------------- | ------------------------------------------------------ | ---------------------------------- | ---------------------------------- | ------------------- |
| `PRODUCTS`          | Painting catalog (single-key `all-products` JSON blob) | `a892c12dd94048669dbd1cd8f77ef031` | `2424f379a3c84ee4a0beffa1c3c4ac77` | No                  |
| `HERO_SLIDES`       | Admin-uploaded hero carousel slides                    | `e3384f7eea9941eda995c060b9e35949` | `70a56fa3c31f4872b5d02c4c572531a8` | No                  |
| `STOREFRONT_CONFIG` | Site-wide storefront flags, hero CTA, etc.             | `b19124e7c1a14becb530474591d58576` | `7ac4624bf7e14db2b5dc7e319000ce28` | No                  |
| `POLICIES`          | Terms / refund / shipping / privacy bodies             | `bd612e81f61e46ff930483b2b0695485` | `695bffdeacd241019bdc8b67cc972b7b` | No                  |
| `NEWSLETTER`        | Email signup list                                      | `29dfcf9ede214827b3fce888a3591f29` | `38f1b48025f447c7a269df1a07fcc32f` | No                  |
| `VISITORS`          | Live visitor counts + 24h hourly history (TTL)         | `eea654b5603f4e47bdc9ac002506ce9a` | `08063c118579438b91b45782f9cd0010` | No                  |
| `ORDERS`            | Customer orders + review/return history                | `84646326b4a04e5c88e4fbb18d87969d` | `6a21856fc7da43a9aac06cd509e4b81b` | No                  |
| `USERS`             | Customer accounts (no card data)                       | `a6b407b9e8384a5893fe0c60ad2f9ece` | `86e8513e206949018aa89730a481a09a` | No                  |
| `CHAT_THREADS`      | Customer-support chat threads                          | `fd3e36943fc4436e9df7d8eee7971cf0` | `05e02e65089447719fb2c4acdfb49a0c` | No                  |
| `RATE_LIMITS`       | Sliding-window rate-limit buckets                      | `7e6af1c8231c4ca7b9f50e45ad0f6c4b` | `3bc241cf6ff04f78b54845c6abccb2d7` | No                  |
| `AUDIT_LOG`         | Admin action audit trail                               | `893b5fd53eeb4aa79c065a7ba8e7104e` | `927778dd0dd1476da6a68d6c852cfb7d` | No                  |
| `ADMIN_AUTH`        | Admin session tokens (PBKDF2)                          | `9f7a6ffd6e044110a2ee1e2b84e76956` | `2401b357b17948b0b09bd694ab850cbd` | No                  |
| `CUSTOMER_META`     | Customer LTV / segmentation metadata                   | `b55d858597374aaa8a0ff2ecf21a9177` | `a03c9102eeb1456d87683043d48e001d` | No                  |
| `SECURITY_CONFIG`   | Rate-limit overrides, Turnstile mode, body-size cap    | `89358933447747e58dee7f7e53dcf999` | `e717d43c38a64b8bb4efc387710620a7` | No                  |
| `SECURITY_EVENTS`   | Threat dashboard time-bucketed events                  | `67c757b425ee427b9c9bba0a16519ff7` | `67c757b425ee427b9c9bba0a16519ff7` | **Yes — see below** |
| `WISHLISTS`         | Per-user wishlist items                                | `32d60ee1d677430eb5fd950f2ede43d9` | `32d60ee1d677430eb5fd950f2ede43d9` | **Yes — see below** |
| `ABANDONED_CARTS`   | Cart snapshots for recovery email                      | _unbound_                          | _unbound_                          | n/a                 |

### Shared production+preview namespaces (`SECURITY_EVENTS`, `WISHLISTS`)

These two bindings currently use the same KV namespace ID for both
`id` and `preview_id`. PR previews therefore read and write the same
data as production for these two surfaces.

The pragmatic reasoning, originally captured in `wrangler.toml`
comments:

- `SECURITY_EVENTS` is mostly aggregate counters / hourly buckets;
  preview deploys rarely exercise the threat-detection path enough
  to dirty the data, and the threat dashboard is more useful when
  it shows the production timeline.
- `WISHLISTS` is per-user keyed (`user/<userId>`), so a preview
  deploy can only mutate the row of a customer who happens to sign
  in to the preview deployment — a vanishingly rare event.

**Risk:** A preview deploy with a regression in the rate-limit denial
path could pollute production `SECURITY_EVENTS` counters. A preview
deploy with a regression in `/api/wishlist` could corrupt a real
customer's wishlist (only if they sign in to the preview).

**Decision (2026-05-25):** Accepted risk for now. To remediate:

1. `npx wrangler kv:namespace create SECURITY_EVENTS_PREVIEW --preview` (and same for `WISHLISTS_PREVIEW`).
2. Replace the duplicate `preview_id` values in `wrangler.toml` with
   the new IDs.
3. `git push` to redeploy with isolated preview state.

See IMPROVEMENTS.md item 8 for the open task. Re-evaluate annually.

## D1 database

| Binding | Database  | Database ID                            | Notes                          |
| ------- | --------- | -------------------------------------- | ------------------------------ |
| `DB`    | `canvhub` | `68b3022d-91ff-4847-9412-a8cce8bdd508` | Single env (no preview clone). |

D1 free tier offers a single database — preview and production share
the same D1 instance. Schema changes go through `migrations/`. See
`AGENTS.md` § "Hybrid KV + D1 architecture" and `migrations/README.md`.

## R2 buckets

| Binding          | Bucket           | Preview bucket   | Notes                      |
| ---------------- | ---------------- | ---------------- | -------------------------- |
| `UPLOADS_BUCKET` | `canvhub-images` | `canvhub-images` | Preview reuses production. |

If preview deploys ever start carrying real customer uploads, create
`canvhub-images-preview` and update `preview_bucket_name` in
`wrangler.toml`.

## Workers AI / Turso (vector search)

- `AI` binding: Workers AI; no namespace separation needed (stateless).
- Turso (`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`): set as Pages
  environment variables, not bindings. Currently the same DB is used
  for preview and production; the rail falls back to rule-based
  recommendations when unset.

## Conventions for adding a new namespace

1. Create both production and preview namespaces in the Cloudflare
   dashboard — never reuse production data for previews unless you've
   explicitly justified the shared-state risk in this document.
2. Add the `[[kv_namespaces]]` entry to `wrangler.toml` with **both**
   `id` and `preview_id` set.
3. Append a row to this table.
4. Mirror the binding into the Pages dashboard
   (Workers & Pages → canvhub → Settings → Functions → KV namespace
   bindings) so it's available at runtime — `wrangler.toml` alone is
   not sufficient for Pages.
