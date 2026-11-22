# BIMI setup for canvhub.com

BIMI ([Brand Indicators for Message Identification](https://bimigroup.org/))
tells Gmail (and a growing list of other inboxes) which logo to display
next to messages from `canvhub.com`. Once the DNS record below is live
and Gmail re-fetches the domain, the **Canvas Hub** logo replaces the
generic person icon in the contact-card popover that appears when a
recipient taps the sender name.

## Prerequisites (already satisfied)

| Requirement                                                      | Status                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| DMARC at `p=quarantine` or `p=reject` with `pct=100`             | ✅ `_dmarc.canvhub.com` currently `p=quarantine; pct=100`                         |
| DKIM signing on outbound transactional mail (Resend)             | ✅ `resend._domainkey.canvhub.com` published                                      |
| Mailbox provider for `account@canvhub.com` / `order@canvhub.com` | Namecheap Private Email (`mx*.privateemail.com`) — orthogonal, BIMI is per-domain |
| DNS hosted somewhere we can add a TXT record                     | ✅ Cloudflare                                                                     |

## The logo

`public/images/bimi-logo.svg` is the [SVG Tiny 1.2 Portable/Secure](https://bimigroup.org/creating-bimi-svg-logo-files/)
profile required by BIMI. Notable choices:

- 512 × 512 square viewBox (BIMI mandates a square aspect ratio).
- Solid `#181613` background covering the entire viewBox — BIMI rejects
  any SVG with transparent pixels. Gmail draws the logo inside a circle,
  so the corners get cropped automatically.
- `<title>Canvas Hub</title>` is the accessible label.
- Inlined paths only; no external fonts, images, scripts, or
  `<foreignObject>` — these are all banned by the Tiny PS profile.

Once deployed by Cloudflare Pages, it's served at
`https://canvhub.com/images/bimi-logo.svg`.

## DNS record to add (Cloudflare)

In Cloudflare → `canvhub.com` → **DNS** → **Records** → **Add record**:

| Field   | Value                                                  |
| ------- | ------------------------------------------------------ |
| Type    | `TXT`                                                  |
| Name    | `default._bimi`                                        |
| Content | `v=BIMI1; l=https://canvhub.com/images/bimi-logo.svg;` |
| TTL     | Auto (or 3600)                                         |
| Proxy   | DNS only (greyed cloud)                                |

`default` is the BIMI selector. If you want to use a different selector
later (e.g. a holiday logo) you can add `default._bimi` _and_ something
like `holiday._bimi`, and the From header would pick which one via a
custom `BIMI-Selector` header — we don't need that yet.

## Verification

After adding the record:

1. Wait 5–10 minutes for DNS propagation, then check at
   <https://bimigroup.org/bimi-generator/> — paste `canvhub.com` and it
   will confirm the record is valid.
2. Send yourself a test email from the storefront (e.g. trigger the
   Welcome email by signing up with a fresh address, or place a test
   order).
3. Open the email in Gmail and tap the sender name — the Canvas Hub
   logo should appear in the contact card popover. **Gmail caches the
   absence of a BIMI record aggressively** — it can take 24–48 hours
   before the logo first shows. Subsequent updates to the SVG also take
   24+ hours to propagate.

## Optional: the blue verified checkmark

A [VMC (Verified Mark Certificate)](https://www.digicert.com/tls-ssl/verified-mark-certificates)
from DigiCert or Entrust costs roughly USD 1,000–1,500 / year and gets
you a small blue checkmark next to the logo in Gmail. **Skip it.** The
logo itself appears without a VMC; the checkmark is purely a trust
indicator that most stores don't bother with.

If we ever want it, the VMC URL goes in the `a=` parameter of the BIMI
record:

```
v=BIMI1; l=https://canvhub.com/images/bimi-logo.svg; a=https://canvhub.com/.well-known/vmc.pem;
```
