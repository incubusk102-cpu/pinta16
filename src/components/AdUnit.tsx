import { useEffect, useRef } from "react";

// Module-level type augmentation so `window.adsbygoogle.push({})` is
// strictly typed (no `any`, no `as unknown as`). The AdSense loader
// replaces this array with its own queue object once `adsbygoogle.js`
// finishes loading, but both shapes accept `.push({})` so a single
// `{ push }` signature is enough for our call site.
declare global {
  interface Window {
    adsbygoogle?: { push: (params: Record<string, unknown>) => void };
  }
}

type AdFormat = "auto" | "horizontal" | "vertical" | "rectangle";

export interface AdUnitProps {
  /** AdSense ad slot ID (the numeric value from the AdSense dashboard). */
  slot: string;
  /** Layout hint passed to AdSense as `data-ad-format`. */
  format: AdFormat;
  /** Optional extra classes for the outer container. */
  className?: string;
}

// Reserve vertical space per format so the page doesn't reflow when the
// ad iframe finishes loading. Keeps Cumulative Layout Shift inside
// Core Web Vitals "good" range (CLS < 0.1) — Lighthouse will flag
// auto-format ads without a placeholder height otherwise.
const MIN_HEIGHT_BY_FORMAT: Record<AdFormat, string> = {
  auto: "280px",
  horizontal: "90px",
  vertical: "600px",
  rectangle: "250px",
};

// Publisher ID is sourced from the same Vite env var as the loader in
// `src/lib/adsense.ts`. Reading it here (instead of threading it
// through props) keeps `<AdUnit>` self-contained: the consumer only
// needs to know the slot ID + desired format, not the publisher's
// account identifier.
const PUBLISHER_ID = import.meta.env.VITE_ADSENSE_PUBLISHER_ID as
  | string
  | undefined;

/**
 * Single AdSense placement.
 *
 * Renders the standard `<ins class="adsbygoogle">` element with the
 * `data-ad-*` attributes derived from props, wrapped in a sized
 * container so the layout doesn't shift once the ad iframe arrives.
 *
 * In development (`import.meta.env.DEV`) we set `data-adtest="on"` so
 * AdSense returns a test creative — without this flag, hitting
 * production-style requests from `localhost` can trip the publisher's
 * invalid-traffic counter.
 *
 * The standard `(adsbygoogle = window.adsbygoogle || []).push({})`
 * is wrapped in a try/catch + `typeof` guard so a missing or blocked
 * loader (ad-blocker, offline, CSP misconfig, publisher ID unset)
 * doesn't crash the page. `src/lib/adsense.ts` is expected to have
 * called `initAdSense()` by the time the first `<AdUnit>` mounts.
 */
const AdUnit = ({ slot, format, className }: AdUnitProps) => {
  // Track whether we've already pushed for this mount. Without this,
  // React 19 strict-mode's double-invoke effect would push() twice
  // for the same `<ins>`, and AdSense throws "All `ins` elements in
  // the DOM with class=adsbygoogle already have ads in them."
  const pushedRef = useRef(false);

  useEffect(() => {
    if (pushedRef.current) return;
    if (typeof window === "undefined") return;
    try {
      // `window.adsbygoogle` is an array placeholder until the loader
      // script replaces it with the real queue object. Either shape
      // supports `.push({})`, so guard only against the
      // never-initialized case (loader blocked, publisher ID unset).
      if (window.adsbygoogle) {
        window.adsbygoogle.push({});
        pushedRef.current = true;
      }
    } catch (err) {
      // Don't surface ad-loading failures to the user. Log once for
      // operator visibility in dev; production stays silent so
      // ad-blockers don't pollute Sentry.
      if (import.meta.env.DEV) {
        console.warn("[AdUnit] adsbygoogle.push failed:", err);
      }
    }
  }, []);

  const minHeight = MIN_HEIGHT_BY_FORMAT[format];

  return (
    <div
      className={className}
      style={{ minHeight, display: "block", overflow: "hidden" }}
      aria-hidden="true"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight }}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
        {...(import.meta.env.DEV ? { "data-adtest": "on" } : {})}
      />
    </div>
  );
};

export default AdUnit;
