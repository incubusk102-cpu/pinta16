# Security Policy

Canvas Hub takes the security of its storefront, admin, and customer data
seriously. We welcome reports from independent security researchers and
will work with you in good faith to investigate and remediate any
vulnerability you find.

## Reporting a vulnerability

If you believe you've discovered a security issue in Canvas Hub
(`canvhub.com`, `*.pinta16.pages.dev`, or any of the Cloudflare Pages
Functions under `/api/*`), please **do not file a public GitHub issue**.

Email **`support@canvhub.com`** with:

- A clear description of the issue and its impact.
- The minimal steps required to reproduce it (URL, request body, account
  state, or a short script).
- Your name and a way to contact you for follow-up. PGP / signed email is
  not required.

We aim to:

- **Acknowledge your report within 72 hours** of receipt.
- **Provide a status update within 7 days**, including whether the issue is
  accepted, what severity we've assigned, and a rough remediation timeline.
- **Notify you when the fix is deployed**, and credit you in the release
  notes / `SECURITY.md` history if you'd like (let us know).

## Scope

In scope:

- The production storefront (`https://canvhub.com`) and any preview
  deployments under `*.pinta16.pages.dev`.
- All Cloudflare Pages Functions under `/api/*`.
- The admin panel at `/admin`.
- The PayMongo / MapTiler / Cloudflare Turnstile integrations as wired in
  this codebase.

Out of scope (not eligible reports):

- Issues in third-party services we depend on but don't operate
  (`api.paymongo.com`, `api.maptiler.com`, Google Sign-In, etc.) — please
  report those to the respective vendor directly.
- Findings that require a compromised admin account, physical access to a
  user's device, or a malicious browser extension.
- Reports that consist solely of automated scanner output without a
  demonstrated impact (we already block well-known scanner probes at the
  edge — see `functions/api/_lib/handler-wrapper.js`).
- Missing security headers on `*.pages.dev` preview hostnames that are
  already present on the production hostname (previews intentionally have
  a slightly looser policy for development).
- Best-practice / "defense-in-depth" suggestions without a demonstrated
  exploitable impact.

## Safe harbor

If you make a good-faith effort to comply with this policy:

- We will not pursue legal action or contact law enforcement against you
  for the act of researching the issue.
- We will work with you to understand and resolve the issue quickly.
- We ask that you give us a reasonable amount of time to remediate before
  any public disclosure (typically 90 days, or sooner if we agree).

Please do not:

- Run automated scanners that generate sustained traffic against the
  production site without coordinating with us first.
- Modify, exfiltrate, or destroy data that doesn't belong to you.
- Use social engineering, phishing, or physical attacks against Canvas Hub
  or its customers as part of your testing.
- Demand monetary compensation as a condition of disclosure (we run a
  small storefront and don't operate a paid bug-bounty program — but a
  thank-you and credit are always given).

## See also

- [`/.well-known/security.txt`](./public/.well-known/security.txt) — the
  RFC 9116 machine-readable version of this contact.
- [`docs/cloudflare-setup.md`](./docs/cloudflare-setup.md) — the WAF /
  Bot Fight Mode / Turnstile / Access setup that backs the application
  layer hardening.
