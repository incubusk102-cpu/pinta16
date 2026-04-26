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
- Payment info is processed by PayMongo — we never see your card or e-wallet
  credentials
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

const sanitizeOne = (slug, raw) => {
  const fallback = DEFAULT_POLICIES[slug];
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    title: trim(data.title || fallback.title, MAX_TITLE),
    body: trim(data.body || fallback.body, MAX_BODY),
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

const readPolicies = async (store) => {
  try {
    const raw = await store.get(KEY, { type: "json" });
    if (!raw) return sanitizeAll({ policies: DEFAULT_POLICIES });
    return sanitizeAll(raw);
  } catch {
    return sanitizeAll({ policies: DEFAULT_POLICIES });
  }
};

const writePolicies = async (store, data) => {
  await store.setJSON(KEY, data);
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

      if (body.action === "update") {
        const slug = String(body.slug || "");
        if (!POLICY_SLUGS.includes(slug)) {
          return json(400, { error: "Unknown policy slug" });
        }
        const existing = await readPolicies(store);
        const next = {
          policies: {
            ...existing.policies,
            [slug]: sanitizeOne(slug, {
              title: body.title,
              body: body.body,
              updatedAt: new Date().toISOString(),
            }),
          },
        };
        await writePolicies(store, next);
        return json(200, next);
      }

      if (body.action === "reset") {
        const slug = String(body.slug || "");
        if (!POLICY_SLUGS.includes(slug)) {
          return json(400, { error: "Unknown policy slug" });
        }
        const existing = await readPolicies(store);
        const next = {
          policies: {
            ...existing.policies,
            [slug]: sanitizeOne(slug, {
              title: DEFAULT_POLICIES[slug].title,
              body: DEFAULT_POLICIES[slug].body,
              updatedAt: new Date().toISOString(),
            }),
          },
        };
        await writePolicies(store, next);
        return json(200, next);
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch {
    return json(500, { error: "Internal error" });
  }
};
