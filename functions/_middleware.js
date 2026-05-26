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
const DEFAULT_OG_IMAGE = "/og-default.webp";

// Per-page static metadata for non-product public routes. Mirrors the
// `useSEO` calls in the corresponding route components in `src/routes/`
// so the HTMLRewriter can emit the same title / description / OG card
// on first paint — i.e. before the SPA mounts and `useSEO` rewrites
// `<head>`. Crawlers and link unfurlers (Facebook, Twitter, Slack,
// iMessage, Pinterest) don't execute JavaScript, so this server-side
// copy is the only enrichment they ever see. Keep these strings in
// sync with the route's `useSEO({ title, description })` call.
const STATIC_PAGE_META = {
  "/collection": {
    title: "The Collection — Canvas Hub",
    description:
      "Every Canvas Hub painting in one place. Filter by category, price, and availability — each piece hand-crafted to order by Filipino artists.",
    ogType: "website",
    ldType: "CollectionPage",
  },
  "/about": {
    title: "About — Canvas Hub",
    description:
      "Meet the artists behind Canvas Hub. Hand-crafted Filipino paintings made to order from our studio in Bagong Silang, Caloocan.",
    ogType: "website",
    ldType: "AboutPage",
  },
  "/contact": {
    title: "Contact — Canvas Hub",
    description:
      "Get in touch with Canvas Hub. Email support@canvhub.com, call +63 956 468 5351, or visit our studio in Bagong Silang, Caloocan.",
    ogType: "website",
    ldType: "ContactPage",
  },
  "/resources": {
    title: "Resources — Canvas Hub",
    description:
      "Practical guides for living with original canvas paintings: how to hang, light, clean, frame, and store hand-crafted Filipino art so it lasts a lifetime.",
    ogType: "website",
    ldType: "CollectionPage",
  },
};

// `/resources/*` long-form articles. Mirrors `ARTICLE_META` in
// `src/routes/resources.$slug.tsx` — keep in sync.
const RESOURCE_ARTICLE_META = {
  "canvas-care": {
    title: "Caring for original canvas paintings — Canvas Hub",
    description:
      "A long-form care guide for original canvas paintings: dusting routines, cleaning mistakes to avoid, when to call a conservator, and how Philippine humidity affects the paint film.",
  },
  "framing-original-paintings": {
    title: "A framer's guide to original canvas — Canvas Hub",
    description:
      "Float frames vs. moulding frames, oil-painting air gaps, rabbet depth, archival backing, and why pressure-fitting a stretched canvas is a decade-delayed disaster.",
  },
  "hanging-art-gallery-style": {
    title: "Hanging art at gallery height — Canvas Hub",
    description:
      "The 57-inch convention, sofa-line adjustments, multi-piece clusters, picture lights, LED colour temperature, and why most living rooms hang art six inches too high.",
  },
  "humidity-and-storage": {
    title: "Humidity, climate, and long-term storage — Canvas Hub",
    description:
      "Tropical-climate storage techniques for original paintings: glassine wrapping, the typhoon-season exterior-wall rule, and how to crate a painting for a six-month move.",
  },
  "buying-art-as-investment": {
    title: "Buying original art as investment — Canvas Hub",
    description:
      "Primary-market provenance, certificates of authenticity, secondary-market liquidity, the Filipino auction landscape, and the case for buying what you love first.",
  },
  "choosing-art-for-every-room": {
    title: "Choosing the right painting for every room — Canvas Hub",
    description:
      "A room-by-room playbook for decorating with original, hand-painted canvas: how to size the piece, what subject and palette pair best with each space, and the small placement details that decide whether a painting feels like a focal point or background noise.",
  },
};

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
    ogType: "product",
    ldGraphs: [productLd, breadcrumbsLd],
  };
};

// Build the enrichment payload for static (non-product) public pages
// — `/collection`, `/about`, `/contact`, `/resources`, and the
// long-form `/resources/$slug` articles. Wraps the page in a
// schema.org `WebPage` subtype (CollectionPage / AboutPage /
// ContactPage / Article) and a two-item BreadcrumbList so crawlers
// can resolve the path on the site. Always returns canonical OG /
// Twitter card meta — no KV reads or async work.
const buildStaticPageMeta = (pathname, meta, origin) => {
  const url = `${origin}${pathname}`;
  const image = `${origin}${DEFAULT_OG_IMAGE}`;
  const pageLd = {
    "@context": "https://schema.org",
    "@type": meta.ldType || "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: meta.title,
    description: meta.description,
    isPartOf: { "@id": `${origin}/#website` },
    inLanguage: "en-PH",
    primaryImageOfPage: image,
  };
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
        name: meta.title.replace(/ — Canvas Hub$/, ""),
        item: url,
      },
    ],
  };
  return {
    title: meta.title,
    description: meta.description,
    url,
    image,
    ogType: meta.ogType || "website",
    ldGraphs: [pageLd, breadcrumbsLd],
  };
};

// Resolve a request pathname to a static-page meta payload, or null
// when the path doesn't match any known static page.
const resolveStaticPageMeta = (pathname, origin) => {
  if (Object.prototype.hasOwnProperty.call(STATIC_PAGE_META, pathname)) {
    return buildStaticPageMeta(pathname, STATIC_PAGE_META[pathname], origin);
  }
  if (pathname.startsWith("/resources/")) {
    const slug = decodeURIComponent(pathname.slice("/resources/".length));
    const articleMeta = Object.prototype.hasOwnProperty.call(
      RESOURCE_ARTICLE_META,
      slug,
    )
      ? RESOURCE_ARTICLE_META[slug]
      : null;
    if (!articleMeta) return null;
    return buildStaticPageMeta(
      pathname,
      { ...articleMeta, ogType: "article", ldType: "Article" },
      origin,
    );
  }
  return null;
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
  const isHtmlPath =
    url.pathname === "/" ||
    url.pathname.startsWith("/product/") ||
    url.pathname.startsWith("/policy/") ||
    url.pathname.startsWith("/preview/") ||
    url.pathname.startsWith("/resources") ||
    url.pathname === "/collection" ||
    url.pathname === "/about" ||
    url.pathname === "/contact" ||
    url.pathname === "/account" ||
    url.pathname === "/signup" ||
    url.pathname === "/admin";
  if (!isHtmlPath) {
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
