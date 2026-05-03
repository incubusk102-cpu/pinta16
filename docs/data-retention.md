# Data retention & privacy policy

This document is the source of truth for **how long Canvas Hub holds
each kind of personal data**, **why**, and **how it gets deleted**.
Customers (and the Philippine NPC, if asked) can be pointed at this
page.

The user-facing privacy notice on the storefront (linked from the
footer) is the legal-language version of the same policy. If the two
ever drift, **this file wins** — update the storefront copy from here.

## Data we hold

| Data                                                                         | Where                          | Retention                                                      | Why                                                        |
| ---------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| **Order records** (name, email, phone, address, items, total)                | KV `ORDERS`                    | **5 years** from order date                                    | PH BIR requires invoice retention; refund / dispute window |
| **Customer accounts** (email, password hash, name, addresses, order history) | KV `USERS`                     | Until user deletes account; or **2 years** of inactivity       | Repeat-buyer experience; auto-purge inactive accounts      |
| **Newsletter subscribers** (email, opt-in source, IP, UA, timestamp)         | KV `NEWSLETTER`                | Until user unsubscribes                                        | Marketing consent record                                   |
| **Cart drafts** (sessionStorage)                                             | Browser-only                   | Lifetime of the tab                                            | UX — preserves typing across reloads                       |
| **Audit log** (admin actions, source IP, UA, timestamp)                      | KV `AUDIT_LOG`                 | **365 days** rolling                                           | Security forensics                                         |
| **Security events** (failed logins, geo-banned IPs, rate-limited IPs)        | KV `SECURITY_EVENTS`           | **30 days** rolling                                            | Lockout decisions, abuse trend                             |
| **Visitor heartbeats** (sessionId, last-seen)                                | KV `VISITORS`                  | **3 minutes** rolling                                          | Live-visitor counter                                       |
| **24h hourly history** (counts only — no PII)                                | KV `VISITORS:history-24h`      | 24 hours                                                       | Admin traffic chart                                        |
| **Server logs** (Cloudflare tail, Sentry)                                    | Third-party                    | **30 days** (Cloudflare default), **90 days** (Sentry default) | Debugging                                                  |
| **Off-site backups** (NDJSON dumps of all KV)                                | R2 + GitHub Actions artefact   | **90 days** rolling                                            | Disaster recovery                                          |
| **Payment metadata** (PayMongo intent ID, status)                            | KV `ORDERS` (alongside order)  | Same as order — **5 years**                                    | Refund / dispute                                           |
| **Card / GCash details**                                                     | **Never stored** by Canvas Hub | n/a                                                            | PayMongo is the PCI-scoped processor                       |

> Anything not in this table is **not** persisted. If you find it in a
> KV namespace and it's not on this list, that's a bug — file an
> incident note.

## Data we **do not** hold

- Card numbers, CVV, expiry — handled entirely by PayMongo. Canvas Hub
  never sees them.
- GPS history. The hybrid address picker uses the browser's
  `navigator.geolocation` once per visit if the user clicks "Use my
  location"; the resulting lat/lng is stored only on the order record
  (per § Order records) and is never streamed continuously.
- Browsing history beyond what server logs naturally capture (URL +
  IP). We don't run an analytics pixel.
- Demographics, gender, age beyond what the user voluntarily enters
  in their account profile.

## Customer-initiated deletion

A customer who emails `chaomen1998@gmail.com` asking for their data to
be deleted gets:

1. **Account deletion** — admin runs Admin → Users → search by email →
   Delete. Removes their `USERS` record and any `NEWSLETTER` row.
2. **Order anonymisation** — orders are _not_ deleted (BIR retention),
   but the customer's PII is replaced with `ANON-<ORDER_ID>` placeholder
   values. The financial record (total, items, payment ID) survives.
3. **Audit log entry** — the deletion itself is logged in `AUDIT_LOG`.
4. **Confirmation email** — sent within 7 days of the request, listing
   what was removed and what was anonymised + retained for tax reasons.

Target turnaround: **30 days** (PH NPC default for Data Subject
Requests).

## Auto-purge schedules

Cron-style cleanup tasks (see `functions/api/_lib/`):

- **Inactive users** — `runInactiveUserCleanup()` in
  `_lib/user-auth.js` removes accounts that haven't signed in for
  `INACTIVE_DAYS` (default 730 = 2 years). Runs on every authed admin
  request, throttled to once per 24h.
- **Audit log** — `audit-log.js` keeps the last 365 day-buckets;
  older buckets are deleted on each write.
- **Security events** — same pattern, 30 day-buckets.
- **Rate limits** — sliding-window keys auto-expire on read.
- **Backup retention** — GitHub Actions artefacts auto-expire at 90
  days. R2 lifecycle rule on `canvhub-backups` deletes objects older
  than 90 days.

## Notification

If a data leak / unauthorised access affects customer PII, Canvas Hub
will:

1. Notify affected users by email within **72 hours** of confirming the
   incident (PH NPC requirement).
2. Notify the National Privacy Commission within **72 hours** if the
   incident meets the mandatory notification threshold.
3. File an incident note in `docs/incidents/<date>-<slug>.md` covering:
   - what happened
   - whose data was affected
   - what was retained / exposed
   - mitigation steps
   - lessons learned

The contact for security disclosure is `chaomen1998@gmail.com` (also
in [`SECURITY.md`](../SECURITY.md) and `/.well-known/security.txt`).

## Review schedule

This policy is reviewed:

- **Annually** on the same date as the secrets rotation drill (Jan 15).
- **On each material change** to data collected (e.g. introducing a
  new third-party that receives PII).
- **After every privacy incident**, even if no change is required.
