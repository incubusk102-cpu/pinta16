// Server-side HTML enrichment for share-preview crawlers and search
// engines. Cloudflare Pages serves the SPA's `index.html` for every
// route the SPA owns, so the per-product OG / JSON-LD that
// `src/routes/product.$id.tsx` writes via `useEffect` is never seen
// by Facebook, Twitter, LinkedIn, Slack, iMessage, Discord, or any
// other unfurler — they don't run JavaScript.
//
// This middleware uses the Cloudflare HTMLRewriter to inject the
// right `<title>`, `<meta name="description">`, OG, Twitter, and
// JSON-LD blocks into the HTML on the way out, based on the URL
// path. It also adds a `<link rel="canonical">` for every page.
//
// Performance: HTMLRewriter is streaming — it does not buffer the
// response. The product KV read is cached for 60 s in the per-Worker
// cache via the `cf` field on `fetch`, so we only hit KV once per
// product per minute per colo.

import { setCloudflareContext } from "./api/_lib/context.js";
import { makeStore } from "./api/_lib/kv-store.js";
import { getProductReviewSummary } from "./api/_lib/product-reviews.js";
import {
  buildProductMeta,
  buildSiteWideLd,
  isEnrichableHtmlPath,
  resolveStaticPageMeta,
  xmlEscape,
} from "./api/_lib/seo-meta.js";

const PRODUCTS_KEY = "all-products";

const isHtmlResponse = (response) => {
  const ct = response.headers.get("content-type") || "";
  return ct.includes("text/html");
};

// Pull a product out of the PRODUCTS KV by id. Returns null if the
// binding is missing, the id is bogus, or the product is in draft.
export const loadProduct = async (env, id) => {
  if (!env?.PRODUCTS) return null;
  if (!id || typeof id !== "string") return null;
  // Whole catalog is in one JSON blob — same as the storefront API.
  const store = makeStore(env.PRODUCTS);
  let all;
  try {
    all = await store.get(PRODUCTS_KEY, { type: "json" });
  } catch {
    return null;
  }
  if (!Array.isArray(all)) return null;
  const found = all.find((p) => String(p?.id) === id);
  if (!found) return null;
  if (found.availability === "draft") return null;
  return found;
};

