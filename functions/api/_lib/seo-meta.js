// Pure SEO / share-card / JSON-LD payload builders.
//
// Lifted out of `functions/_middleware.js` so the same logic can be
// exercised under plain Node (Vitest) without dragging in the
// Cloudflare-only `HTMLRewriter`, KV bindings, or runtime context.
// The middleware itself still owns request dispatch, KV reads, and
// the streaming HTML rewrite — this module is only the string-level
// payload it hands to the rewriter.
//
// Anything exported from here is treated as the source-of-truth
// "what crawlers, share-card unfurlers, and rich-result snippets see
// for this URL" — the unit tests under tests/unit/middleware/ assert
// against these shapes so we don't have to round-trip through
// Facebook's / Twitter's / Google's live validators on every change.
//
// Three groups of exports:
//   1. constants / catalogues  — SITE_NAME, DEFAULT_OG_IMAGE,
//                                STATIC_PAGE_META, RESOURCE_ARTICLE_META
//   2. string helpers          — xmlEscape, truncate, absUrl, PHP,
//                                availabilityToSchemaUrl
//   3. payload builders        — buildSiteWideLd, buildProductMeta,
//                                buildStaticPageMeta,
//                                resolveStaticPageMeta

export const SITE_NAME = "Canvas Hub";
export const DEFAULT_OG_IMAGE = "/og-default.webp";

// Per-page static metadata for non-product public routes. Mirrors the
// `useSEO` calls in the corresponding route components in `src/routes/`
// so the HTMLRewriter can emit the same title / description / OG card
// on first paint — i.e. before the SPA mounts and `useSEO` rewrites
// `<head>`. Crawlers and link unfurlers (Facebook, Twitter, Slack,
// iMessage, Pinterest) don't execute JavaScript, so this server-side
// copy is the only enrichment they ever see. Keep these strings in
// sync with the route's `useSEO({ title, description })` call.
export const STATIC_PAGE_META = {
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
export const RESOURCE_ARTICLE_META = {
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

export const xmlEscape = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const PHP = (n) =>
  Number.isFinite(Number(n)) ? Number(n).toFixed(2) : "0.00";

export const availabilityToSchemaUrl = (a) => {
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

export const absUrl = (origin, maybeUrl) => {
  if (!maybeUrl) return "";
  if (/^https?:\/\//.test(maybeUrl)) return maybeUrl;
  if (maybeUrl.startsWith("/")) return `${origin}${maybeUrl}`;
  return `${origin}/${maybeUrl}`;
};

export const truncate = (s, max = 200) => {
  const str = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
};

// Build the WebSite + Organization JSON-LD graphs that are safe to
// emit on every HTML page. WebSite unlocks Google's sitelinks search
// box; Organization lets the brand surface in knowledge-panel-ish
// contexts. Both are tiny (~600 B combined) and harmless to repeat
// across pages — schema.org explicitly de-duplicates on `@id`.
export const buildSiteWideLd = (origin) => {
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

// Build the per-product enrichment payload used by the rewriter.
// `reviewSummary` is optional; when present we attach an
// `aggregateRating` block and embed the most recent reviews so the
// Product rich-result eligibility threshold is met server-side
// (it's just three short snippets, total HTML weight under ~1.5 KB).
export const buildProductMeta = (product, origin, reviewSummary = null) => {
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
export const buildStaticPageMeta = (pathname, meta, origin) => {
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
export const resolveStaticPageMeta = (pathname, origin) => {
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

// Public allow-list of routes that the SPA owns AND that the
// middleware enriches. Used directly by `_middleware.onRequest` and
// re-exported so tests can iterate the full set without duplicating
// the list. Anything not in here (e.g. `/api/*`, `/icon-*.png`,
// `/manifest.webmanifest`, hashed JS/CSS chunks) skips enrichment
// entirely so we never pay the rewriter cost on hot static paths.
export const isEnrichableHtmlPath = (pathname) =>
  pathname === "/" ||
  pathname.startsWith("/product/") ||
  pathname.startsWith("/policy/") ||
  pathname.startsWith("/preview/") ||
  pathname.startsWith("/resources") ||
  pathname === "/collection" ||
  pathname === "/about" ||
  pathname === "/contact" ||
  pathname === "/account" ||
  pathname === "/signup" ||
  pathname === "/admin";
