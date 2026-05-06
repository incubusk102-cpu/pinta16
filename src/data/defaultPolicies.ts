// Default fallback bodies for the four legal-policy slugs surfaced at
// /policy/$slug. The admin can override any of these from
// /admin → Policies; the override is persisted in the POLICIES KV
// namespace and served via /api/policies. When KV is empty (fresh
// deploys, or a slug the admin hasn't touched yet), these defaults
// render so the public page is never blank — important for SEO,
// for the "did you read the policy" checkbox at checkout, and for
// platforms that programmatically scan the site for legal pages.
//
// IMPORTANT: these are templated drafts written for a Philippines-based
// online art shop (canvhub.com) under PH consumer-protection rules
// (RA 7394, DTI MC 22-05) and the Data Privacy Act of 2012 (RA 10173).
// They are NOT legal advice and the merchant should have them reviewed
// by counsel and edited via /admin → Policies before relying on them
// in a dispute. The body is rendered by the lightweight markdown
// renderer in src/routes/policy.$slug.tsx — keep the syntax to plain
// markdown (## H2, ### H3, paragraphs, lists, [link](href), **bold**,
// *italic*, `code`).

import type { PolicySlug } from "@/contexts/PoliciesContext";

const TERMS = `## Welcome to Canvas Hub

Canvas Hub ("Canvas Hub", "we", "us", "our") is an online gallery of
hand-crafted paintings operated from the Republic of the Philippines.
By browsing [canvhub.com](https://canvhub.com/), placing an order, or
creating an account you agree to these Terms & Conditions, our
[Privacy Policy](/policy/privacy), our [Refund & Return Policy](/policy/refund),
and our [Shipping Policy](/policy/shipping). If you do not agree, please
do not use the site.

## Eligibility

You must be at least 18 years old (or the age of majority where you
live) to place an order. By checking out you confirm that the
information you provide is accurate and that the payment method
belongs to you.

## Made-to-order artwork

Each piece is hand-painted upon order. Because we begin work as soon
as your payment clears, paintings are produced specifically for you
and minor variations from the catalogue photo (brushstroke texture,
canvas grain, tonal balance) are part of the original-art
experience and are not defects. The estimated production window
shown on each product page is a best-effort estimate, not a
guarantee.

## Account responsibilities

If you create an account you are responsible for keeping your
password confidential and for activity under your account. Tell us
immediately at [support@canvhub.com](mailto:support@canvhub.com) if
you believe your account has been accessed without your consent.

## Acceptable use

You agree not to:

- attempt to disrupt, scrape, reverse-engineer, or overload the
  site or our APIs;
- bypass any security or rate-limiting feature;
- post reviews, messages, or contact-form submissions that are
  unlawful, infringing, abusive, deceptive, or that contain
  malware;
- impersonate another person or pretend to be affiliated with
  Canvas Hub.

We may suspend or terminate accounts and refuse or cancel orders if
we reasonably believe these terms have been violated.

## Intellectual property

All paintings, photographs, written copy, illustrations, and the
design of canvhub.com are the property of Canvas Hub or its artists
and are protected by Philippine and international copyright. You may
not reproduce, redistribute, or use any of it commercially without
prior written permission. The physical painting you purchase is
yours; the underlying copyright in the image stays with the artist.

## Pricing, payment, and taxes

Prices on canvhub.com are in Philippine peso (PHP) and include
applicable taxes unless stated otherwise. We use [PayMongo](https://www.paymongo.com/)
for card and e-wallet payments; Canvas Hub never sees or stores your
full card number. We reserve the right to correct obvious pricing or
description errors and to cancel any order placed at an incorrectly
displayed price (with a full refund).

## Reviews and user content

By submitting a review, photo, or message, you grant Canvas Hub a
non-exclusive, royalty-free licence to display it on the site and
in marketing. You confirm that the content is yours and does not
infringe anyone else's rights. We may remove content that violates
these Terms.

## Liability

To the fullest extent permitted by Philippine law, Canvas Hub is not
liable for indirect, incidental, or consequential losses arising
from your use of the site. Nothing in these Terms limits any right
you have under RA 7394 (the Consumer Act of the Philippines) or any
other mandatory law.

## Governing law and disputes

These Terms are governed by the laws of the Republic of the
Philippines. Any dispute will be resolved by the courts of
competent jurisdiction in the Philippines, without prejudice to
your right to escalate to the Department of Trade and Industry
(DTI) under its consumer-protection mandate.

## Changes

We may update these Terms from time to time. The "last updated"
date below reflects the most recent change. Material changes will
be announced on the site for at least 14 days before they take
effect.

## Contact

Questions about these Terms? Email
[support@canvhub.com](mailto:support@canvhub.com).
`;

