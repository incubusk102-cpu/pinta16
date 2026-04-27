// Editable storefront policies (terms, refund, shipping, privacy).
// Public GET returns the full policy bundle; admin POST replaces a single
// policy's body. Stored as one JSON blob in the `policies` store under the
// fixed key `policies`.
//
// Storage shape:
//   { policies: { [slug]: { title, body, updatedAt } } }
//
// Public actions: GET (returns published policies)
// Admin actions: POST { action: "update", slug, title, body } — auth required.

import { connectLambda, getStore } from "@netlify/blobs";
import { withSecurityHeaders } from "../lib/security-headers.js";
import { isAuthenticated } from "../lib/admin-auth.js";

const STORE_NAME = "policies";
const KEY = "policies";
const MAX_TITLE = 80;
const MAX_BODY = 20000;

export const POLICY_SLUGS = ["terms", "refund", "shipping", "privacy"];

const DEFAULT_POLICIES = {
  terms: {
    title: "Terms & Conditions",
    body: `# Terms & Conditions

These terms govern your use of **Pintaterra** (the "Site"). By browsing the Site
or placing an order you agree to be bound by the terms below. If you do not
agree, please do not use the Site.

## 1. About us
Pintaterra is an independent online art gallery operated from the Philippines.
You can reach us at pintaterra@gmail.com or +63 956 468 5351.

## 2. Eligibility
You must be at least 18 years old, or have the consent of a parent or legal
guardian, to place an order.

## 3. Orders
- Most paintings are made to order unless explicitly listed as ready-to-ship.
- An order is only confirmed once payment is received in full and we send you a
  written order confirmation.
- We reserve the right to refuse or cancel any order before dispatch (for
  example, if a listing was mispriced, an item is no longer available, or we
  detect suspected fraud). In that case, your full payment is refunded.

## 4. Pricing & payment
- All prices are quoted in **Philippine Pesos (PHP)** and include applicable
  taxes. Shipping fees are calculated separately at checkout.
- We accept the payment methods displayed at checkout. Payments are processed
  by our payment provider; we do not see or store your card or e-wallet
  credentials.

## 5. Shipping
Shipping terms, lead times and risk-of-loss provisions are set out in our
[Shipping Policy](/policy/shipping), which forms part of these terms.

## 6. Returns & refunds
Returns, refunds and replacements are governed by our
[Refund & Return Policy](/policy/refund), which incorporates the buyer's
statutory rights under **Republic Act No. 7394 (Consumer Act of the
Philippines)**. Nothing in these terms limits those statutory rights.

## 7. Intellectual property
All artwork, photography, copy and design on the Site are the property of
Pintaterra or its contributing artists and are protected by Philippine and
international copyright law. You may not reproduce, redistribute or create
derivative works from any of it without our prior written permission.

## 8. Acceptable use
You agree not to: misuse the Site (probing, scraping, attempting to bypass
authentication, sending malware, automated scalping); harass us, our artists or
other customers; or use the Site for unlawful purposes.

## 9. Disclaimers & liability
The Site and our content are provided on an "as is" and "as available" basis.
To the maximum extent permitted by law, our total liability arising out of any
order is limited to the amount you paid for that order. This clause does not
limit any liability that cannot be excluded under Philippine law (including
liability for fraud, gross negligence, death or personal injury).

## 10. Privacy
We process your personal data in accordance with our
[Privacy Policy](/policy/privacy) and **Republic Act No. 10173 (Data Privacy
Act of 2012)**.

## 11. Governing law & disputes
These terms are governed by the laws of the Republic of the Philippines. Any
dispute arising out of or relating to these terms or your use of the Site that
cannot be resolved amicably will be brought before the proper courts of the
Philippines.

## 12. Changes
We may update these terms from time to time. The current version is always
shown here, with the "Last updated" date. Continued use of the Site after
changes are posted means you accept the updated terms.

## 13. Contact
Questions or notices regarding these terms should be sent to
pintaterra@gmail.com.`,
    updatedAt: null,
  },
  refund: {
    title: "Refund & Return Policy",
    body: `# Refund & Return Policy

We want every customer to love their painting. If something isn't right, we'll
work with you to make it right — and your statutory rights under **Republic
Act No. 7394 (Consumer Act of the Philippines)** are always preserved in full.

## Eligibility
You may request a refund, replacement or repair within **7 days** of receiving
your order if the artwork:
- Arrived **damaged** in transit;
- Is **not the piece you ordered** (wrong title, size, edition);
- Has a **material defect** that was not disclosed at checkout; or
- Was **misrepresented** in the listing in any other significant way.

Custom and made-to-order commissions are non-refundable once production has
begun, except where any of the issues above apply.

## How to request
1. Open your account at **/account → Orders** and click "Request Refund" on the
   relevant order, **or** email **pintaterra@gmail.com** with photos of the
   issue and your order number.
2. We respond within **2 business days** with next steps.
3. If a return is required, we'll provide return-shipping instructions.
   Please don't send anything back without confirmation from us first.

## Processing
- Approved refunds are returned to your original payment method within
  **5–10 business days** of us receiving the returned item or accepting a
  replacement.
- For damaged-in-transit cases we may request a courier claim photo before
  finalising the refund.

## Exchanges
If you'd prefer an exchange instead of a refund, just say so in your request
and we'll honour any difference in price or arrange replacement shipping.

## Cancellations
You may cancel an order **before** we ship it (or, for commissions, before
production begins) for a full refund. After that point, the eligibility rules
above apply.

## DTI complaint
If we cannot reach a resolution you find satisfactory, you may contact the
Department of Trade and Industry (DTI) – Fair Trade Enforcement Bureau via
[https://www.dti.gov.ph/fairtrade](https://www.dti.gov.ph/fairtrade). This
right is in addition to, and does not replace, your statutory rights under
RA 7394.

## Contact
pintaterra@gmail.com · +63 956 468 5351`,
    updatedAt: null,
  },
  shipping: {
    title: "Shipping Policy",
    body: `# Shipping Policy

## Where we ship
We currently ship throughout the **Philippines**. International shipping is
available on request — please email pintaterra@gmail.com **before** ordering so
we can quote the carrier, lead time and any duties.

## Lead time
- **Ready-to-ship pieces:** dispatched within **2–4 business days** of cleared
  payment.
- **Made-to-order paintings:** typically **7–14 business days** of cleared
  payment before dispatch.
- **Large or commissioned works:** **3–4 weeks** or as agreed in writing.

We'll always confirm the expected timeline in your order confirmation. Delays
caused by force majeure (typhoons, courier outages, customs inspections) are
beyond our control, but we'll keep you updated.

## Couriers & tracking
We work with **J&T Express, LBC, Ninja Van** and other reputable Philippine
couriers depending on destination. A tracking number is added to your order
page on /account as soon as it's dispatched.

## Fees
Shipping is calculated at checkout based on destination, weight and dimensions.
**Free shipping** applies automatically to qualifying orders above the
threshold shown on the storefront (currently **₱2,500**).

## Packaging
Every painting ships with corner protectors, a moisture-resistant inner wrap
and a rigid outer carton. Larger pieces may ship in a wooden crate at no extra
cost. Each order also includes the signed **Certificate of Authenticity**.

## Receiving your order
Please inspect the package on arrival. If anything looks damaged, take a photo
of the package and the artwork **before fully unpacking** and email us within
**48 hours** so we can file a courier claim. Damage reported after this window
may not be eligible for our shipping-damage refund.

## Undeliverable / refused parcels
If a parcel is returned to us because it could not be delivered (wrong address,
unattended, refused), we'll contact you. Reshipping costs may apply. After
14 days without a response we'll treat the order as cancelled and refund the
item price (less original shipping costs).

## Contact
Questions about a specific order? pintaterra@gmail.com — please include your
order number.`,
    updatedAt: null,
  },
  privacy: {
    title: "Privacy Policy",
    body: `# Privacy Policy

This policy explains what personal data **Pintaterra** collects, how we use it,
and the rights you have under **Republic Act No. 10173 (the Data Privacy Act of
2012)** and its IRR.

## 1. Who we are (controller)
Pintaterra is the personal-information controller for the data described
below. You can reach us at pintaterra@gmail.com.

## 2. What we collect
- **Account info:** name, email, hashed password (when you create an account
  or sign in with Google).
- **Order info:** shipping address, contact number, items ordered, order notes.
- **Payment info:** processed by our payment provider. We **never** see or
  store your card number, CVV or e-wallet credentials.
- **Newsletter:** your email if you opt in (you can unsubscribe at any time).
- **Support / chat:** any messages you send us through the on-site chat,
  contact form or email.
- **Technical metadata:** IP address, user-agent, approximate region and
  anonymised page-view data, used solely for analytics, fraud prevention and
  rate-limiting.

We do **not** knowingly collect data from children under the age of 13.

## 3. How we use it
- To process, ship and support your orders;
- To authenticate you and keep your account secure;
- To send transactional notifications (order confirmations, dispatch, refunds);
- To send the occasional newsletter, **only if you opt in** — every email
  includes a one-click unsubscribe link;
- To detect, prevent and respond to fraud, abuse, scraping and attacks;
- To comply with our legal and tax obligations.

## 4. Legal bases
We process personal data on the basis of (a) the **contract** between you and
Pintaterra (to fulfil your order), (b) your **consent** (e.g. newsletter), or
(c) our **legitimate interest** in running the storefront securely and
responding to abuse. Marketing emails are sent only with consent.

## 5. Sharing
We never **sell** your personal data. We share the minimum necessary with:
- Our **payment provider** (to charge you);
- Our **couriers** (to deliver your order);
- **Cloud hosting / email providers** acting under contract as personal-information processors;
- **Authorities** if compelled by valid legal process.

## 6. International transfers
Some processors operate outside the Philippines. Where they do, we rely on
contractual safeguards consistent with the Data Privacy Act and NPC guidance.

## 7. Retention
- **Order records:** retained for **5 years** after the order, to comply with
  Philippine tax and consumer-protection record-keeping rules.
- **Account data:** retained while your account is active, plus 12 months
  after closure for fraud prevention.
- **Marketing list:** retained until you unsubscribe.
- **Anonymised analytics:** retained indefinitely.

## 8. Your rights (RA 10173)
You have the right to be **informed**, to **object**, to **access**, to
**rectify**, to **erase or block**, to **damages**, to **data portability**
and to **file a complaint** with the **National Privacy Commission (NPC)**.

To exercise any of these, email pintaterra@gmail.com from the address on your
account. We respond within 30 days.

You may also lodge a complaint with the NPC at
[https://privacy.gov.ph/complaints-assistance](https://privacy.gov.ph/complaints-assistance).

## 9. Security
We use HTTPS everywhere, hashed passwords, signed session tokens, rate
limiting, and access controls limiting personal data to staff who need it. No
system is perfectly secure, but we treat your data like our own.

## 10. Cookies
We use first-party cookies and similar storage **only** for: keeping you signed
in, remembering cart contents, language and theme preferences, and preventing
abuse. We do not use third-party advertising or cross-site tracking cookies.

## 11. Changes
We may update this policy. The current version is always shown here, with the
"Last updated" date. We'll notify account holders by email if a change is
material.

## 12. Contact
Privacy questions, requests or complaints: pintaterra@gmail.com.`,
    updatedAt: null,
  },
};

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: withSecurityHeaders(extra),
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getPoliciesStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

