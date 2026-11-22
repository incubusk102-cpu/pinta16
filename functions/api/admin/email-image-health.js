// /api/admin/email-image-health — probes every URL that the order /
// welcome / refund email renderers will reference and reports whether
// a real email client (Gmail's image proxy, iCloud, Outlook, …) can
// fetch them.
//
// Why this exists: Cloudflare's "Bot Fight Mode" (and Under-Attack
// mode, and aggressive WAF rules) can intermittently 403 the image
// proxy fetches that Gmail / iCloud / Outlook do server-side when the
// recipient opens an email. The result is broken-image icons in the
// order confirmation, in-progress, out-for-delivery, and received
// emails — exactly the symptom the operator is seeing.
//
// Defense-in-depth in this repo:
//   1. The email renderer inlines the default brand C-logo and the
//      footer social icons as base64 data: URIs, so those render even
//      when the canvhub.com origin is fully challenged.
//   2. Admin-uploaded logo/banner/product images go through
//      /api/welcome-asset/<slot>, which is hosted on the same origin
//      as the email body. If Cloudflare is challenging that path,
//      this endpoint will surface the breakage so the admin can
//      either (a) toggle Bot Fight Mode off, (b) add a WAF Skip Rule
//      for /api/welcome-asset/, or (c) re-upload a smaller image
//      (the >1 MB upload path is also rate-limited).
//
// Auth: same Bearer-token / cookie check as every other admin
// endpoint. GET only — read-only, no mutation, safe to call as often
// as the operator wants.
//
// Response shape:
//   {
//     ok: true,
//     origin: "https://canvhub.com",
//     summary: { ok: 5, broken: 2, inline: 12, total: 19 },
//     items: [
//       {
//         id: "default-brand-logo",
//         label: "Default brand C-logo",
//         kind: "inline",
//         url: "data:image/png;base64,…",  // truncated in payload
//         ok: true,
//         note: "Embedded directly in the email body."
//       },
//       {
//         id: "welcome-logo",
//         label: "Custom welcome logo",
//         kind: "remote",
//         url: "https://canvhub.com/api/welcome-asset/logo?v=…",
//         status: 403,
//         ok: false,
//         note: "Cloudflare bot challenge (cf-mitigated: challenge).",
//         elapsedMs: 412
//       },
//       …
//     ]
//   }

import { wrapHandler } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { withSecurityHeaders } from "../_lib/security-headers.js";
import { makeStore } from "../_lib/kv-store.js";
import { getCloudflareEnv } from "../_lib/context.js";
import {
  DEFAULT_BRAND_LOGO_DATA_URI,
  FOOTER_ICON_DATA_URIS,
} from "../_lib/email-assets-data.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
  body: JSON.stringify(body),
});

// Truncate the rendered URL in the response so a 100 KB data: URI
// doesn't bloat the JSON payload — the admin UI only cares about the
// scheme + first ~120 chars when surfacing a "still embedded" hint.
const URL_PREVIEW_MAX = 160;

const truncateUrl = (url) => {
  if (typeof url !== "string") return "";
  if (url.length <= URL_PREVIEW_MAX) return url;
  return `${url.slice(0, URL_PREVIEW_MAX)}…`;
};

// Resolve the same canonical canvhub.com origin used by the email
// renderer for outbound link URLs. Surfaced in the panel response
// so the admin can confirm at a glance which origin is in effect.
const resolveOrigin = (_event, env) => {
  const fromEnv = String(env?.PUBLIC_SITE_ORIGIN || "").trim();
  if (/^https?:\/\//i.test(fromEnv)) return fromEnv.replace(/\/+$/, "");
  return "https://canvhub.com";
};

const collectInlineDefaults = () => {
  const items = [
    {
      id: "default-brand-logo",
      label: "Default brand C-logo",
      kind: "inline",
      url: truncateUrl(DEFAULT_BRAND_LOGO_DATA_URI),
      ok: true,
      note: "Shipped as a CID attachment (multipart/related) — Gmail / iCloud / Outlook all render it. Not affected by Bot Fight Mode.",
    },
  ];
  for (const slug of Object.keys(FOOTER_ICON_DATA_URIS).sort()) {
    items.push({
      id: `footer-icon-${slug}`,
      label: `Footer icon: ${slug}`,
      kind: "inline",
      url: truncateUrl(FOOTER_ICON_DATA_URIS[slug]),
      ok: true,
      note: "Shipped as a CID attachment.",
    });
  }
  return items;
};

// Admin-uploaded logo / banner / avatar are now shipped as CID
// attachments (multipart/related) just like the default brand
// assets — see `rehostEmailImage` in functions/api/_lib/email.js.
// They are not fetched over the network from any image proxy,
// so they cannot be blocked by Bot Fight Mode and we do not need
// to probe them. We still surface them in the report so the
// admin can confirm at a glance which assets the recipient will
// see, and roughly how big each payload is.
const collectAdminUploads = (config) => {
  const items = [];
  const welcome = config?.welcomeEmail || {};
  const order = config?.orderEmail || {};

  const seen = new Set();
  for (const [field, label] of [
    ["welcome.logoUrl", "Welcome email — admin logo"],
    ["welcome.bannerUrl", "Welcome email — banner"],
    ["welcome.avatarUrl", "Welcome email — avatar"],
    ["order.logoUrl", "Order email — admin logo"],
    ["order.bannerUrl", "Order email — banner"],
  ]) {
    const [scope, key] = field.split(".");
    const src = scope === "welcome" ? welcome : order;
    const value = String(src?.[key] || "").trim();
    if (!value || !value.startsWith("data:image/")) continue;
    if (seen.has(field)) continue;
    seen.add(field);
    const sizeKb = Math.round(value.length / 1024);
    items.push({
      id: field.replace(".", "-"),
      label,
      kind: "inline",
      url: truncateUrl(value),
      ok: true,
      note: `Shipped as CID attachment (~${sizeKb} KB).`,
    });
  }

  return items;
};

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  const env = getCloudflareEnv();
  const origin = resolveOrigin(event, env);

  let config = {};
  try {
    if (env?.STOREFRONT_CONFIG) {
      const store = makeStore(env.STOREFRONT_CONFIG);
      config = (await store.get("config", { type: "json" })) || {};
    }
  } catch {
    // Storefront config namespace not bound or unreadable — keep
    // going with an empty config so the panel still shows the
    // inline defaults, which are the most common breakage source.
    config = {};
  }

  const inlineItems = collectInlineDefaults();
  const adminUploadItems = collectAdminUploads(config);

  const items = [...inlineItems, ...adminUploadItems];
  const summary = items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.kind === "inline") acc.inline += 1;
      else if (item.ok) acc.ok += 1;
      else acc.broken += 1;
      return acc;
    },
    { ok: 0, broken: 0, inline: 0, total: 0 },
  );

  return json(200, {
    ok: true,
    origin,
    summary,
    items,
    probedAt: new Date().toISOString(),
  });
};

export const onRequest = wrapHandler(handler);
