# Setting up the Gmail sender-chip avatar for Canvas Hub

When customers receive a Canvas Hub email in Gmail, the small circle next to
the sender's name in both the inbox list and the open message header is the
**sender chip avatar**. By default Gmail falls back to a coloured letter tile.
To show the Canvas Hub logo (or a personal photo) there, the sending address
has to be a real **Google Workspace mailbox** with a profile picture set on
that user account.

This doc walks through the process Ken used after picking a Workspace
mailbox for Canvas Hub.

## TL;DR

1. Confirm the address Cloudflare actually sends from is a Workspace
   mailbox — not an alias, group, or a third-party identity.
2. Sign in to that mailbox's Google account and upload a profile picture.
3. Wait ~1–2 days for Gmail's per-recipient avatar cache to refresh.

## Background: where Gmail gets the avatar

Gmail picks the sender chip avatar from the Google profile attached to the
verified `From:` address on the message. That requires two things to line
up:

- The `From:` address must resolve to a real Google account — typically a
  Workspace user on the sending domain.
- The message must authenticate as that sender (SPF / DKIM / DMARC must
  pass for the `From:` domain), so Gmail trusts that we are who we say we
  are before showing our profile photo.

If either condition is missing — for example, when mail is relayed through
a third-party (Resend, Brevo, Mailgun, etc.) using a vanity `From:` that
has no Workspace mailbox behind it, or when DKIM is signed for the relay
provider's domain only — Gmail will show the coloured letter fallback no
matter how many photos you upload.

## Step 1 — Confirm the sending address is a Workspace mailbox

The header customers actually see is set by the `EMAIL_FROM` environment
variable on Cloudflare Pages (and any per-purpose overrides such as
`EMAIL_FROM_ORDER`). The "From email (display)" field in the admin UI is
just a label — it does not change what Gmail sees. See
`functions/api/_lib/email.js` for the resolution logic.

Things to check before touching profile pictures:

- **It's a user, not an alias or group.** In Google Workspace Admin,
  open *Directory → Users* and search for the address (e.g.
  `orders@canvhub.com`). It must appear as a standalone **user**. If it
  shows up only under *Aliases* of another user, or under *Groups*, it
  has no profile of its own and cannot carry an avatar — point Cloudflare
  at a real user mailbox first, or promote the alias to its own user.
- **It matches `EMAIL_FROM` exactly.** Open the Cloudflare Pages project
  for `canvhub` → *Settings → Environment variables* and confirm
  `EMAIL_FROM` (and any `EMAIL_FROM_<PURPOSE>` override you care about,
  e.g. `EMAIL_FROM_ORDER`) is in the form
  `Canvas Hub <orders@canvhub.com>` and the bracketed address is the
  Workspace user from the previous bullet. If multiple purposes are in
  use (orders, account, marketing, …), each `From:` address needs its own
  Workspace mailbox + photo if you want the avatar everywhere.
- **Auth is clean for that domain.** Send a test message and confirm the
  receiving Gmail shows "signed-by: canvhub.com" and "mailed-by:
  canvhub.com" under *Show original*. If DKIM is signed by the relay
  provider's domain only, Gmail will not attribute the message to the
  Workspace identity even though the address matches.

If any of those fail, fix them first — no amount of waiting will surface
an avatar otherwise.

## Step 2 — Upload the profile picture on that user account

Once the `From:` address is a verified Workspace user:

1. Sign in to Google as that user. Either:
   - Have the mailbox owner sign in directly at
     <https://accounts.google.com/>, or
   - As a Workspace super admin, use *Admin Console → Users → (user) →
     "Sign in as user"* to act on their behalf.
2. Open <https://myaccount.google.com/profile> (or click the avatar in
   the top-right of any Google app → *Manage your Google Account →
   Personal info → Photo*).
3. Upload the Canvas Hub avatar. Recommended:
   - Square, at least 720×720, PNG with the brand mark centred.
   - Should still be legible when rendered at ~32 px (Gmail's chip size).
   - Keep the photo's audience set to the default ("anyone you email") —
     locking it down to the Workspace org will hide it from external
     customers.
4. Repeat for every additional Workspace mailbox you use as a `From:`
   address (e.g. `account@canvhub.com`, `orders@canvhub.com`).

## Step 3 — Wait for Gmail's avatar cache

Gmail caches sender avatars per-recipient and per-client. After the
photo is set:

- Send a test email from each configured `EMAIL_FROM` to a Gmail account
  you control.
- First-time avatars often appear within a few hours, but a fully
  cached chip can take **1–2 days** to update across Gmail web, iOS, and
  Android. This is normal — don't keep re-uploading the photo while you
  wait.
- The avatar may appear for some recipients before others; that's the
  per-recipient cache, not a config problem.

If after 48 hours the chip is still a coloured letter, go back to
**Step 1** — almost every "no avatar" report turns out to be a
`From:` address that isn't actually a Workspace mailbox or a DKIM
signature that doesn't cover `canvhub.com`.

## Quick checklist

- [ ] Workspace mailbox exists for the address (not just an alias /
      group).
- [ ] Cloudflare `EMAIL_FROM` (and any `EMAIL_FROM_<PURPOSE>` overrides)
      points at that mailbox.
- [ ] DKIM is signed for `canvhub.com` and SPF / DMARC pass on a test
      send.
- [ ] Profile picture uploaded on the Workspace user, audience left at
      the default.
- [ ] Test email sent; gave Gmail up to 48 hours to refresh the cache.
