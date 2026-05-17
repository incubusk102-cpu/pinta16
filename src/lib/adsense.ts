// Front-end Google AdSense loader.
//
// Modelled on `src/lib/observability.ts`: opt-in via a Vite env var,
// graceful no-op when the env var is unset, and idempotent so HMR
// re-runs and accidental double-mounts don't inject the script twice.
//
//   VITE_ADSENSE_PUBLISHER_ID
//     AdSense publisher ID (looks like `ca-pub-1234567890123456`). Set
//     in Cloudflare Pages → Settings → Environment variables. Vite
//     inlines `VITE_*` env vars at build time, so the value is committed
//     to the bundle — that's fine for AdSense publisher IDs, which are
//     designed to be public (the same ID appears verbatim in every
//     `adsbygoogle.js` request and on every `<ins data-ad-client>`
//     element rendered by `<AdUnit>`).
//
// CSP: see `public/_headers` — `pagead2.googlesyndication.com`,
// `partner.googleadservices.com`, and `tpc.googlesyndication.com` are
// allow-listed in `script-src`; `googleads.g.doubleclick.net` and
// `tpc.googlesyndication.com` in `frame-src`;
// `googleads.g.doubleclick.net` in `img-src`; and
// `pagead2.googlesyndication.com` in `connect-src` so the loader and
// the ad iframes can fetch creative + report impressions.

const ADSENSE_SRC =
  "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

const PUBLISHER_ID_FROM_ENV = import.meta.env.VITE_ADSENSE_PUBLISHER_ID as
  | string
  | undefined;

let inflight: Promise<void> | null = null;

/**
 * Inject the AdSense loader script (`adsbygoogle.js`) into the document
 * head, tagged with `data-ad-client=<publisherId>`. Resolves once the
 * `<script>` finishes loading.
 *
 * Resolution order for the publisher ID:
 *   1. `import.meta.env.VITE_ADSENSE_PUBLISHER_ID` (preferred — set
 *      in Cloudflare Pages env so the same bundle works across
 *      preview / production without code changes)
 *   2. The `publisherId` argument (fallback for tests / one-off injection)
 *
 * Idempotent: if a `<script>` with the AdSense `src` already exists on
 * the page, returns the same in-flight promise so callers from multiple
 * `<AdUnit>` mounts don't race or double-inject.
 *
 * Safe to call before `document` is ready (resolves to a no-op outside
 * the browser).
 */
export const initAdSense = (publisherId: string): Promise<void> => {
  if (typeof document === "undefined") return Promise.resolve();

  const client = PUBLISHER_ID_FROM_ENV || publisherId;
  if (!client) return Promise.resolve();

  // Idempotent: if the script is already on the page (e.g. HMR, a
  // previous `initAdSense` call, or another component beat us to it),
  // reuse the existing in-flight promise. Falling through to a fresh
  // `<script>` injection here would create a duplicate global
  // `window.adsbygoogle` queue and trip the AdSense loader's own
  // "only-load-this-once" diagnostic.
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src^="${ADSENSE_SRC}"]`,
  );
  if (existing) {
    if (inflight) return inflight;
    // Script tag already present from a server-rendered or hand-edited
    // page (no in-flight promise to reuse). If it's already finished
    // loading we can resolve immediately; otherwise wait for `load`.
    inflight = new Promise<void>((resolve) => {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
    });
    return inflight;
  }

  inflight = new Promise<void>((resolve) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = ADSENSE_SRC;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-ad-client", client);
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    // Don't reject — a blocked / failed AdSense fetch (ad-blocker,
    // offline, CSP misconfig) is expected in the wild and must not
    // crash the page. `<AdUnit>` already guards its `push()` call
    // against a missing `window.adsbygoogle`.
    script.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(script);
  });

  return inflight;
};

/** Convenience for debug panels — mirrors `observabilityStatus()`. */
export const adsenseStatus = () => ({
  adsenseConfigured: Boolean(PUBLISHER_ID_FROM_ENV),
  publisherId: PUBLISHER_ID_FROM_ENV,
});
