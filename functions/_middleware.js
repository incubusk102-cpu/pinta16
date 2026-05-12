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

const PRODUCTS_KEY = "all-products";
const SITE_NAME = "Canvas Hub";

const xmlEscape = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const PHP = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : "0.00");

const availabilityToSchemaUrl = (a) => {
  switch (a) {
    case "available":
      return "https://schema.org/InStock";
    case "made-to-order":
      return "https://schema.org/MadeToOrder";
    case "reserved":
      return "https://schema.org/PreOrder";
    case "sold":
      return "https://schema.org/SoldOut";
    default:
      return "https://schema.org/InStock";
  }
};

const isHtmlResponse = (response) => {
  const ct = response.headers.get("content-type") || "";
  return ct.includes("text/html");
};

const absUrl = (origin, maybeUrl) => {
  if (!maybeUrl) return "";
  if (/^https?:\/\//.test(maybeUrl)) return maybeUrl;
  if (maybeUrl.startsWith("/")) return `${origin}${maybeUrl}`;
  return `${origin}/${maybeUrl}`;
};

const truncate = (s, max = 200) => {
  const str = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
};

// Pull a product out of the PRODUCTS KV by id. Returns null if the
// binding is missing, the id is bogus, or the product is in draft.
const loadProduct = async (env, id) => {
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

// Build the per-product enrichment payload used by the rewriter.
// `reviewSummary` is optional; when present we attach an
// `aggregateRating` block and embed the most recent reviews so the
// Product rich-result eligibility threshold is met server-side
// (it's just three short snippets, total HTML weight under ~1.5 KB).
const buildProductMeta = (product, origin, reviewSummary = null) => {
  const url = `${origin}/product/${encodeURIComponent(product.id)}`;
  const description = truncate(
    product.description || `${product.title} — ${SITE_NAME}`,
    300,
  );
  const images = (
    Array.isArray(product.images) && product.images.length > 0
      ? product.images.map((img) => img?.url).filter(Boolean)
      : [product.image]
  )
    .filter(Boolean)
    .map((u) => absUrl(origin, u));
  const primaryImage = images[0] || `${origin}/icon-512.png`;
  const price = product.salePrice ?? product.price ?? 0;
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.title || "Painting",
    description,
    image: images.length > 0 ? images : [primaryImage],
    sku: product.id,
    brand: { "@type": "Brand", name: SITE_NAME },
    category: product.medium || "Painting",
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "PHP",
      price: PHP(price),
      availability: availabilityToSchemaUrl(product.availability),
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        "@id": "https://canvhub.com/#organization",
      },
    },
  };
  if (reviewSummary && reviewSummary.count > 0) {
    productLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: reviewSummary.average.toFixed(2),
      reviewCount: reviewSummary.count,
      bestRating: 5,
      worstRating: 1,
    };
    const recent = Array.isArray(reviewSummary.recent)
      ? reviewSummary.recent
      : [];
    if (recent.length > 0) {
      productLd.review = recent.map((r) => ({
        "@type": "Review",
        reviewRating: {
          "@type": "Rating",
          ratingValue: r.rating,
          bestRating: 5,
          worstRating: 1,
        },
        author: {
          "@type": "Person",
          name: r.customerName || "Customer",
        },
        datePublished: r.submittedAt || undefined,
        reviewBody: r.text || undefined,
      }));
    }
  }
  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${origin}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: product.title || "Painting",
        item: url,
      },
    ],
  };
  return {
    title: `${product.title || "Painting"} — ${SITE_NAME}`,
    description,
    url,
    image: primaryImage,
    productLd,
    breadcrumbsLd,
  };
};

// Build the WebSite + Organization JSON-LD graphs that are safe to
// emit on every HTML page. WebSite unlocks Google's sitelinks search
// box; Organization lets the brand surface in knowledge-panel-ish
// contexts. Both are tiny (~600 B combined) and harmless to repeat
// across pages — schema.org explicitly de-duplicates on `@id`.
const buildSiteWideLd = (origin) => {
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: SITE_NAME,
    url: origin,
    logo: `${origin}/icon-512.png`,
  };
  const siteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: SITE_NAME,
    url: origin,
    publisher: { "@id": `${origin}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
  return [orgLd, siteLd];
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
      ['meta[property="og:type"]', "property", "og:type", "product"],
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

    // Insert per-page JSON-LD blocks at the top of <head>. Two
    // graphs: Product+Offer and BreadcrumbList. Both standalone, so
    // crawlers can pick whichever they understand. Site-wide
    // Organization + WebSite graphs are appended alongside so
    // crawlers can link the product offer to the brand entity.
    const siteWide = buildSiteWideLd(origin);
    rewriter.on("head", {
      element(el) {
        el.append(
          `<link rel="canonical" href="${xmlEscape(canonical)}">` +
            `<script type="application/ld+json">${JSON.stringify(
              perPage.productLd,
            ).replace(/</g, "\\u003c")}</script>` +
            `<script type="application/ld+json">${JSON.stringify(
              perPage.breadcrumbsLd,
            ).replace(/</g, "\\u003c")}</script>` +
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
  const isHtmlPath =
    url.pathname === "/" ||
    url.pathname.startsWith("/product/") ||
    url.pathname.startsWith("/policy/") ||
    url.pathname.startsWith("/preview/") ||
    url.pathname === "/account" ||
    url.pathname === "/signup" ||
    url.pathname === "/admin";
  if (!isHtmlPath) {
    return next();
  }

  const response = await next();
  if (!isHtmlResponse(response)) return response;

  const origin = `${url.protocol === "http:" ? "http" : "https"}//${url.host}`;
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
  }

  return buildRewriter({ canonical, perPage, origin }).transform(response);
};