const trim = (v, max) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

// Used when reading from storage: missing/blank fields fall back to defaults so
// the public site always has *something* to show. Admin writes use
// `sanitizeIncoming` instead, which validates without filling in defaults.
const sanitizeOne = (slug, raw) => {
  const fallback = DEFAULT_POLICIES[slug];
  const data = raw && typeof raw === "object" ? raw : {};
  const title = trim(data.title, MAX_TITLE);
  const body = trim(data.body, MAX_BODY);
  return {
    title: title || fallback.title,
    body: body || fallback.body,
    updatedAt:
      typeof data.updatedAt === "string" && data.updatedAt
        ? data.updatedAt
        : null,
  };
};

const sanitizeAll = (raw) => {
  const incoming =
    raw &&
    typeof raw === "object" &&
    raw.policies &&
    typeof raw.policies === "object"
      ? raw.policies
      : {};
  const out = {};
  for (const slug of POLICY_SLUGS) {
    out[slug] = sanitizeOne(slug, incoming[slug]);
  }
  return { policies: out };
};

const readPoliciesWithMeta = async (store) => {
  const result = await store.getWithMetadata(KEY, { type: "json" });
  const raw = result?.data;
  const sanitized = sanitizeAll(
    raw && typeof raw === "object" ? raw : { policies: DEFAULT_POLICIES },
  );
  return { etag: result?.etag, data: sanitized };
};

