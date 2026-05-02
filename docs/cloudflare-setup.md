# Cloudflare dashboard setup (free-tier)

Companion notes for the security batch 2 PR. None of these steps modify the
codebase — they're dashboard toggles + (for Turnstile) two new env vars in
the Cloudflare Pages project. Everything below is **free** on the standard
Cloudflare plan that already hosts `canvhub.com`.

Apply in order. Each step is independent — you can stop at any point and the
site keeps working.

## 1. Bot Fight Mode (5 seconds)

Cuts a chunk of automated scraper / brute-force traffic at the edge before
it ever reaches the Pages Functions.

1. `dash.cloudflare.com → canvhub.com → Security → Bots`.
2. Toggle **Bot Fight Mode** to **On**.

That's it. No code change, no risk.

## 2. WAF Managed Rules (5 minutes)

Blocks known SQL-injection / XSS / bad-bot signatures at the edge.

1. `dash.cloudflare.com → canvhub.com → Security → WAF → Managed rules`.
2. Click **Deploy** on **Cloudflare Managed Ruleset**.
3. Leave the action as **Managed Challenge** (default).
4. Save.

## 3. Cloudflare Turnstile (15 minutes)

Free, unlimited CAPTCHA replacement. The PR already wires Turnstile into the
newsletter signup and the admin login form. Until you create the dashboard
widget the integration is dormant — forms work as today, no challenge shown.

### Create the widget

1. `dash.cloudflare.com → Turnstile → Add widget`.
2. **Widget name:** `canvhub`.
3. **Hostnames:** `canvhub.com` (and `*.pinta16.pages.dev` if you want the
   challenge to also run on Cloudflare Pages preview deploys).
4. **Widget Mode:** *Managed* (Cloudflare picks the right challenge).
5. Click **Create**.
6. Copy the **Site Key** and **Secret Key** off the next page — you'll need
   them in step 2.

### Wire the keys into Pages

1. `dash.cloudflare.com → Workers & Pages → canvhub (or pinta16)
   → Settings → Environment variables`.
2. Add **Production** + **Preview** vars:

| Variable | Type | Value |
|---|---|---|
| `VITE_TURNSTILE_SITE_KEY` | Plaintext | (the site key from above) |
| `TURNSTILE_SECRET_KEY` | **Encrypted (Secret)** | (the secret key from above) |

3. Save → trigger a redeploy (`Deployments → Retry deployment` on the latest
   production deploy).

### Verify

1. Open the site in a private window. Sign up to the newsletter.
2. The Turnstile widget should appear under the email field. If it stays in
   "interaction-only" mode you may not see anything visible — that's fine,
   the token is still issued.
3. Open `/admin` and try to log in. Same widget appears above the **Sign in**
   button.
4. In the dashboard at `Turnstile → canvhub → Analytics` you should start
   seeing solved-challenge counts within a couple of minutes.

If something breaks, just unset `TURNSTILE_SECRET_KEY` (or both vars) — the
forms gracefully fall back to "no challenge" mode.

## 4. Cloudflare Access on `/admin` (30 minutes)

This is the big one for security. It puts the entire `/admin` URL behind a
Cloudflare-issued login (Google sign-in, magic link, etc.) so even *reaching*
the admin page requires authentication. The existing password screen
becomes a second factor on top.

Free for ≤50 users.

### Create the application

1. `dash.cloudflare.com → Zero Trust → Access → Applications → Add an
   application → Self-hosted`.
2. **Application name:** `Canvas Hub admin`.
3. **Session duration:** `24 hours`.
4. **Application domain:** `canvhub.com` + path `/admin*`.
5. (If you want the same protection on previews:
   `*.pinta16.pages.dev`, path `/admin*`.)
6. Continue.

### Add the policy

1. **Policy name:** `Allow Incubus`.
2. **Action:** `Allow`.
3. Configure rules → **Include** → **Emails** → enter the Gmail addresses
   that should be allowed in (e.g. `incubusk67@gmail.com`).
4. Save.

### Pick the identity provider

If this is your first Access app you'll be prompted to set up an identity
provider:

