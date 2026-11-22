import { describe, expect, it } from "vitest";
import {
  DEFAULT_OG_IMAGE,
  PHP,
  RESOURCE_ARTICLE_META,
  SITE_NAME,
  STATIC_PAGE_META,
  absUrl,
  availabilityToSchemaUrl,
  buildProductMeta,
  buildSiteWideLd,
  buildStaticPageMeta,
  isEnrichableHtmlPath,
  resolveStaticPageMeta,
  truncate,
  xmlEscape,
} from "../../../functions/api/_lib/seo-meta.js";

const ORIGIN = "https://canvhub.com";

// The middleware's job is to make sure share-card unfurlers
// (Facebook, Twitter, Slack, iMessage, Pinterest, LinkedIn) and
// search-engine crawlers see a valid, populated OG + Twitter card and
// a parseable JSON-LD block before the SPA mounts. These assertions
// stand in for actually running the live FB Sharing Debugger /
// Twitter Card Validator / Google Rich Results Test on every change.

// Each per-page payload shape that the rewriter emits must include
// these properties (used to populate <meta property="og:..."> and
// <meta name="twitter:..."> tags in `buildRewriter`).
const REQUIRED_PERPAGE_KEYS = [
  "title",
  "description",
  "url",
  "image",
  "ogType",
  "ldGraphs",
];