const REFUND = `## Our promise

We want you to love the painting that arrives at your door. If
something is wrong, we will make it right. This policy explains
when you can request a refund or replacement, how to do it, and
what to expect.

## Eligibility window

You may request a refund or replacement within **7 days** of
delivery (consistent with DTI Memorandum Circular 22-05 on
e-commerce returns) for any of the following reasons:

- the painting arrived **damaged in transit** (cracked frame, torn
  canvas, water damage);
- the painting is **materially different** from the product page
  (wrong subject, wrong size, wrong colours beyond normal variation);
- the painting is **defective** (paint flaking, structural issue
  with the stretcher, etc.);
- you received the **wrong order**.

Because every painting is hand-made to order, we are unable to
accept returns purely for change of mind once production has
started. If you want to cancel before we have started painting,
email us within 24 hours of placing the order and we will refund in
full.

## How to request

Email [support@canvhub.com](mailto:support@canvhub.com) within the
window above with:

1. your order number (begins with \`CH-\`),
2. clear photos of the issue, including the packaging if the damage
   was in transit,
3. a short description of what is wrong.

We aim to reply within **2 business days**. If approved we will
either refund the full purchase price (including shipping for
damaged or wrong items) or arrange a replacement, at your choice.

## Returns and pickup

If we ask you to return the painting, we will arrange and pay for
the courier pickup. Please keep the original packaging until the
issue is resolved.

## How long refunds take

Once approved, refunds are issued to the original payment method
through PayMongo. Card refunds typically appear within **5–10
business days**; GCash, GrabPay, and Maya refunds are usually
faster. The exact timing depends on your bank or wallet provider.

## What's not eligible

- Damage caused by handling after delivery (e.g. the painting
  fell from a hook).
- Variations in colour caused by your monitor, lighting, or
  framing choices made after delivery.
- Custom commissions where the requested specifications were
  followed.

## Your rights

Nothing in this policy limits your rights as a consumer under
RA 7394 (Consumer Act of the Philippines) or DTI Memorandum
Circular 22-05. If you believe a complaint has not been resolved
fairly, you may escalate to the [DTI Consumer Protection
Group](https://www.dti.gov.ph/).

## Contact

Refund and replacement requests:
[support@canvhub.com](mailto:support@canvhub.com).
`;

const SHIPPING = `## Where we ship

Canvas Hub ships **within Luzon only**, via **Lalamove** courier.
Visayas, Mindanao, and other parts of the Philippines are not
currently serviceable. International shipping is available on
request — email
[support@canvhub.com](mailto:support@canvhub.com) before placing the
order and we will quote a courier and a fee.

## Lead times

Each painting is hand-made after you order, so the total time you
should expect is:

- **Production:** 7–14 business days, depending on canvas size and
  complexity. The estimated window for your specific painting is
  shown on the product page and again at checkout.
- **Dispatch:** same-day once production is complete and the
  Lalamove rider accepts the booking. Orders confirmed before noon
  typically dispatch the same business day; later orders go out the
  next business day.
- **Transit (Lalamove):**
  - Metro Manila: same-day on most routes
  - Adjacent provinces (Cavite, Laguna, Rizal, Bulacan, Pampanga):
    same-day or next-day depending on rider availability
  - Greater / far Luzon: typically 1–2 days, longer for the
    northern regions and MIMAROPA (boat ride extra)

## Courier we use

Every order ships via **Lalamove**. You will receive the rider's
live tracking link by email and SMS once the booking is confirmed.

## Shipping fees

Shipping is **paid directly to the Lalamove rider in cash on
delivery** — your cart total at checkout excludes the rider fare.
We show an estimated peso range for your province on the checkout
page so there are no surprises when the rider arrives. The rider
quotes the actual fare on dispatch.

Bulky or oversized canvases (anything over 30 × 40 inches) may
require a larger Lalamove vehicle (sedan → SUV / van) which carries
a higher fare — we will email you to confirm before booking the
rider.

## Areas we don't serve

Some far-flung Luzon provinces (e.g. Batanes) and the MIMAROPA
island provinces (Mindoro, Palawan, Romblon, Marinduque) may not
have reliable Lalamove coverage from our origin. If your address is
in one of these areas, please email
[support@canvhub.com](mailto:support@canvhub.com) so we can quote
an alternative carrier before you place the order.

## Packaging

Paintings ship rolled in a kraft tube for unframed canvases or
flat-packed in a corrugated carton with foam corner-protection for
framed pieces. We photograph every shipment before pickup as proof
of condition.

## Failed delivery and address changes

Please double-check your address at checkout. Couriers in the
Philippines typically attempt delivery up to **three times**
before returning the parcel to our studio; re-shipping after a
return-to-sender will incur a second shipping fee.

If you need to change the delivery address after the order has
shipped, contact the courier directly with the tracking number —
we are usually unable to redirect on your behalf.

## Lost or damaged in transit

See our [Refund & Return Policy](/policy/refund) for the process if
your painting arrives damaged or never arrives.

## Contact

Shipping questions:
[support@canvhub.com](mailto:support@canvhub.com).
`;

