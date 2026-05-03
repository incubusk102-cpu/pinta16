# Observability — analytics & error monitoring

`canvhub` ships with two opt-in observability integrations. Both are
**graceful no-ops** when their env var is unset, so the site works
identically with or without them; it just won't tell you when checkout
breaks at 2 AM unless you wire them up.

| Integration                  | What it does                              | Cost                                                      |
|------------------------------|-------------------------------------------|-----------------------------------------------------------|
| Cloudflare Web Analytics     | Privacy-preserving page-view + Core Web Vitals dashboard for canvhub.com | **Free**, included with Cloudflare        |
| Sentry (browser SDK)         | Captures uncaught JS errors + soft errors from the SPA, with stack traces and breadcrumbs | Free tier: 5k events/month, then paid |
| Sentry (Pages Functions SDK) | Captures uncaught errors from `functions/api/*` via `toucan-js`         | Same Sentry plan; same DSN works for both |

## 1. Cloudflare Web Analytics

This is the right first step — it's free, it's already running on
Cloudflare's edge so there's no third-party tag, and it doesn't use
cookies (so we don't need a consent banner under EU/PH rules).

### Enable

1. Go to https://dash.cloudflare.com → **Analytics & Logs → Web Analytics**.
2. Click **Add a site**, pick `canvhub.com`, accept the terms.
3. The dashboard now shows the JS snippet with a token; it looks like:

   ```html
   <script defer src='https://static.cloudflareinsights.com/beacon.min.js'
     data-cf-beacon='{"token":"YOUR_TOKEN_HERE"}'></script>
   ```

   **Copy only the token** (the value of `token`, not the whole script).

4. In Cloudflare Pages → **canvhub** → Settings → Environment variables
   → Production, add:

   | Variable                       | Value                       |
   |--------------------------------|------------------------------|
   | `VITE_CF_ANALYTICS_TOKEN`      | the token from step 3       |

5. Re-deploy (push to `main` or click "Retry deployment" in the Pages
   dashboard). On next page load, `src/lib/observability.ts` injects
   the beacon at runtime, and analytics start populating in the
   Cloudflare dashboard within a few minutes.

### Verify

- Open https://canvhub.com/ in a private window.
- DevTools → Network → search for `beacon.min.js`. You should see a 200
  from `static.cloudflareinsights.com`.
- After ~5 min the dashboard should show "Real-time visitors" > 0.

### Notes

- The token is **public** (it's literally embedded in the page);
  treating it as a secret isn't necessary. We still keep it in env so
  preview deploys can use a different site or none at all.
- Cloudflare strips visitor IP at ingest, so this is GDPR-/DPA-safe
  out of the box. No cookie banner required.
- CSP already allow-lists `static.cloudflareinsights.com` (script-src)
  and `cloudflareinsights.com` (connect-src) — see `public/_headers`.

## 2. Sentry — browser SDK

For uncaught JS errors and soft fetch errors. Free tier is plenty for
a launch — ~5k events/month.

### Enable

1. Sign up at https://sentry.io (or use existing org).
2. Create a project: **Platform → React**, name it `canvhub-web`.
3. Copy the **DSN** (looks like `https://abc123@o12345.ingest.us.sentry.io/67890`).
4. Cloudflare Pages → **canvhub** → Settings → Environment variables → Production:

   | Variable                          | Value                                                    | Required? |
   |-----------------------------------|-----------------------------------------------------------|-----------|
   | `VITE_SENTRY_DSN`                 | the DSN from step 3                                      | yes       |
   | `VITE_SENTRY_ENVIRONMENT`         | `production`                                             | optional  |
   | `VITE_SENTRY_TRACES_SAMPLE_RATE`  | `0.1` (10% — default), `0` to disable tracing entirely   | optional  |

5. Add the same `VITE_SENTRY_DSN` to **Preview** with environment
   `preview` so PR previews report errors to the same project under a
   distinguishable tag, or skip it for previews if you'd rather keep
   the noise out.
6. Re-deploy. `src/lib/observability.ts` lazy-imports `@sentry/react`
   only when `VITE_SENTRY_DSN` is set, so unconfigured deploys still
   pay zero cost.

### Verify

- Open https://canvhub.com/?sentry-test=1 in DevTools → Console:
  ```js
  throw new Error("sentry verification");
  ```
- The error should land in your Sentry project's "Issues" tab within
  ~30 s with full stack trace, breadcrumbs, and the URL.

### Tuning

- `tracesSampleRate` is `0.1` by default (10% of pageviews send a
  performance transaction). Lower it to `0` if you don't want any
  performance data.
- `sendDefaultPii: false` — we strip emails, IPs, and headers before
  send. To turn it on for a debugging window only, set
  `VITE_SENTRY_SEND_PII=1` and re-deploy. Roll back when you're done.

## 3. Sentry — Pages Functions SDK

Errors thrown inside `functions/api/*` end up in Cloudflare's runtime
logs but are awkward to grep, and there's no email alert. Toucan-js
solves that — it's a tiny (~10 KB) Sentry-compatible client built for
the Workers runtime.

### Enable

1. Same DSN as the browser SDK works (Sentry distinguishes by
   environment + release).
2. Cloudflare Pages → **canvhub** → Settings → Environment variables →
   Production:

   | Variable               | Value                                                        | Required? |
   |------------------------|---------------------------------------------------------------|-----------|
   | `SENTRY_DSN`           | same DSN as `VITE_SENTRY_DSN`                                | yes       |
   | `SENTRY_ENVIRONMENT`   | `production` (Functions don't see `VITE_*`)                  | optional  |
   | `SENTRY_RELEASE`       | the deploy SHA, e.g. `${{ github.sha }}` from the workflow   | optional  |

3. **Opt-in per endpoint** by importing the wrapper:

   ```js
   // functions/api/checkout.js
   import { wrapHandler } from "./_lib/sentry.js";

   export const onRequestPost = wrapHandler(async (ctx) => {
     // your existing handler body
     return new Response(JSON.stringify({ ok: true }));
   });
   ```

   Or, for ad-hoc reporting from inside an existing handler:

   ```js
   import { reportError } from "./_lib/sentry.js";

   try { ... }
   catch (err) {
     reportError(err, { request, env, ctx, tags: { route: "checkout" } });
     return new Response("Internal error", { status: 500 });
   }
   ```

4. Existing handlers stay untouched until you opt them in — no
   migration required. Suggested rollout order:

   1. `create-payment.js`, `check-payment.js` (highest revenue impact)
   2. `orders.js`, `customers.js`
   3. The rest, as you have time

### Verify

- Hit a wrapped endpoint with a request that you know will throw.
- The error lands in the same Sentry project under the
  `runtime: "cloudflare-worker"` tag.

## CSP

`public/_headers` already includes the analytics + Sentry hosts in
the right CSP directives:

| Directive    | Host                                                                       | Why                  |
|--------------|----------------------------------------------------------------------------|----------------------|
| `script-src` | `https://static.cloudflareinsights.com`                                    | beacon.js            |
| `connect-src`| `https://cloudflareinsights.com`                                           | beacon ingest        |
| `connect-src`| `https://*.ingest.sentry.io` and `https://*.ingest.us.sentry.io`           | Sentry event POSTs   |

If your Sentry org lives on a different region (`de`, `apac`), append
that subdomain to `connect-src` in `public/_headers`.

## Cost guardrails

- Sentry free tier: 5k errors/month. To keep that comfortable:
  - The default `tracesSampleRate` is `0.1` (one transaction per ten
    pageviews); errors are always sent at 100%.
  - Cloudflare Web Analytics is unmetered.
- If you blow through the Sentry quota, the SDK quietly drops events
  client-side — no user impact.

## Disabling

Unset (or blank) the env vars and re-deploy. Both integrations
silently no-op. CSP allowlist additions are harmless.