1. **Login methods:** enable **Google** (built-in) — no client secret needed
   for the free tier.
2. (Optional) Also enable **One-time PIN** as a fallback so you can still
   log in if Google sign-in is broken.

### Verify

1. Open `/admin` in a private window.
2. You should hit the Cloudflare login page first (Google button).
3. After Google sign-in you land on the existing admin password screen.
4. Anyone whose Gmail isn't in the policy gets a polite "denied" screen
   without the admin URL ever loading.

### Codebase changes

None required. The `/admin` route and the password screen continue to work
unchanged; Cloudflare just gates the request before it reaches the app.

## 5. (Optional) Rate-Limiting Rules at the edge

Cloudflare's built-in rate-limiter complements the per-IP KV-based limiter
in `functions/api/_lib/rate-limit.js`. Free plan includes 1 rate-limit rule
out of the box, which is enough to protect `/api/admin-auth`.

1. `dash.cloudflare.com → canvhub.com → Security → WAF → Rate limiting
   rules → Create rule`.
2. **Field:** URI Path **contains** `/api/admin-auth`.
3. **When rate exceeds:** 30 requests per 10 seconds per IP.
4. **Action:** Block, **Duration:** 10 minutes.
5. Save.

This catches a credential-stuffing campaign that ramps up faster than the
in-app limiter can react.

## What the security PR ships in code (for reference)

- `functions/api/_lib/turnstile.js` — server-side `siteverify` helper, falls
  open when `TURNSTILE_SECRET_KEY` isn't set.
- `src/components/Turnstile.tsx` — client widget loader, renders nothing
  when `VITE_TURNSTILE_SITE_KEY` isn't set.
- Wired into `NewsletterForm.tsx` and the admin `AdminAuthGate`.
- `functions/api/_lib/lambda-event.js` — 5 MB body-size cap with a 413
  response, applied to every Function via the wrapper.
- `npm audit` clean (postcss bumped to 8.5.10+).
- CSP updated to allow `challenges.cloudflare.com` for the Turnstile
  script + iframe.

## 6. (Optional) R2 image storage — free up to 10 GB

By default, every product photo is JPEG-compressed in the browser and
stored as a base64 data URL inside the product record in KV. That works
forever but inflates storage by ~33% and balloons the JSON payload that
the storefront has to download for each list of products.

Switching to **R2** moves the bytes to a real object store with $0
egress and serves them via `/api/r/<key>`. The product record then only
has to remember the URL.

Free tier: **10 GB** of storage, **1 M** Class-A operations/month, **10
M** Class-B/month, **$0** egress forever. A small art gallery (a few
thousand paintings, modest traffic) stays free indefinitely.

Setup:

1. **Create the bucket.**
   `Workers & Pages → R2 → Create bucket`. Name `canvhub-uploads`.
   Optionally repeat with `canvhub-uploads-preview` for PR previews.
2. **Bind it to the Pages project.**
   `Workers & Pages → canvhub → Settings → Functions → R2 bucket
   bindings → Add binding`.
   - Variable name: `UPLOADS_BUCKET`
   - Bucket: `canvhub-uploads`
   - (Repeat under "Preview" with `canvhub-uploads-preview` for previews.)
3. **Uncomment the `[[r2_buckets]]` block in `wrangler.toml`** and push
   to `main`. Pages CI redeploys with the binding active.
4. **Verify.** Open the admin → Products → edit any product → upload a
   photo. You should *not* see the "saving images inline" toast. The
   stored URL in the product record will be `/api/r/products/.../...jpg`
   instead of `data:image/jpeg;base64,...`.

That's it. Until step 2 is done, `POST /api/uploads` returns **503** and
the admin upload UI silently falls back to the existing data-URL flow,
so you can merge the R2 PR before doing the dashboard config.

### What still uses the data-URL fallback

This first cut only migrates **product photo uploads** (the highest-
volume case). Hero slides, welcome-email banners, profile avatars, and
order-review attachments still go through the existing data-URL path.
Migrating those is a follow-up PR with the same shape.
