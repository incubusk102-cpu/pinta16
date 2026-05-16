# Cloudflare dashboard setup (free-tier)

Companion notes for the security batch 2 PR. None of these steps modify the
codebase — they're dashboard toggles + (for Turnstile) two new env vars in
the Cloudflare Pages project. Everything below is **free** on the standard
Cloudflare plan that already hosts `canvhub.com`.

Apply in order. Each step is independent — you can stop at any point and the
site keeps working.

## 0. Disable the Pages git integration (one-time, important)

The repo deploys via the GitHub Actions workflow at
`.github/workflows/deploy.yml` (Direct Upload through Wrangler). If the
Cloudflare Pages **git integration** is also connected to this repo, the
two systems race on every push to `main`: each one builds and publishes
its own deployment, and whichever one finishes last wins as production.

When the git integration's queue lags behind (it routinely takes 10–90
minutes to process a backlog of commits), an older commit's build can
land on production _after_ a newer commit's build, silently reverting a
hotfix and bringing the previous bug back to live traffic.

To stop this race:

1. `dash.cloudflare.com → Workers & Pages → canvhub → Settings → Builds &
deployments → Git integration → Disconnect`.
2. Confirm the disconnect. Existing deployments stay in place; only the
   automatic-build-on-push behavior goes away.
3. From now on every production deploy comes from the
   `Deploy to Cloudflare Pages` GitHub Actions workflow, which is the
   authoritative source.

You can verify the disconnection worked by pushing a commit to a feature
branch and checking the **Deployments** tab — you should see exactly one
new deployment per push (the GitHub Actions one), not two.

## 1. Bot Fight Mode (5 seconds)

Cuts a chunk of automated scraper / brute-force traffic at the edge before
it ever reaches the Pages Functions.

1. `dash.cloudflare.com → canvhub.com → Security → Bots`.
2. Toggle **Bot Fight Mode** to **On**.

That's it. No code change, no risk.

> **Watch out — Bot Fight Mode breaks email images.**
>
> Gmail, iCloud, Outlook, and most other email clients fetch image URLs
> through a server-side image proxy when the recipient opens the email.
> Bot Fight Mode (and Under Attack mode) returns an HTTP 403 with
> `cf-mitigated: challenge` to those proxies because they can't solve
> the JS challenge, which leaves the recipient with broken-image
> placeholders in their order confirmation / in-progress / shipped /
> delivered emails.
>
> Two ways to handle this without disabling Bot Fight Mode globally:
>
> 1. **WAF Skip rule (recommended).** `Security → WAF → Custom rules →
Create rule`, name it `Skip BFM for email assets`, set
>    _When incoming requests match…_ to:
>
>    ```
>    (http.request.uri.path matches "^/(icon-512\\.png|email-icons/|api/welcome-asset/)")
>    ```
>
>    and set the action to **Skip → Browser Integrity Check, Bot Fight
>    Mode**. Save and deploy.
>
> 2. **Switch to Super Bot Fight Mode with Verified Bots = Allow.**
>    `Security → Bots → Configure Super Bot Fight Mode`. Set
>    _Likely automated_ and _Definitely automated_ to your desired
>    action, then under _Verified bots_ pick **Allow**. Gmail / Apple /
>    Outlook image proxies are on Cloudflare's verified-bots list and
>    will be passed through. (This requires a paid plan; the free
>    Bot Fight Mode does not have this toggle.)
>
> The **Email image health** card in Admin → Order email / Welcome
> email probes every image URL the email renderer references and reports
> any path that's still being challenged, so you can verify the rule is
> working before sending a real customer email.

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
4. **Widget Mode:** _Managed_ (Cloudflare picks the right challenge).
5. Click **Create**.
6. Copy the **Site Key** and **Secret Key** off the next page — you'll need
   them in step 2.

### Wire the keys into Pages

1. `dash.cloudflare.com → Workers & Pages → canvhub (or pinta16)
→ Settings → Environment variables`.
2. Add **Production** + **Preview** vars:

| Variable                  | Type                   | Value                       |
| ------------------------- | ---------------------- | --------------------------- |
| `VITE_TURNSTILE_SITE_KEY` | Plaintext              | (the site key from above)   |
| `TURNSTILE_SECRET_KEY`    | **Encrypted (Secret)** | (the secret key from above) |

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
Cloudflare-issued login (Google sign-in, magic link, etc.) so even _reaching_
the admin page requires authentication. The existing password screen
becomes a second factor on top.

Free for ≤50 users.

> For the rest of the free Zero Trust feature set (Tunnel, WARP, Gateway
> DNS / HTTP filtering, service tokens, audit log review), see
> [`cloudflare-zero-trust.md`](./cloudflare-zero-trust.md).

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

## 6. Live security tuning panel (Admin → Security)

The repo ships an admin panel that lets you tune rate-limit windows,
Turnstile mode, the body-size cap, and the IP block list at runtime
without touching code or redeploying. It needs a `SECURITY_CONFIG` KV
namespace bound to the Pages project. As of PR #212 the binding is wired
in `wrangler.toml`; you only do this once per deploy environment.

If the namespace already exists for your account, you can skip ahead to
"Verify" below.

1. `dash.cloudflare.com → Workers & Pages → KV → Create namespace`.
2. Name `canvhub-security-config`. Copy the 32-char namespace ID.
3. Repeat with `canvhub-security-config-preview`. Copy that ID too.
4. Open `wrangler.toml`, find the `SECURITY_CONFIG` block at the bottom,
   paste the production ID into `id` and the preview ID into
   `preview_id`. Push to `main`. Pages redeploys with the binding live.
5. **Verify.** Open `canvhub.com/admin → Security`. The yellow
   "SECURITY_CONFIG KV namespace not bound" banner should be gone.
   Drag any setting (e.g. body-size cap from 5 MB → 6 MB), click Save,
   refresh — the value should persist.

The panel reads a 30-second cached snapshot of the namespace, so changes
propagate everywhere within a minute. All saves write an entry to the
`AUDIT_LOG` namespace alongside the existing admin login / order events,
so you can review who tweaked what.

## What the security PRs ship in code (for reference)

- `functions/api/_lib/turnstile.js` — server-side `siteverify` helper, falls
  open when `TURNSTILE_SECRET_KEY` isn't set.
- `src/components/Turnstile.tsx` — client widget loader, renders nothing
  when `VITE_TURNSTILE_SITE_KEY` isn't set.
- Wired into `NewsletterForm.tsx` and the admin `AdminAuthGate`.
- `functions/api/_lib/lambda-event.js` — 5 MB body-size cap with a 413
  response, applied to every Function via the wrapper.
- `functions/api/_lib/security-config.js` + `src/components/admin/
SecuritySection.tsx` — read/write the live config in `SECURITY_CONFIG`
  KV. Defaults match the hardcoded values shipped in #204 / #206 so the
  binding is safe to add or remove.
- `npm audit` clean (postcss bumped to 8.5.10+).
- CSP updated to allow `challenges.cloudflare.com` for the Turnstile
  script + iframe.

## 7. (Optional) R2 image storage — free up to 10 GB

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
   photo. You should _not_ see the "saving images inline" toast. The
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
