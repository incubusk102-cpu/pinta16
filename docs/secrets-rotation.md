# Secrets rotation runbook

This runbook covers the routine and emergency rotation of every secret
used by canvhub.com. The day-to-day cadence is **annual** for routine
rotation; **immediate** when a leak / compromise is suspected (laptop
stolen, key spotted in a public commit, contractor offboarded, etc.).

> **One golden rule**: never store the rotated value in a screenshot,
> chat message, email, or shell history. Use the password manager
> directly, or paste straight into the Cloudflare dashboard input.
>
> The legacy ("old") secret should stay valid for 24h after the new one
> is wired up so any in-flight requests don't 401 mid-flow. Then revoke.

## At-a-glance checklist

| Secret                                                    | Where it's stored                            | Rotation cadence          | Failure mode if leaked                                                    |
| --------------------------------------------------------- | -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `PAYMONGO_SECRET_KEY`                                     | Cloudflare Pages env (encrypted)             | Annual + on-leak          | Attacker can issue refunds, read payment intents                          |
| `PAYMONGO_PUBLIC_KEY`                                     | Cloudflare Pages env (plaintext)             | Annual + on-leak          | Limited — used only for client-side encryption                            |
| `MAPTILER_API_KEY`                                        | Cloudflare Pages env (plaintext)             | On-leak only              | Quota burn (capped by domain restriction — see below)                     |
| `GOOGLE_CLIENT_ID`                                        | Cloudflare Pages env (plaintext)             | On-leak only              | Limited — public-safe by design                                           |
| `GOOGLE_CLIENT_SECRET`                                    | Cloudflare Pages env (encrypted)             | Annual + on-leak          | Attacker can phish via custom OAuth flow                                  |
| `TURNSTILE_SECRET_KEY`                                    | Cloudflare Pages env (encrypted)             | Annual + on-leak          | Bots can bypass widget                                                    |
| `VITE_TURNSTILE_SITE_KEY`                                 | Cloudflare Pages env (plaintext)             | Tied to widget            | Public-safe by design                                                     |
| `EMAIL_API_KEY` (Brevo / Resend)                          | Cloudflare Pages env (encrypted)             | Annual + on-leak          | Attacker can send mail from order@canvhub.com                             |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` (+ `_ORDER` / `_WELCOME`) | Cloudflare Pages env (plaintext)             | Never (display strings)   | None                                                                      |
| `BACKUP_TOKEN`                                            | Cloudflare Pages env + GitHub Actions secret | Annual + on-leak          | Attacker can dump KV (PII, orders)                                        |
| `ADMIN_SESSION_SECRET`                                    | KV `ADMIN_AUTH:session-secret`               | On admin compromise       | All admin sessions stay valid; rotate via `?action=rotate-session-secret` |
| `USER_SESSION_SECRET`                                     | KV `USERS:session-secret`                    | On compromise             | All user sessions stay valid; rotate similarly                            |
| Admin password (PBKDF2 in KV)                             | KV `ADMIN_AUTH:credentials`                  | On compromise / quarterly | Attacker reaches the admin console                                        |
| Cloudflare API token (used by GH Actions for KV writes)   | GitHub Actions secret                        | Annual + on-leak          | Attacker can clear KV / publish Pages                                     |

---

## Routine rotation (annual)

Schedule a calendar reminder for **Jan 15** every year. Do these in this
order to minimise downtime:

### 1. PayMongo

1. https://dashboard.paymongo.com → **Developers → API Keys**
2. Click **Generate new secret key** (and **public key** if also
   rotating). Note both new values.
3. **Cloudflare Pages → canvhub → Settings → Environment variables**
   (Production):
   - Update `PAYMONGO_SECRET_KEY` (encrypted) and
     `PAYMONGO_PUBLIC_KEY` (plaintext) to the new values.
4. Trigger a redeploy (Pages → Deployments → Retry latest, or push any
   commit).
5. Place a **₱1 test order** end-to-end on the live site. Confirm the
   QR generates, payment succeeds, and the order email lands.
6. Wait 24h. Then in PayMongo dashboard, **revoke** the old keys.

### 2. Email (Brevo / Resend)

1. Open the relevant provider:
   - Brevo: https://app.brevo.com → **SMTP & API → API Keys**
   - Resend: https://resend.com/api-keys
2. Create a new key with the same scope as the old one.
3. Cloudflare Pages → update `EMAIL_API_KEY` (encrypted) → redeploy.
4. From Admin → Email tools, send a test email to a working inbox
   (e.g. `chaomen1998@gmail.com`). Confirm delivery.
5. After 24h, revoke the old key in the provider dashboard.

### 3. Turnstile

1. https://dash.cloudflare.com → **Turnstile → canvhub → Settings**
2. Click **Rotate secret key**. Copy new value.
3. Cloudflare Pages → update `TURNSTILE_SECRET_KEY` (encrypted) →
   redeploy.
4. Submit the newsletter form on the live site. Confirm subscribe still
   works.
5. Site key (`VITE_TURNSTILE_SITE_KEY`) does **not** need rotating
   unless the widget itself is rebuilt — it's public by design.

### 4. Google OAuth

1. https://console.cloud.google.com → **APIs & Services → Credentials**
2. Click your OAuth 2.0 Client → **Reset secret**.
3. Cloudflare Pages → update `GOOGLE_CLIENT_SECRET` (encrypted) →
   redeploy.
4. Sign in with Google on the live site. Confirm flow completes.

### 5. Backup token

1. Pick a fresh 64-char random hex: `openssl rand -hex 32`.
2. Cloudflare Pages → update `BACKUP_TOKEN` (encrypted).
3. **GitHub repo settings → Secrets and variables → Actions** →
   update `BACKUP_TOKEN` to the same value.
4. Manually trigger the backup workflow in **Actions**. Confirm the
   artefact appears.

### 6. Admin session secret

The session secret signs admin JWTs. Rotating invalidates every active
admin session, so do this after-hours.

1. Hit `https://canvhub.com/api/admin-auth?action=rotate-session-secret`
   with a valid admin Authorization header (use Postman or `curl`).