const PRIVACY = `## What this policy covers

This Privacy Policy explains how Canvas Hub ("we") collects, uses,
discloses, and protects your personal information when you visit
[canvhub.com](https://canvhub.com/), place an order, sign up for
our newsletter, or contact us. We comply with the
**Data Privacy Act of 2012** (RA 10173) and its implementing
rules issued by the National Privacy Commission (NPC).

## What we collect

**You give us, directly:**

- Order details: name, email, phone number, shipping address,
  items in the cart, special instructions.
- Account details (if you sign up): email, name, profile photo
  (if you sign in with Google), saved addresses, wishlist items.
- Communications: messages you send through the contact form, the
  chat widget, or by email.
- Reviews and review photos.

**We collect automatically:**

- A short-lived **visitor heartbeat** so the admin can see how
  many people are browsing the site live. The heartbeat does not
  identify you and is deleted after a few minutes.
- **Aggregated, anonymous usage stats** via Cloudflare Web
  Analytics — no cookies, no cross-site tracking.
- **Error reports** (if Sentry is enabled) so we can fix bugs.
  These are scrubbed of personal data before being sent.
- Standard server logs (IP address, user agent, timestamp) for
  security and rate-limiting, retained for **30 days**.

**We never collect:**

- Your full payment card number, CVV, or one-time password —
  these go directly to [PayMongo](https://www.paymongo.com/) and
  are never visible to Canvas Hub.

## Why we use it

- **Fulfilling your order**: producing the painting, shipping it,
  responding to your questions, and processing returns.
- **Account security and fraud prevention**: rate-limiting,
  Cloudflare Turnstile challenges on signup and newsletter
  forms, audit logs of admin actions.
- **Service emails**: order confirmations, shipping updates,
  refund notifications. These are transactional and you cannot
  opt out while you have an active order.
- **Marketing emails** (only if you opt in): new collections,
  artist features, occasional promotions. You can unsubscribe in
  one click from any marketing email or by emailing
  [support@canvhub.com](mailto:support@canvhub.com).
- **Site improvement**: aggregated analytics on which pages and
  paintings are popular.

## Who we share it with

We share the minimum necessary personal data with:

- **PayMongo** — payment processing.
- **Cloudflare** — hosting (Cloudflare Pages, Workers, KV, R2),
  analytics, bot mitigation. Data may transit Cloudflare's
  global network.
- **Lalamove** — name, address, phone for the on-demand courier
  delivery within Luzon. (Historical orders that shipped before our
  Lalamove-only switch may also have been handed off to J&T, JRS,
  LBC, Ninja Van, Flash, or Grab Express.)
- **Google** — only if you choose to sign in with Google;
  in that case Google handles the OAuth exchange and we receive
  your email and profile photo.
- **Email and push providers** — for transactional and (if opted
  in) marketing messages.
- **Law enforcement** — only when legally compelled and only the
  specific records lawfully demanded.

We do **not** sell your personal data.

## How long we keep it

- **Order records** — 5 years (BIR / accounting requirement).
- **Account profile** — until you delete the account.
- **Newsletter subscription** — until you unsubscribe.
- **Reviews** — until you ask us to remove them.
- **Visitor heartbeats** — a few minutes, then deleted.
- **Server logs / rate-limit data** — 30 days.

## Your rights under the Data Privacy Act

You have the right to:

- be **informed** of what we collect and why,
- **access** your data and ask for a copy,
- **correct** inaccurate data,
- ask us to **delete** data we no longer need,
- **object** to processing for marketing,
- **withdraw consent** at any time, and
- **complain to the National Privacy Commission**
  ([privacy.gov.ph](https://www.privacy.gov.ph/)) if you believe
  we have mishandled your data.

To exercise any of these rights, email
[support@canvhub.com](mailto:support@canvhub.com) from the email
address on file. We will respond within **15 business days**.

## How we protect your data

- HTTPS everywhere (HSTS preload).
- Strict content-security-policy and platform security headers.
- Admin login is protected by PBKDF2 password hashing, optional
  Cloudflare Turnstile challenge, sliding-window rate limits,
  and an audit log.
- Admin sessions expire after 7 days.
- Off-site nightly backups of business KV namespaces with
  90-day retention.

## Cookies and similar technologies

We use a small number of essential cookies and \`localStorage\`
keys to remember your cart, your wishlist, your locale and theme
preference, and your login session. Analytics are
**cookieless**. We do not use third-party advertising cookies.

## Children

Canvas Hub is not directed at children under 18. We do not
knowingly collect data from minors. If you believe a child has
given us personal data, contact
[support@canvhub.com](mailto:support@canvhub.com) and we will
delete it.

## Changes

We will post any update to this Privacy Policy here and announce
material changes on the site for at least 14 days before they take
effect.

## Contact

Privacy questions, access requests, or complaints:
[support@canvhub.com](mailto:support@canvhub.com).
`;

export const DEFAULT_POLICY_BODIES: Record<PolicySlug, string> = {
  terms: TERMS,
  refund: REFUND,
  shipping: SHIPPING,
  privacy: PRIVACY,
};