const readPolicies = async (store) => {
  try {
    const { data } = await readPoliciesWithMeta(store);
    return data;
  } catch {
    return sanitizeAll({ policies: DEFAULT_POLICIES });
  }
};

// Compare-and-swap upsert; retries up to 4 times on contention.
const upsertPolicy = async (store, slug, nextEntry) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    let etag;
    let current;
    try {
      ({ etag, data: current } = await readPoliciesWithMeta(store));
    } catch {
      // Read failure: bail rather than overwriting on the next attempt.
      return null;
    }
    const next = {
      policies: { ...current.policies, [slug]: nextEntry },
    };
    try {
      const wrote = await store.setJSON(KEY, next, { onlyIfMatch: etag });
      if (wrote && wrote.modified === false) continue;
      return next;
    } catch {
      return null;
    }
  }
  return null;
};

export const handler = async (event) => {
  try {
    const store = getPoliciesStore(event);

    if (event.httpMethod === "GET") {
      const data = await readPolicies(store);
      // Cache the public policies briefly at the edge so traffic spikes don't
      // pile up function invocations against the daily quota. Stale-while-
      // revalidate keeps the page snappy while we refresh in the background.
      return json(200, data, {
        // NB: must match the casing used by SECURITY_HEADERS' "Cache-Control"
        // (which sets `no-store`) so the override actually replaces it
        // instead of leaving both keys in the response.
        // max-age=0 keeps the browser from caching (so the admin's
        // post-save refresh / "Refresh" button always hits the network),
        // while s-maxage=300 lets the CDN serve cached copies to public
        // visitors. stale-while-revalidate keeps it snappy under traffic.
        "Cache-Control":
          "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      });
    }

    if (event.httpMethod === "POST") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const body = parseBody(event.body);
      const slug = String(body.slug || "");
      if (!POLICY_SLUGS.includes(slug)) {
        return json(400, { error: "Unknown policy slug" });
      }

      if (body.action === "update") {
        const title = trim(body.title, MAX_TITLE);
        const bodyText = trim(body.body, MAX_BODY);
        if (!title) return json(400, { error: "Title is required" });
        if (!bodyText) return json(400, { error: "Body is required" });
        const next = await upsertPolicy(store, slug, {
          title,
          body: bodyText,
          updatedAt: new Date().toISOString(),
        });
        if (!next) return json(409, { error: "Save conflicted, please retry" });
        return json(200, next);
      }

      if (body.action === "reset") {
        const next = await upsertPolicy(store, slug, {
          title: DEFAULT_POLICIES[slug].title,
          body: DEFAULT_POLICIES[slug].body,
          updatedAt: new Date().toISOString(),
        });
        if (!next)
          return json(409, { error: "Reset conflicted, please retry" });
        return json(200, next);
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch {
    return json(500, { error: "Internal error" });
  }
};