2. Sign in to the admin console fresh.

### 7. User session secret

Same shape as admin, but for the storefront `/account` flow. Hit
`/api/users?action=rotate-session-secret` from an admin-auth'd context.

---

## Emergency rotation (suspected leak)

If a secret is in a public commit, screenshot, or otherwise visible:

1. **Revoke first, rotate second.** Don't wait for the deploy — even a
   60-second window is enough for an attacker to do real damage with
   `PAYMONGO_SECRET_KEY` or `EMAIL_API_KEY`.
2. **PayMongo**: dashboard → revoke key. Then create a new one.
3. **Brevo / Resend**: dashboard → delete API key. Then create a new
   one.
4. **MapTiler / Google / Turnstile**: same — delete-then-create flow.
5. Update Cloudflare Pages env with new value.
6. Redeploy.
7. **Audit `git log` for the commit that leaked the secret.** If the
   commit is on `main`, do not rewrite history — the secret is already
   public and rotation is the only mitigation. If it's a local branch,
   amend / rebase before pushing.
8. Search Sentry / Cloudflare logs for the time window between leak
   and rotation. Look for unusual activity (refunds, large exports,
   sudden spike in emails, KV writes).
9. If user data was involved, file a privacy incident note in
   `docs/incidents/<date>-<slug>.md` and notify affected users per
   `docs/data-retention.md` § Notification.

---

## Hardening notes

- **MapTiler key** is browser-shipped by design; restrict it by
  HTTP-Referer (`*.canvhub.com/*`, `*.pinta16.pages.dev/*`,
  `localhost:*/*`) in the MapTiler dashboard so a leaked key can't be
  used from anywhere else. Re-verify the restriction after any new
  preview-domain rollout.
- **PayMongo public key** is also browser-shipped; PayMongo's own JS
  SDK uses it for client-side card encryption. Treat it like the
  MapTiler key — domain-restrict if PayMongo ever adds that feature
  (currently they don't).
- Never paste a rotated secret into Slack, GitHub Issues, email, or
  chat with anyone — including Devin sessions. Use the secrets prompt
  flow if a Devin session needs a key.
