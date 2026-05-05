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

// We mimic Gmail's image proxy User-Agent so the upstream sees the
// same bot-detection signals that real recipient mail clients send.
// If Cloudflare is challenging this UA the operator will see it
// here too. (Apple Mail Privacy Protection uses a similar fronted
// fetch with no special UA; iCloud's image proxy fronts as
// "Mozilla/5.0 (iPhone; CPU iPhone OS …)".)
const PROBE_USER_AGENT =
  "GoogleImageProxy/1.1 (+http://www.google.com/ig/proxy)";

// Hard timeout per probe so a hung upstream doesn't stall the panel.
const PROBE_TIMEOUT_MS = 5000;

// Truncate the rendered URL in the response so a 100 KB data: URI
// doesn't bloat the JSON payload — the admin UI only cares about the
// scheme + first ~120 chars when surfacing a "still embedded" hint.
const URL_PREVIEW_MAX = 160;

const truncateUrl = (url) => {
  if (typeof url !== "string") return "";
  if (url.length <= URL_PREVIEW_MAX) return url;
  return `${url.slice(0, URL_PREVIEW_MAX)}…`;
};

const detectBlockReason = (response) => {
  const cfMitigated = response.headers.get("cf-mitigated");
  const server = response.headers.get("server") || "";
  const status = response.status;
  if (cfMitigated) {
    return `Cloudflare ${cfMitigated} (status ${status}). Disable Bot Fight Mode or add a WAF Skip rule for this path.`;
  }
  if (status === 403 && /cloudflare/i.test(server)) {
    return `Blocked by Cloudflare WAF (status 403). Add a Skip rule for this path.`;
  }
  if (status === 404) {
    return `Asset missing (404). The admin upload may have been deleted or never saved.`;
  }
  if (status === 429) {
    return `Rate-limited (429). Adjust the rate limit for this path or wait a minute and re-test.`;
  }
  if (status >= 500) {
    return `Origin error (${status}). Cloudflare or the Pages Function is failing.`;
  }
  if (status >= 400) {
    return `Upstream returned ${status}.`;
  }
  return "";
};

const probeRemote = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": PROBE_USER_AGENT,
        Accept: "image/*,*/*;q=0.5",
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const elapsedMs = Date.now() - startedAt;
    const ok = response.ok && contentType.toLowerCase().startsWith("image/");
    return {
      kind: "remote",
      url: truncateUrl(url),
      status: response.status,
      contentType,
      ok,
      note: ok
        ? `Reachable (status ${response.status}, ${contentType}).`
        : detectBlockReason(response) ||
          `Upstream returned ${response.status} (${contentType || "no content-type"}).`,
      elapsedMs,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const aborted = err && err.name === "AbortError";
    return {
      kind: "remote",
      url: truncateUrl(url),
      status: 0,
      ok: false,
      note: aborted
        ? `Timed out after ${PROBE_TIMEOUT_MS} ms — origin is unreachable.`
        : `Request failed: ${err && err.message ? err.message : String(err)}`,
      elapsedMs,
    };
  } finally {
    clearTimeout(timer);
  }
};

// Resolve the same canonical canvhub.com origin used by the email
// renderer when it builds welcome-asset URLs. We don't trust the
// admin's request Host header directly — the email is sent from the
// Pages Function, not the admin's browser, so the origin must match
// what the renderer would emit at send time.
const resolveOrigin = (event, env) => {
  const fromEnv = String(env.PUBLIC_SITE_ORIGIN || "").trim();
  if (/^https?:\/\//i.test(fromEnv)) return fromEnv.replace(/\/+$/, "");
  return "https://canvhub.com";
};

// Hash matches `shortHash()` in functions/api/_lib/email.js so the
// versioned ?v=<hash> matches the URL the renderer would actually
// emit. Keeping the URLs identical lets us catch caching bugs that
// would only show up in real email delivery.
const shortHash = (input) => {
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

const buildWelcomeAssetUrl = (origin, slot, dataUrl) => {
  const v = shortHash(dataUrl || "");
  return `${origin}/api/welcome-asset/${slot}?v=${v}`;
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

const collectAdminUploads = (config, origin) => {
  const items = [];
  const welcome = config?.welcomeEmail || {};
  const order = config?.orderEmail || {};

  // Welcome email logo / banner / avatar — only probe when the admin
  // has actually uploaded one. The renderer otherwise falls back to
  // the inline defaults above.
  for (const [slot, label] of [
    ["logo", "Welcome email — admin logo"],
    ["banner", "Welcome email — banner"],
    ["avatar", "Welcome email — avatar"],
  ]) {
    const value = String(welcome[`${slot}Url`] || "").trim();
    if (!value || !value.startsWith("data:image/")) continue;
    items.push({
      id: `welcome-${slot}`,
      label,
      kind: "remote",
      url: buildWelcomeAssetUrl(origin, slot, value),
      probe: true,
    });
  }

  // Order email logo / banner — same shape, different slot prefix.
  for (const [slot, label] of [
    ["order-logo", "Order email — admin logo"],
    ["order-banner", "Order email — banner"],
  ]) {
    const fieldKey = slot === "order-logo" ? "logoUrl" : "bannerUrl";
    const value = String(order[fieldKey] || "").trim();
    if (!value || !value.startsWith("data:image/")) continue;
    items.push({
      id: `order-${slot.replace(/^order-/, "")}`,
      label,
      kind: "remote",
      url: buildWelcomeAssetUrl(origin, slot, value),
      probe: true,
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
  const remoteSpecs = collectAdminUploads(config, origin);

  // Probe the remote URLs in parallel — Workers can do up to 50
  // concurrent subrequests, far more than we'll generate here.
  const probedRemote = await Promise.all(
    remoteSpecs.map(async (spec) => {
      const probe = await probeRemote(spec.url);
      return {
        id: spec.id,
        label: spec.label,
        ...probe,
      };
    }),
  );

  const items = [...inlineItems, ...probedRemote];
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
