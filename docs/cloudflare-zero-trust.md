# Cloudflare Zero Trust (free tier) for canvhub

A walk-through of **every Zero Trust feature** on the free plan (50 user
seats), with copy-paste-ready settings tailored to canvhub. Everything
below is dashboard configuration only — no code change required, no
redeploy needed. The codebase already supports each step out of the box.

> The Cloudflare Access bit was already covered in
> [`cloudflare-setup.md` §4](./cloudflare-setup.md#4-cloudflare-access-on-admin-30-minutes).
> This doc expands to the rest of the Zero Trust dashboard (Tunnel, WARP,
> Gateway, Logs, Service Tokens) and adds the few Access details that
> didn't fit in the security-batch-2 doc.

Prerequisite: a Cloudflare account with `canvhub.com` already added as a
zone. If your billing plan reads anything other than **Zero Trust Free**,
double-check before clicking through; some screens look identical between
free and paid but the free tier silently caps you at 50 users / 1 GB
logs / no DLP / no Browser Isolation seats.

Apply in any order. Skip any step that doesn't fit your workflow — none
of them depend on each other.

## Table of contents

1. [Identity provider setup (Google)](#1-identity-provider-setup-google) — _required for every Access app_
2. [Cloudflare Access on `/admin/*`](#2-cloudflare-access-on-admin) — _the one feature with the highest ROI_
3. [Cloudflare Tunnel for your dev workflow](#3-cloudflare-tunnel-for-your-dev-workflow)
4. [WARP enrollment for your own devices](#4-warp-enrollment-for-your-own-devices)
5. [Gateway DNS filtering](#5-gateway-dns-filtering) — _optional, family-DNS style_
6. [Gateway HTTP filtering](#6-gateway-http-filtering) — _optional, malware/phishing for you personally_
7. [Service tokens for CI/CD or scripts](#7-service-tokens-for-cicd-or-scripts)
8. [Reviewing the audit log](#8-reviewing-the-audit-log)
9. [Hardening the team account itself](#9-hardening-the-team-account-itself)
10. [Features deliberately skipped](#10-features-deliberately-skipped)

## 1. Identity provider setup (Google)

Every Access policy you write below has to point at _some_ identity
provider. Google is the simplest because the free tier ships a built-in
Google login that doesn't require you to register your own OAuth app.

1. `one.dash.cloudflare.com → Settings → Authentication`.
2. Under **Login methods**, click **Add new**.
3. Pick **Google** (the one that says "no client ID needed").
4. Name: `Google`. Save.
5. (Optional) Also add **One-time PIN** as a fallback so you can still log
   in if Google is broken on your end. It emails a 6-digit code to any
   address you put in an Access policy's email allow-list.

That's the entire identity provider setup. You can verify it works by
clicking **Test** on the Google entry — a Google sign-in popup should
appear and confirm the account.

## 2. Cloudflare Access on `/admin/*`

The single highest-ROI Zero Trust feature for canvhub. Forces a verified
Google sign-in _before_ any request to `canvhub.com/admin/*` even reaches
the Pages build, so even if the admin Bearer token leaks, an attacker
still has to break into your Google account first.

The full step-by-step lives in
[`cloudflare-setup.md` §4](./cloudflare-setup.md#4-cloudflare-access-on-admin-30-minutes).
Two extra notes that doc didn't cover:

### Don't put `/api/admin*` behind Access

The admin SPA at `/admin/*` makes `fetch()` calls to `/api/admin/*`. If
you protect `/api/admin/*` with the same Access app, those fetches will
fail because they don't carry an Access cookie. Leave the API path
unprotected at the Access layer — it's already gated by the existing
admin Bearer token check inside `functions/api/_lib/admin-auth.js`. Access
on `/admin/*` is a _defense-in-depth_ layer for the HTML/SPA, not a
replacement for the API auth.

### Application launcher

After adding the Access app, your Cloudflare team URL — visible at
`Settings → Custom Pages → Team domain` — exposes a small Application
Launcher at `https://<team>.cloudflareaccess.com`. Bookmark it. From any
device, hitting that URL pops a tile for "Canvhub Admin" you can click
into. Saves typing the path.

### Self-test

In a private window:

1. `https://canvhub.com/admin` → redirected to Cloudflare login.
2. Google sign-in → land on the existing admin password screen.
3. Sign-in with a non-allowed email → "Access denied" page; the admin
   URL never resolves. Confirm in `Logs → Access` that the failed attempt
   shows up.

## 3. Cloudflare Tunnel for your dev workflow

Free, replaces ngrok. Lets you expose your local `npm run dev` over a
secure HTTPS URL so you can demo from your phone or share a preview with
a collaborator without opening a port on your home router.

### One-time setup

1. Install `cloudflared` locally:
   - macOS: `brew install cloudflared`
   - Linux: download the `.deb` from the [Cloudflare downloads page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and `sudo dpkg -i cloudflared.deb`.
   - Windows: `winget install --id Cloudflare.cloudflared`.
2. Authenticate the binary against your Cloudflare account:
   ```sh
   cloudflared tunnel login
   ```
   A browser window opens, you pick `canvhub.com`, and a cert is saved at
   `~/.cloudflared/cert.pem`.

### Create a named tunnel

```sh
cloudflared tunnel create canvhub-dev
```

This prints a tunnel UUID. Don't lose it.

### Map a hostname to the tunnel

```sh
cloudflared tunnel route dns canvhub-dev dev.canvhub.com
```

Cloudflare adds the DNS CNAME automatically. After this, `dev.canvhub.com`
exists publicly but doesn't resolve to anything yet.

### Run the tunnel pointed at your dev server

```sh
cloudflared tunnel --url http://localhost:5173 run canvhub-dev
```

(Vite defaults to `5173`.) Now `https://dev.canvhub.com` proxies straight
to your laptop's dev server with a real Cloudflare cert. Stop the tunnel
with `Ctrl-C`; the hostname stops resolving.

### (Optional) Gate `dev.canvhub.com` with Access

Combine with step 2: add another Access application for `dev.canvhub.com`
so only you can see your local dev server. Otherwise the tunnel URL is
publicly reachable for as long as it's running.

### Networks → Connectors / Routes in the dashboard

The named tunnel and route you created appear under
`one.dash.cloudflare.com → Networks → Connectors` (the `cloudflared`
process is the connector) and `Networks → Routes` (the public hostname
mapping). You can stop / restart / re-route from the dashboard without
touching the CLI.

## 4. WARP enrollment for your own devices

Free up to 50 devices. Installs a Cloudflare-managed VPN client on your
laptop / phone so DNS and HTTP traffic from those devices runs through
Cloudflare's gateway. Lets the next two sections (Gateway DNS / HTTP
filtering) do anything at all — those policies only apply to traffic that
has WARP installed.

### Set the team domain

If you haven't already: `one.dash.cloudflare.com → Settings → Custom
pages → Team domain`. Pick something short like `pintaterra` (this
becomes `pintaterra.cloudflareaccess.com`).

### Define enrollment policy

1. `Settings → WARP Client → Device enrollment permissions → Edit`.
2. Add a rule: **Allow** → **Emails** → `incubusk90@gmail.com` (and any
   other accounts you want to enroll).
3. Save.

### Install WARP

- macOS / Windows / Linux: download from
  `1.1.1.1/family` (the same client doubles as the Zero Trust agent).
- iOS / Android: install **1.1.1.1: Faster Internet** from the App Store /
  Play Store.

### Connect to the team

In the WARP app: **Preferences → Account → Login with Cloudflare for
Teams** → enter the team domain you picked above → sign in with Google
(or whatever provider you wired in step 1).

### Verify

- WARP icon should turn solid orange / "Connected to Cloudflare for
  Teams" → the device is now enrolled.
- `one.dash.cloudflare.com → Team & Resources → Devices` should list it.

## 5. Gateway DNS filtering

DNS-level domain blocking applied to every device on your team. Useful
to silently kill known-bad domains (malware C2, phishing kits,
adware/trackers) before any HTTP request goes out.

Works only on devices that have WARP installed (step 4).

### Build a DNS policy

1. `Traffic policies → Resolver policies → Add a policy`.
2. Suggested baseline rule for canvhub:

   | Rule                            | Selector           | Operator | Value                         | Action |
   | ------------------------------- | ------------------ | -------- | ----------------------------- | ------ |
   | Block known malware             | Content Categories | in       | `Security Threats → Malware`  | Block  |
   | Block phishing                  | Content Categories | in       | `Security Threats → Phishing` | Block  |
   | Block adult / gambling          | Content Categories | in       | `Adult Themes`, `Gambling`    | Block  |
   | Block ads / trackers (optional) | Content Categories | in       | `Advertisements`, `Tracking`  | Block  |

3. Save. The policy applies to all WARP-enrolled devices instantly.

### Verify

On a WARP-enrolled device, try to resolve a known-bad test domain:

```sh
dig phishing.testcategory.com
```

Should return `0.0.0.0` instead of a real IP. If you accidentally over-
block (e.g. your bank ends up in the wrong category), add a higher-
priority **Allow** rule above the Block rule.

## 6. Gateway HTTP filtering

HTTP-level inspection, runs after DNS. Same scope as Gateway DNS — only
WARP-enrolled devices. Useful to block specific URLs / file types, or to
log HTTP activity for incident response.

### Build an HTTP policy

1. `Traffic policies → Firewall policies → Add a policy`.
2. Suggested rules:

   | Rule                                 | Selector           | Operator | Value                                  | Action              |
   | ------------------------------------ | ------------------ | -------- | -------------------------------------- | ------------------- |
   | Block executable downloads           | Download File Type | in       | `EXE`, `MSI`, `BAT`, `JS`, `VBS`       | Block               |
   | Inspect SSL only on risky categories | Content Categories | in       | `Newly Registered`, `Security Threats` | Inspect SSL + Allow |
   | Log everything else                  | (no condition)     | —        | —                                      | Allow + Log         |

3. Save.

### Caveats

- HTTPS inspection requires installing the Cloudflare CA on each device.
  Skip this if you don't want the certificate hassle — `Allow + Log` on
  encrypted traffic still gets you SNI and category metadata.
- DLP (Data Loss Prevention) lives under HTTP filtering on the paid
  tiers. Free tier has it visible in the sidebar but every interesting
  pattern is greyed out — don't bother.

## 7. Service tokens for CI/CD or scripts

If you ever want to call a Cloudflare-Access-protected endpoint from a
script, you can mint a service token instead of forcing the script to
do interactive sign-in. Note that the nightly KV backup endpoint at
`/api/admin/export-backup` deliberately uses a static `BACKUP_TOKEN`
bearer instead of admin sessions or Access service tokens — see
[`docs/backup-recovery.md`](./backup-recovery.md) for the rationale.

1. `Access controls → Service credentials → Create Service Token`.
2. Name: `Canvhub Backups`. Save.
3. Copy the **Client ID** and **Client Secret** (shown once).
4. In the Access policy on `/admin/*`, add a new include rule: **Service
   Token** → `Canvhub Backups`.
5. From your script:
   ```sh
   curl https://canvhub.com/admin/api/whatever \
     -H "CF-Access-Client-Id: $CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CLIENT_SECRET"
   ```

Service tokens never expire until you rotate them; treat them like
long-lived secrets.

## 8. Reviewing the audit log

Free tier retains 24 hours of authentication and gateway logs.

- `Insights → Logs → Access`: every Access login attempt (success +
  failure), the email, the country, the application matched.
- `Insights → Logs → Gateway`: DNS + HTTP queries from WARP-enrolled
  devices.
- `Insights → Logs → User audit`: who changed which Zero Trust
  configuration, when.

The repo's own audit log (`AUDIT_LOG` KV → admin → Security panel) is
_application-level_ and survives indefinitely up to 500 entries. The
Cloudflare logs above are _infrastructure-level_. Keep both, they answer
different questions.

## 9. Hardening the team account itself

Cloudflare account compromise = canvhub compromise. Two free knobs that
prevent that.

### 2FA on the Cloudflare login

`dash.cloudflare.com → My Profile → Authentication`. Enable
**Authenticator App** _and_ **Security Key** (a hardware key like a
Yubikey if you own one). Don't rely on SMS — SIM swap is the #1 way
small-business Cloudflare accounts get owned.

### Require 2FA across the team

`Account Home → Manage Account → Members`. For every member (in your
case, just yourself), confirm 2FA is on. Cloudflare also lets you
enforce SSO for the account, but that's only useful when you have
multiple humans — overkill for a solo project.

### Restrict API token scopes

If you've created any API tokens (`My Profile → API Tokens`), audit them.
Each token should be scoped to the minimum permissions it needs. Delete
tokens you don't recognise. Tokens with `Account: All` or `Zone: All` +
write are a single-account-takeover-away from a wipe.

## 10. Features deliberately skipped

These are visible in the sidebar but either paid or wrong-tool for
canvhub. Don't waste time.

| Feature                                         | Why skip                                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data Loss Prevention (DLP)**                  | Free tier shows the UI but every detection profile is locked. Wrong tool anyway — it scans outbound traffic from _your_ devices into SaaS apps, not your storefront. |
| **Email Security**                              | Paid (former Area 1). Use plain Email Routing (regular Cloudflare dashboard) for forwarding, that's free.                                                            |
| **Browser Isolation**                           | Tiny free seat allowance. Useful for clicking sketchy links in a remote browser, but you have no obvious use case.                                                   |
| **AI Controls (Beta)**                          | Paid. Filters employee LLM prompts. You don't have employees.                                                                                                        |
| **Cloud & SaaS findings (CASB)**                | Paid. Audits Google Workspace / Microsoft 365 / Slack tenants.                                                                                                       |
| **Posture findings / Content findings**         | Paid (CASB).                                                                                                                                                         |
| **Egress policies**                             | Paid add-on. Forces traffic from your devices to leave Cloudflare from a chosen country. Niche.                                                                      |
| **AI controls / Targets / Resolvers & Proxies** | Either paid or networking-team-only features.                                                                                                                        |

## Doing it all in one evening

If you want a minimal-effort path that captures ~95% of the free Zero
Trust value:

1. Identity provider (Google) — 5 min — §1.
2. Access on `/admin/*` — 10 min — §2.
3. WARP on your laptop + phone — 10 min — §4.
4. One DNS policy blocking `Security Threats` categories — 5 min — §5.
5. 2FA on the Cloudflare login — 2 min — §9.

Total: ~30 minutes. The rest (Tunnel, HTTP filtering, service tokens) you
can layer on as the use cases come up.