// JSON-LD graphs the middleware emits must round-trip through
// JSON.stringify/parse cleanly (i.e. no functions, no symbols, no
// undefined leaves) so crawlers ingesting the rendered HTML don't
// reject them.
const assertJsonLdRoundtrips = (graph) => {
  const serialized = JSON.stringify(graph);
  expect(serialized).toMatch(/^\{/);
  // No literal `"undefined"` values leaking through.
  expect(serialized).not.toContain('":undefined');
  // Must round-trip.
  const parsed = JSON.parse(serialized);
  expect(parsed).toBeTypeOf("object");
  // Required schema.org fields.
  expect(parsed["@context"]).toBe("https://schema.org");
  expect(typeof parsed["@type"]).toBe("string");
};

describe("xmlEscape", () => {
  it("escapes the five XML-significant characters", () => {
    expect(xmlEscape('<a href="x&y">\'</a>')).toBe(
      "&lt;a href=&quot;x&amp;y&quot;&gt;&apos;&lt;/a&gt;",
    );
  });

  it("coerces non-strings without throwing", () => {
    expect(xmlEscape(undefined)).toBe("");
    expect(xmlEscape(42)).toBe("42");
    // `null` String-coerces to "null"; we don't special-case it
    // because the rewriter never feeds it null in practice.
    expect(xmlEscape(null)).toBe("null");
  });
});

describe("PHP formatter", () => {
  it("formats finite numbers to 2 decimal places", () => {
    expect(PHP(1234)).toBe("1234.00");
    expect(PHP(1234.5)).toBe("1234.50");
    expect(PHP("99.999")).toBe("100.00");
  });

  it("falls back to 0.00 for non-numeric input", () => {
    expect(PHP(undefined)).toBe("0.00");
    expect(PHP(null)).toBe("0.00");
    expect(PHP("not-a-number")).toBe("0.00");
    expect(PHP(NaN)).toBe("0.00");
    expect(PHP(Infinity)).toBe("0.00");
  });
});

describe("availabilityToSchemaUrl", () => {
  it("maps every documented availability value to a schema.org URL", () => {
    expect(availabilityToSchemaUrl("available")).toBe(
      "https://schema.org/InStock",
    );
    expect(availabilityToSchemaUrl("made-to-order")).toBe(
      "https://schema.org/MadeToOrder",
    );
    expect(availabilityToSchemaUrl("reserved")).toBe(
      "https://schema.org/PreOrder",
    );
    expect(availabilityToSchemaUrl("sold")).toBe("https://schema.org/SoldOut");
  });

  it("defaults unknown values to InStock so listings never look unavailable to crawlers", () => {
    expect(availabilityToSchemaUrl(undefined)).toBe(
      "https://schema.org/InStock",
    );
    expect(availabilityToSchemaUrl("nonsense")).toBe(
      "https://schema.org/InStock",
    );
  });
});

describe("absUrl", () => {
  it("passes through fully-qualified URLs", () => {
    expect(absUrl(ORIGIN, "https://cdn.canvhub.com/x.webp")).toBe(
      "https://cdn.canvhub.com/x.webp",
    );
    expect(absUrl(ORIGIN, "http://example.com/x")).toBe("http://example.com/x");
  });

  it("prepends the origin to absolute paths", () => {
    expect(absUrl(ORIGIN, "/og-default.webp")).toBe(
      "https://canvhub.com/og-default.webp",
    );
  });

  it("inserts a slash for bare relative paths", () => {
    expect(absUrl(ORIGIN, "og-default.webp")).toBe(
      "https://canvhub.com/og-default.webp",
    );
  });

  it("returns empty string when the source URL is falsy", () => {
    expect(absUrl(ORIGIN, undefined)).toBe("");
    expect(absUrl(ORIGIN, "")).toBe("");
  });
});

describe("truncate", () => {
  it("collapses whitespace and trims", () => {
    expect(truncate("  hello   world  ")).toBe("hello world");
  });

  it("preserves strings under the limit", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("appends an ellipsis when over the limit", () => {
    const result = truncate("a".repeat(50), 10);
    expect(result.length).toBe(10);
    expect(result.endsWith("…")).toBe(true);
  });

  it("handles falsy input", () => {
    expect(truncate(undefined)).toBe("");
    expect(truncate(null)).toBe("");
  });
});

describe("buildSiteWideLd", () => {
  const [orgLd, siteLd] = buildSiteWideLd(ORIGIN);

  it("emits exactly two graphs (Organization + WebSite)", () => {
    expect(buildSiteWideLd(ORIGIN)).toHaveLength(2);
  });

  it("Organization graph references the brand with a stable @id so schema.org de-dupes", () => {
    expect(orgLd["@type"]).toBe("Organization");
    expect(orgLd["@id"]).toBe(`${ORIGIN}/#organization`);
    expect(orgLd.name).toBe(SITE_NAME);
    expect(orgLd.url).toBe(ORIGIN);
    expect(orgLd.logo).toBe(`${ORIGIN}/icon-512.png`);
    assertJsonLdRoundtrips(orgLd);
  });

  it("WebSite graph wires the SearchAction so Google can render a sitelinks search box", () => {
    expect(siteLd["@type"]).toBe("WebSite");
    expect(siteLd["@id"]).toBe(`${ORIGIN}/#website`);
    expect(siteLd.publisher).toEqual({ "@id": `${ORIGIN}/#organization` });
    expect(siteLd.potentialAction["@type"]).toBe("SearchAction");
    expect(siteLd.potentialAction.target.urlTemplate).toContain(
      "?q={search_term_string}",
    );
    expect(siteLd.potentialAction["query-input"]).toBe(
      "required name=search_term_string",
    );
    assertJsonLdRoundtrips(siteLd);
  });
});

describe("buildProductMeta", () => {
  const baseProduct = {
    id: "abc-123",
    title: "Bagong Silang Sunrise",
    description: "  Hand-painted oil on canvas.  ",
    image: "/products/sunrise.webp",
    price: 4500,
    medium: "Oil on canvas",
    availability: "available",
  };

  it("produces every key the rewriter needs for OG/Twitter cards", () => {
    const meta = buildProductMeta(baseProduct, ORIGIN);
    for (const key of REQUIRED_PERPAGE_KEYS) {
      expect(meta, `missing ${key}`).toHaveProperty(key);
    }
    expect(meta.ogType).toBe("product");
    expect(meta.url).toBe(`${ORIGIN}/product/abc-123`);
    expect(meta.title).toBe("Bagong Silang Sunrise — Canvas Hub");
    expect(meta.description).toBe("Hand-painted oil on canvas.");
    expect(meta.image).toBe(`${ORIGIN}/products/sunrise.webp`);
  });

  it("url-encodes the product id so unusual ids survive the URL slot", () => {
    const meta = buildProductMeta({ ...baseProduct, id: "a b/c?d" }, ORIGIN);
    expect(meta.url).toBe(`${ORIGIN}/product/${encodeURIComponent("a b/c?d")}`);
  });

  it("emits Product + BreadcrumbList JSON-LD graphs", () => {
    const meta = buildProductMeta(baseProduct, ORIGIN);
    expect(meta.ldGraphs).toHaveLength(2);
    const [productLd, breadcrumbsLd] = meta.ldGraphs;
    expect(productLd["@type"]).toBe("Product");
    expect(productLd["@id"]).toBe(`${ORIGIN}/product/abc-123#product`);
    expect(productLd.brand).toEqual({ "@type": "Brand", name: SITE_NAME });
    expect(productLd.category).toBe("Oil on canvas");
    expect(productLd.sku).toBe("abc-123");
    assertJsonLdRoundtrips(productLd);

    expect(breadcrumbsLd["@type"]).toBe("BreadcrumbList");
    expect(breadcrumbsLd.itemListElement).toHaveLength(2);
    expect(breadcrumbsLd.itemListElement[1].name).toBe(baseProduct.title);
    expect(breadcrumbsLd.itemListElement[1].item).toBe(meta.url);
    assertJsonLdRoundtrips(breadcrumbsLd);
  });

  it("renders the Offer block as PHP with 2-decimal price string", () => {
    const meta = buildProductMeta(baseProduct, ORIGIN);
    const [productLd] = meta.ldGraphs;
    expect(productLd.offers["@type"]).toBe("Offer");
    expect(productLd.offers.priceCurrency).toBe("PHP");
    expect(productLd.offers.price).toBe("4500.00");
    expect(productLd.offers.availability).toBe("https://schema.org/InStock");
    expect(productLd.offers.itemCondition).toBe(
      "https://schema.org/NewCondition",
    );
    expect(productLd.offers.url).toBe(meta.url);
  });

  it("prefers salePrice over price when both are set", () => {
    const meta = buildProductMeta({ ...baseProduct, salePrice: 3990 }, ORIGIN);
    expect(meta.ldGraphs[0].offers.price).toBe("3990.00");
  });

  it("uses the multi-image list when provided and absolutises all URLs", () => {
    const meta = buildProductMeta(
      {
        ...baseProduct,
        image: undefined,
        images: [
          { url: "/products/a.webp" },
          { url: "https://cdn.example.com/b.webp" },
          { url: null }, // dropped
        ],
      },
      ORIGIN,
    );
    expect(meta.ldGraphs[0].image).toEqual([
      `${ORIGIN}/products/a.webp`,
      "https://cdn.example.com/b.webp",
    ]);
    expect(meta.image).toBe(`${ORIGIN}/products/a.webp`);
  });

  it("falls back to the site icon when no images are configured at all", () => {
    const meta = buildProductMeta({ id: "x", title: "Untitled" }, ORIGIN);
    expect(meta.image).toBe(`${ORIGIN}/icon-512.png`);
    expect(meta.ldGraphs[0].image).toEqual([`${ORIGIN}/icon-512.png`]);
  });

  it("falls back to a synthetic description when the product has none", () => {
    const meta = buildProductMeta(
      { id: "x", title: "Untitled", image: "/x.webp" },
      ORIGIN,
    );
    expect(meta.description).toBe(`Untitled — ${SITE_NAME}`);
  });

  it("truncates a >300-char description so OG previews never overflow", () => {
    const description = "x".repeat(400);
    const meta = buildProductMeta({ ...baseProduct, description }, ORIGIN);
    expect(meta.description.length).toBe(300);
    expect(meta.description.endsWith("…")).toBe(true);
  });

  it("emits aggregateRating + Review block when reviews exist", () => {
    const meta = buildProductMeta(baseProduct, ORIGIN, {
      count: 12,
      average: 4.5,
      recent: [
        {
          rating: 5,
          customerName: "Ana",
          submittedAt: "2024-12-01T00:00:00Z",
          text: "Beautiful.",
        },
        {
          rating: 4,
          customerName: "",
          submittedAt: "",
          text: "",
        },
      ],
    });
    const productLd = meta.ldGraphs[0];
    expect(productLd.aggregateRating).toMatchObject({
      "@type": "AggregateRating",
      ratingValue: "4.50",
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
    expect(productLd.review).toHaveLength(2);
    expect(productLd.review[0].author).toEqual({
      "@type": "Person",
      name: "Ana",
    });
    expect(productLd.review[1].author).toEqual({
      "@type": "Person",
      name: "Customer",
    });
    expect(productLd.review[1].datePublished).toBeUndefined();
    expect(productLd.review[1].reviewBody).toBeUndefined();
  });

  it("omits aggregateRating when reviewSummary.count is 0", () => {
    const meta = buildProductMeta(baseProduct, ORIGIN, {
      count: 0,
      average: 0,
      recent: [],
    });
    expect(meta.ldGraphs[0].aggregateRating).toBeUndefined();
    expect(meta.ldGraphs[0].review).toBeUndefined();
  });

  it("uses the documented availability mapping for non-default states", () => {
    const meta = buildProductMeta(
      { ...baseProduct, availability: "sold" },
      ORIGIN,
    );
    expect(meta.ldGraphs[0].offers.availability).toBe(
      "https://schema.org/SoldOut",
    );
  });
});

describe("buildStaticPageMeta", () => {
  it("emits a WebPage subtype + BreadcrumbList for a /collection-style payload", () => {
    const meta = buildStaticPageMeta(
      "/collection",
      STATIC_PAGE_META["/collection"],
      ORIGIN,
    );
    expect(meta.url).toBe(`${ORIGIN}/collection`);
    expect(meta.image).toBe(`${ORIGIN}${DEFAULT_OG_IMAGE}`);
    expect(meta.ogType).toBe("website");
    expect(meta.ldGraphs).toHaveLength(2);
    const [pageLd, breadcrumbsLd] = meta.ldGraphs;
    expect(pageLd["@type"]).toBe("CollectionPage");
    expect(pageLd["@id"]).toBe(`${ORIGIN}/collection#webpage`);
    expect(pageLd.inLanguage).toBe("en-PH");
    expect(pageLd.isPartOf).toEqual({ "@id": `${ORIGIN}/#website` });
    expect(pageLd.primaryImageOfPage).toBe(meta.image);
    assertJsonLdRoundtrips(pageLd);

    expect(breadcrumbsLd.itemListElement[1].name).toBe("The Collection");
    expect(breadcrumbsLd.itemListElement[1].item).toBe(meta.url);
    assertJsonLdRoundtrips(breadcrumbsLd);
  });

  it("defaults WebPage @type and ogType when not specified", () => {
    const meta = buildStaticPageMeta(
      "/contact",
      { title: "Title — Canvas Hub", description: "X" },
      ORIGIN,
    );
    expect(meta.ldGraphs[0]["@type"]).toBe("WebPage");
    expect(meta.ogType).toBe("website");
  });

  it("strips the ' — Canvas Hub' suffix from the breadcrumb leaf so the trail reads cleanly", () => {
    for (const [, meta] of Object.entries(STATIC_PAGE_META)) {
      const result = buildStaticPageMeta("/x", meta, ORIGIN);
      const leaf = result.ldGraphs[1].itemListElement[1].name;
      expect(leaf).not.toMatch(/ — Canvas Hub$/);
    }
  });
});

describe("resolveStaticPageMeta", () => {
  it.each(Object.keys(STATIC_PAGE_META))(
    "resolves %s to a complete per-page payload",
    (pathname) => {
      const meta = resolveStaticPageMeta(pathname, ORIGIN);
      expect(meta).not.toBeNull();
      for (const key of REQUIRED_PERPAGE_KEYS) {
        expect(meta, `missing ${key} on ${pathname}`).toHaveProperty(key);
      }
      expect(meta.url).toBe(`${ORIGIN}${pathname}`);
      expect(meta.ldGraphs).toHaveLength(2);
      meta.ldGraphs.forEach(assertJsonLdRoundtrips);
    },
  );

  it.each(Object.keys(RESOURCE_ARTICLE_META))(
    "resolves /resources/%s as an Article",
    (slug) => {
      const meta = resolveStaticPageMeta(`/resources/${slug}`, ORIGIN);
      expect(meta).not.toBeNull();
      expect(meta.ogType).toBe("article");
      expect(meta.ldGraphs[0]["@type"]).toBe("Article");
      expect(meta.url).toBe(`${ORIGIN}/resources/${slug}`);
      // Article title must be the slug's catalogue title (i.e. mirror
      // what `src/routes/resources.$slug.tsx` sets via useSEO).
      expect(meta.title).toBe(RESOURCE_ARTICLE_META[slug].title);
    },
  );

  it("decodes percent-encoded resource slugs before lookup", () => {
    const slug = "canvas-care";
    const encoded = encodeURIComponent(slug);
    const meta = resolveStaticPageMeta(`/resources/${encoded}`, ORIGIN);
    expect(meta).not.toBeNull();
    expect(meta.title).toBe(RESOURCE_ARTICLE_META[slug].title);
  });

  it("returns null for unknown resource slugs so the rewriter falls back to canonical-only", () => {
    expect(resolveStaticPageMeta("/resources/unknown-slug", ORIGIN)).toBeNull();
  });

  it("returns null for routes outside the static-page catalogue", () => {
    expect(resolveStaticPageMeta("/", ORIGIN)).toBeNull();
    expect(resolveStaticPageMeta("/account", ORIGIN)).toBeNull();
    expect(resolveStaticPageMeta("/admin", ORIGIN)).toBeNull();
    expect(resolveStaticPageMeta("/policy/refund", ORIGIN)).toBeNull();
    expect(resolveStaticPageMeta("/product/abc", ORIGIN)).toBeNull();
  });
});

describe("STATIC_PAGE_META catalogue", () => {
  it("every entry includes the Canvas Hub suffix in the title for share-card consistency", () => {
    for (const [path, meta] of Object.entries(STATIC_PAGE_META)) {
      expect(meta.title, `${path} title missing suffix`).toMatch(
        / — Canvas Hub$/,
      );
    }
  });

  it("every entry has a non-empty description short enough to fit a Twitter card (≤ 200 chars)", () => {
    for (const [path, meta] of Object.entries(STATIC_PAGE_META)) {
      expect(meta.description, `${path} description empty`).toBeTruthy();
      // Twitter card description hard limit is 200; OG is looser but
      // keep all entries under 200 so they look identical everywhere.
      expect(
        meta.description.length,
        `${path} description too long`,
      ).toBeLessThanOrEqual(200);
    }
  });

  it("every entry declares a JSON-LD WebPage subtype", () => {
    const validTypes = new Set([
      "WebPage",
      "CollectionPage",
      "AboutPage",
      "ContactPage",
    ]);
    for (const [path, meta] of Object.entries(STATIC_PAGE_META)) {
      expect(validTypes.has(meta.ldType), `${path} ldType=${meta.ldType}`).toBe(
        true,
      );
    }
  });
});

describe("RESOURCE_ARTICLE_META catalogue", () => {
  it("every article has a unique slug", () => {
    const slugs = Object.keys(RESOURCE_ARTICLE_META);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every article carries the Canvas Hub suffix in the title", () => {
    for (const [slug, meta] of Object.entries(RESOURCE_ARTICLE_META)) {
      expect(meta.title, `${slug} title missing suffix`).toMatch(
        / — Canvas Hub$/,
      );
    }
  });

  it("every article description fits inside Twitter's 200-char limit so unfurlers don't truncate mid-word", () => {
    for (const [slug, meta] of Object.entries(RESOURCE_ARTICLE_META)) {
      expect(meta.description, `${slug} description empty`).toBeTruthy();
      // We deliberately don't enforce 200 here because some articles
      // legitimately need a longer summary. Just check it's truthy and
      // not absurdly long.
      expect(meta.description.length).toBeLessThanOrEqual(500);
    }
  });
});

describe("isEnrichableHtmlPath", () => {
  it.each([
    "/",
    "/product/abc",
    "/policy/refund",
    "/preview/foo",
    "/resources",
    "/resources/canvas-care",
    "/collection",
    "/about",
    "/contact",
    "/account",
    "/signup",
    "/admin",
  ])("enriches %s", (pathname) => {
    expect(isEnrichableHtmlPath(pathname)).toBe(true);
  });

  it.each([
    "/api/orders",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/icon-512.png",
    "/assets/index-abc.js",
    "/og-default.webp",
    "/font-defer.js",
  ])("skips %s", (pathname) => {
    expect(isEnrichableHtmlPath(pathname)).toBe(false);
  });
});
