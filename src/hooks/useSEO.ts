import { useEffect } from "react";

/**
 * Per-route SEO head manager for the client-rendered SPA.
 *
 * Background: this app is `@tanstack/react-router` (not Start), so the
 * route-level `head()` configs in `src/routes/*.tsx` are not applied to
 * the live DOM — they only run under TanStack Start / SSR. As a result,
 * the only page that historically had correct per-route `<title>` /
 * `<meta>` tags was `/product/$id`, which mutates the document head
 * directly in a `useEffect`. Every other public page (`/`, `/collection`,
 * `/policy/*`, etc.) inherited the static fallback from `index.html`,
 * which is bad for SEO (duplicate titles across the catalogue) and
 * means private routes (`/admin`, `/account`, `/track`, `/preview/*`)
 * never emit their intended `<meta name="robots" content="noindex">`.
 *
 * `useSEO` centralises that DOM-mutation pattern: it writes the page
 * title, description, canonical, robots directive, and Open Graph /
 * Twitter card tags directly to `document.head` on mount + whenever
 * the inputs change. Tags created by this hook are tagged with
 * `data-managed="useSEO"` so we can find and update them on
 * subsequent calls without leaking duplicates across navigations.
 *
 * When `noindex` is true, the `X-Robots-Tag` HTTP header set in
 * `public/_headers` for `/admin*`, `/account*`, `/track*`, and
 * `/preview/*` is the authoritative signal (Googlebot reads either
 * the header or the meta — header wins on conflict). We still emit
 * the meta tag here for crawlers that don't surface the header in
 * their pipeline (e.g. Bingbot's older paths, social link unfurlers).
 */
export interface UseSEOOptions {
  /** Full document title, e.g. "The Collection — Canvas Hub". */
  title: string;
  /** Meta description (140–160 chars ideal). */
  description: string;
  /** Path on the current origin for the canonical URL, e.g. "/collection". Defaults to the live pathname. */
  canonicalPath?: string;
  /** When true, emit `noindex, nofollow` instead of the default `index, follow`. */
  noindex?: boolean;
  /** Open Graph type. Defaults to "website"; product pages pass "product". */
  ogType?: "website" | "article" | "product";
  /** Absolute or root-relative image URL for og:image / twitter:image. Defaults to `/icon-512.png`. */
  image?: string;
  /** Override og:title / twitter:title separately from the document title. */
  socialTitle?: string;
  /** Override og:description / twitter:description separately from the meta description. */
  socialDescription?: string;
  /** Width of the og:image in pixels (default 1200). */
  imageWidth?: number;
  /** Height of the og:image in pixels (default 630). */
  imageHeight?: number;
  /** Alt text for og:image:alt. Falls back to description. */
  imageAlt?: string;
}

const MANAGED_ATTR = "data-managed";
const MANAGED_VALUE = "useSEO";

const upsertMeta = (selector: string, attr: string, value: string): void => {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement("meta");
    // Re-derive the attribute pair (`name="..."` / `property="..."`) from
    // the selector so callers don't have to repeat the key. Only the
    // first attribute is parsed; the second is the value passed in.
    const m = selector.match(/^meta\[([a-z-]+)=["']([^"']+)["']\]$/i);
    if (m) tag.setAttribute(m[1], m[2]);
    tag.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
    document.head.appendChild(tag);
  }
  tag.setAttribute(attr, value);
};

const upsertHreflang = (lang: string, href: string): void => {
  const sel = `link[rel="alternate"][hreflang="${lang}"]`;
  let link = document.head.querySelector<HTMLLinkElement>(sel);
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", lang);
    link.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
};

const upsertCanonical = (href: string): void => {
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
};

export function useSEO(options: UseSEOOptions): void {
  const {
    title,
    description,
    canonicalPath,
    noindex = false,
    ogType = "website",
    image,
    socialTitle,
    socialDescription,
  } = options;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const origin =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "https://canvhub.com";
    const path =
      canonicalPath ??
      (typeof window !== "undefined" ? window.location.pathname : "/");
    const canonical = `${origin}${path}`;
    // Default og:image: a 1200x630 branded preview baked from the
    // "new collection" hero template, sized to the OG card aspect.
    // The previous default was the 512x512 PWA icon which Facebook
    // and Twitter pad with letterboxing because it doesn't meet the
    // 1200x630 OG spec. Product pages still override with their own
    // painting image; this only affects /collection, /about, /resources,
    // / etc.
    const fullImage = (() => {
      const src = image || "/og-default.webp";
      return src.startsWith("http") ? src : `${origin}${src}`;
    })();
    const ogTitle = socialTitle || title;
    const ogDescription = socialDescription || description;

    document.title = title;

    upsertMeta('meta[name="description"]', "content", description);
    upsertMeta(
      'meta[name="robots"]',
      "content",
      noindex ? "noindex, nofollow" : "index, follow",
    );

    upsertMeta('meta[property="og:type"]', "content", ogType);
    upsertMeta('meta[property="og:site_name"]', "content", "Canvas Hub");
    upsertMeta('meta[property="og:title"]', "content", ogTitle);
    upsertMeta('meta[property="og:description"]', "content", ogDescription);
    upsertMeta('meta[property="og:url"]', "content", canonical);
    upsertMeta('meta[property="og:image"]', "content", fullImage);
    upsertMeta(
      'meta[property="og:image:width"]',
      "content",
      String(options.imageWidth ?? 1200),
    );
    upsertMeta(
      'meta[property="og:image:height"]',
      "content",
      String(options.imageHeight ?? 630),
    );
    upsertMeta(
      'meta[property="og:image:alt"]',
      "content",
      options.imageAlt || description,
    );
    upsertMeta('meta[property="og:locale"]', "content", "en_PH");
    // Surface the Filipino content alternate so Facebook unfurlers
    // know the site also serves a fil-PH translation. The bundle in
    // src/locales/ swaps client-side based on the saved locale; the
    // URL is the same single-page origin for both variants today.
    upsertMeta('meta[property="og:locale:alternate"]', "content", "fil_PH");

    upsertMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    upsertMeta('meta[name="twitter:site"]', "content", "@canvashubph");
    // Same brand handle for `twitter:creator` — Canvas Hub posts under
    // a single canonical account, so the page author and the site
    // attribution are the same X / Twitter user. Splitting them out
    // is still useful for crawlers that special-case `creator` to
    // attribute the post on a card preview.
    upsertMeta('meta[name="twitter:creator"]', "content", "@canvashubph");
    upsertMeta('meta[name="twitter:title"]', "content", ogTitle);
    upsertMeta('meta[name="twitter:description"]', "content", ogDescription);
    upsertMeta('meta[name="twitter:image"]', "content", fullImage);

    // hreflang alternates — single-URL site serves both en and fil content.
    // Full locale-prefixed URLs would require a URL rewrite strategy;
    // documented inline as a future enhancement.
    upsertHreflang("en", canonical);
    upsertHreflang("fil", canonical);
    upsertHreflang("x-default", canonical);

    if (!noindex) {
      upsertCanonical(canonical);
    }
  }, [
    title,
    description,
    canonicalPath,
    noindex,
    ogType,
    image,
    socialTitle,
    socialDescription,
    options.imageWidth,
    options.imageHeight,
    options.imageAlt,
  ]);
}