// Rewriter for the SPA shell. Injects per-page OG / JSON-LD without
// buffering the response. Falls back gracefully when no per-page
// payload is available — in that case we still ensure a canonical
// link tag exists.
const buildRewriter = ({ canonical, perPage, origin }) => {
  const rewriter = new HTMLRewriter();

  if (perPage) {
    // Replace the document title.
    rewriter.on("title", {
      element(el) {
        el.setInnerContent(perPage.title);
      },
    });

    // Replace existing OG / Twitter / description metas with the
    // per-product values. Removing the existing tag and inserting a
    // fresh one is the most robust pattern (HTMLRewriter does not
    // expose `setAttribute` for arbitrary attributes on `<meta>`
    // reliably across all runtimes).
    const metaSelectors = [
      ['meta[name="description"]', "name", "description", perPage.description],
      ['meta[property="og:title"]', "property", "og:title", perPage.title],
      [
        'meta[property="og:description"]',
        "property",
        "og:description",
        perPage.description,
      ],
      [
        'meta[property="og:type"]',
        "property",
        "og:type",
        perPage.ogType || "website",
      ],
      ['meta[property="og:url"]', "property", "og:url", perPage.url],
      ['meta[property="og:image"]', "property", "og:image", perPage.image],
      ['meta[name="twitter:title"]', "name", "twitter:title", perPage.title],
      [
        'meta[name="twitter:description"]',
        "name",
        "twitter:description",
        perPage.description,
      ],
      ['meta[name="twitter:image"]', "name", "twitter:image", perPage.image],
    ];
    for (const [selector, attr, attrValue, content] of metaSelectors) {
      rewriter.on(selector, {
        element(el) {
          el.replace(
            `<meta ${attr}="${xmlEscape(attrValue)}" content="${xmlEscape(
              content,
            )}">`,
            { html: true },
          );
        },
      });
    }

    // Insert per-page JSON-LD blocks at the top of <head>. For
    // products we emit Product+Offer + BreadcrumbList; for static
    // pages we emit the matching WebPage subtype (CollectionPage /
    // AboutPage / ContactPage / Article) + BreadcrumbList. All
    // standalone, so crawlers can pick whichever they understand.
    // Site-wide Organization + WebSite graphs are appended alongside
    // so crawlers can link the page back to the brand entity.
    const siteWide = buildSiteWideLd(origin);
    const allLd = [...(perPage.ldGraphs || []), ...siteWide];
    rewriter.on("head", {
      element(el) {
        el.append(
          `<link rel="canonical" href="${xmlEscape(canonical)}">` +
            allLd
              .map(
                (ld) =>
                  `<script type="application/ld+json">${JSON.stringify(
                    ld,
                  ).replace(/</g, "\\u003c")}</script>`,
              )
              .join(""),
          { html: true },
        );
      },
    });
  } else {
    // No per-page payload — still emit a canonical link plus the
    // site-wide Organization + WebSite graphs (home / policy /
    // account etc. benefit from these too).
    const siteWide = buildSiteWideLd(origin);
    rewriter.on("head", {
      element(el) {
        el.append(
          `<link rel="canonical" href="${xmlEscape(canonical)}">` +
            siteWide
              .map(
                (ld) =>
                  `<script type="application/ld+json">${JSON.stringify(
                    ld,
                  ).replace(/</g, "\\u003c")}</script>`,
              )
              .join(""),
          { html: true },
        );
      },
    });
  }

  return rewriter;
};

export const onRequest = async ({ request, env, next }) => {
  setCloudflareContext(env);
  const url = new URL(request.url);

  // Don't touch API responses or static assets the SPA never proxies
  // through the HTML shell.
  if (url.pathname.startsWith("/api/")) {
    return next();
  }
  // Cheap allow-list for paths that DO produce HTML. Anything else
  // (icons, manifest, robots, sitemap, JS/CSS chunks) skips the
  // rewriter entirely so we never pay the cost on hot static paths.
  if (!isEnrichableHtmlPath(url.pathname)) {
    return next();
  }

  const response = await next();
  if (!isHtmlResponse(response)) return response;

  const origin = url.origin;
  const canonical = `${origin}${url.pathname}`;

  // Per-product enrichment is the only path that needs a KV read.
  // Fail open — if KV is unbound or the id is unknown, fall back to
  // the canonical-only branch.
  let perPage = null;
  if (url.pathname.startsWith("/product/")) {
    const id = decodeURIComponent(url.pathname.slice("/product/".length));
    try {
      const product = await loadProduct(env, id);
      if (product) {
        // Fetch the aggregated review summary in parallel
        // with… well, in parallel with nothing right now,
        // but the await sits before the rewriter so the
        // injected aggregateRating block is visible to
        // crawlers in the very first HTML chunk. The helper
        // colo-caches the result for 5 min so this only pays
        // the orders-KV read once per product per cache slot.
        let reviewSummary = null;
        try {
          reviewSummary = await getProductReviewSummary(env, id);
        } catch {
          reviewSummary = null;
        }
        perPage = buildProductMeta(product, origin, reviewSummary);
      }
    } catch {
      perPage = null;
    }
  } else {
    // Static-page enrichment is purely string-based — no KV reads,
    // no `await`s — so we can build it inline. `resolveStaticPageMeta`
    // returns `null` for paths that don't match a known static page
    // (e.g. `/policy/*`, `/account`, `/admin`), in which case we fall
    // through to the canonical-only branch in the rewriter.
    perPage = resolveStaticPageMeta(url.pathname, origin);
  }

  return buildRewriter({ canonical, perPage, origin }).transform(response);
};
