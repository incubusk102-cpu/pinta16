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

These terms govern your use of Pintaterra. By placing an order or browsing the
storefront you agree to the terms below.

## Orders
All paintings are made to order unless explicitly listed as ready-to-ship.
Orders are confirmed once payment is received via QR Ph (PayMongo).

## Pricing
Prices are listed in PHP and include applicable taxes. Shipping fees are
calculated at checkout based on destination and order total.

## Intellectual property
All artwork, photography, and copy on this site are the property of Pintaterra
and may not be reproduced without written permission.

## Contact
Questions about these terms? Email pintaterra@gmail.com.`,
    updatedAt: null,
  },
  refund: {
    title: "Refund & Return Policy",
    body: `# Refund & Return Policy

We want every customer to love their painting. If something isn't right, we'll
work with you to make it right.

## Eligibility
You may request a refund or replacement within **7 days** of receiving your
order if the artwork:
- Arrived damaged in transit
- Was not the piece you ordered
- Has a defect that wasn't disclosed at checkout

Made-to-order custom commissions are non-refundable once production has begun
unless the issues above apply.

## How to request
Open your account at /account → Orders → Request Refund, or email
pintaterra@gmail.com with photos of the issue. We respond within 2 business
days.

## Processing
Approved refunds are returned to the original PayMongo (QR Ph) source within
5–10 business days.`,
    updatedAt: null,
  },
  shipping: {
    title: "Shipping Policy",
    body: `# Shipping Policy

## Where we ship
We currently ship within the Philippines. International shipping is available
on request — contact us before ordering.

## Lead time
Most made-to-order paintings ship within 7–14 business days of payment
confirmation. Larger commissions may take 3–4 weeks; we'll communicate the
exact timeline before you pay.

## Couriers & tracking
We use J&T, LBC, or local couriers depending on destination. A tracking number
is added to your order page once dispatched.

## Fees
Shipping is calculated at checkout. Free shipping applies to qualifying orders
above the threshold shown on the storefront.

## Receiving your order
Please inspect the package on arrival and report any damage within 48 hours so
we can file a courier claim.`,
    updatedAt: null,
  },
  privacy: {
    title: "Privacy Policy",
    body: `# Privacy Policy

We collect only what we need to fulfil your order and improve the storefront.

## What we collect
- Account info (name, email) when you create an account or subscribe
- Order info (shipping address, contact number, items)
- Payment info is processed by PayMongo — we never see your card or e-wallet credentials
- Anonymous browser/device metadata for analytics and abuse detection

## How we use it
- To process and ship your orders
- To send order updates and (if you opted in) the occasional newsletter
- To detect and block fraudulent or abusive behaviour

## Sharing
We never sell your data. We share the minimum necessary with our courier and
payment provider.

## Your rights
Email pintaterra@gmail.com to request deletion or a copy of your data.`,
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
      return json(200, data);
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
