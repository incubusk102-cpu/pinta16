import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { findArtworkById } from "@/lib/artworks";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const prefersCoarsePointer = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

/**
 * `<TravelingDailyPainting />` — a fixed-position floating "proxy"
 * painting that physically travels from the Painting of the Day card
 * (at the top of the homepage) down to the `<WallScene />` further
 * down the page, scrubbed by scroll.
 *
 * Three DOM positions hold the same artwork:
 *
 *   1. Inside `<DailyFeature />` at `[data-daily-image] img`
 *      → the "origin" rect. Resting position when scroll is at the
 *      top of the trigger range.
 *
 *   2. Inside `<WallScene />` at `[data-wall-target]`
 *      → the "destination" rect. Resting position when scroll has
 *      moved fully into the wall scene.
 *
 *   3. This component itself — a `position: fixed` <img> that
 *      interpolates between the two rects during the travel window.
 *      Frame and glow scale up as the painting nears the wall.
 *
 * Coordination with the rest of the page is done via three CSS
 * custom properties set on `:root`:
 *
 *   --daily-travel-progress: 0..1  (current travel progress)
 *   --daily-card-opacity   : 0..1  (consumed by `[data-daily-card]`)
 *   --daily-travel-opacity : 0..1  (this proxy's own opacity)
 *
 * The Daily card wrapper in `index.tsx` reads `--daily-card-opacity`
 * to fade out while the painting is in flight and fade back in when
 * the visitor scrolls back up. The "landed" painting inside
 * `<WallScene />` reads `--daily-travel-progress` to fade in at the
 * end of the travel.
 *
 * Reduced-motion visitors don't render this component at all — they
 * see the painting in both the Daily card and on the wall in their
 * resting positions. The CSS variables stay unset, so the fallbacks
 * (`1`) make both copies visible without any scroll choreography.
 *
 * Coarse-pointer / mobile visitors don't render this component
 * either. `<WallScene />` itself is gated to desktop, so on mobile
 * the destination `[data-wall-target]` doesn't exist and there's
 * nothing for the proxy to travel toward — but more importantly,
 * scrubbed-on-scroll motion on touch devices fights the OS's native
 * scroll momentum and feels laggy regardless of how tight the scrub
 * is. Mobile visitors see the painting once, in the Daily card at
 * the top of the homepage, and that's it.
 */
const TravelingDailyPainting = () => {
  const { config, loading } = useStorefrontConfig();
  const { products } = useProducts();

  const today = config.dailyFeatureToday;

  const artwork = useMemo(() => {
    if (!today?.productId) return undefined;
    return findArtworkById(today.productId, products);
  }, [today?.productId, products]);

  const proxyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!artwork) return;
    if (prefersReducedMotion()) return;
    // `<WallScene />` only mounts on desktop / fine-pointer, so on
    // mobile there's no destination rect for the proxy to fly into.
    // Bail out early to avoid creating GSAP ScrollTriggers whose
    // trigger selector resolves to `null`, and to skip writing the
    // coordinating CSS variables on `:root` (their fallbacks of `1`
    // already keep the Daily card visible).
    if (prefersCoarsePointer()) return;

    const proxy = proxyRef.current;
    if (!proxy) return;

    const root = document.documentElement;

    // Resolve origin / destination on the fly — both elements live in
    // sibling components whose mount timing we don't control, and the
    // origin can disappear entirely if the admin clears the daily
    // feature mid-session. Looking them up inside the update keeps the
    // proxy robust against late-mounted or remounted children.
    const findOrigin = () =>
      document.querySelector<HTMLElement>("[data-daily-image]");
    const findDestination = () =>
      document.querySelector<HTMLElement>("[data-wall-target]");

    let originRect: DOMRect | null = null;
    let destinationRect: DOMRect | null = null;

    const setVar = (name: string, value: number) => {
      root.style.setProperty(name, value.toFixed(4));
    };

    // Initial CSS-variable state: pretend we're at progress 0 so the
    // Daily card is fully visible and the wall's landed painting is
    // hidden. Without these initial values the wall painting would
    // fall back to its CSS default (1) on first paint and the page
    // would flash a painting on the wall before the trigger spins up.
    setVar("--daily-travel-progress", 0);
    setVar("--daily-card-opacity", 1);
    setVar("--daily-travel-opacity", 0);
    // Companion variable for the leave-fade trigger below. Starts at
    // 1 (fully visible) and falls to 0 as the wall section scrolls
    // off the top of the viewport. `<WallScene />` multiplies this
    // against `--daily-travel-progress` so the painting is shown only
    // while the section is actually in view.
    setVar("--daily-wall-leave-opacity", 1);

    const updateProxy = (progress: number) => {
      const o = originRect ?? findOrigin()?.getBoundingClientRect() ?? null;
      const d =
        destinationRect ?? findDestination()?.getBoundingClientRect() ?? null;
      if (!o || !d) {
        proxy.style.opacity = "0";
        return;
      }
      originRect = o;
      destinationRect = d;

      // Park the proxy at the origin during the fade-in window (0 →
      // 0.1) and at the destination during the fade-out window (0.9 →
      // 1.0), so the crossfades on each end happen at the same screen
      // position as the thing the proxy is crossfading with — the
      // Daily card on the way out, and the 3D wall painting on the
      // way in. Without this, the proxy's lerped position at e.g.
      // progress=0.95 is 5% of the way back toward the Daily card
      // (i.e. visibly above the wall target), so when the wall
      // painting fades in at its `[data-wall-target]` rect the
      // visitor sees the painting jump downward on landing — and
      // mirror-image on the way back, the painting appears to
      // disappear from the wall and instantly reappear in flight
      // rather than smoothly lifting off the wall. Clamping the lerp
      // progress to the "travel" window (0.1 → 0.9) keeps the proxy
      // pinned in place during the visual handoffs.
      const TRAVEL_START = 0.1;
      const TRAVEL_END = 0.9;
      const lerp =
        progress <= TRAVEL_START
          ? 0
          : progress >= TRAVEL_END
            ? 1
            : (progress - TRAVEL_START) / (TRAVEL_END - TRAVEL_START);

      const x = o.left + (d.left - o.left) * lerp;
      const y = o.top + (d.top - o.top) * lerp;
      const w = o.width + (d.width - o.width) * lerp;
      const h = o.height + (d.height - o.height) * lerp;

      // Snap-to-pixel for crisper rendering — sub-pixel translations
      // are common during scroll and antialiasing can make the
      // painting look blurry mid-flight.
      proxy.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      proxy.style.width = `${Math.round(w)}px`;
      proxy.style.height = `${Math.round(h)}px`;

      // Fade the proxy in/out at the two endpoints so the crossfade
      // between (original ↔ proxy) and (proxy ↔ landed) is invisible.
      // Hold the proxy fully opaque through the middle 80% of travel.
      // The opacity windows match the parked-position windows above
      // (0 → 0.1 fade in at origin, 0.9 → 1.0 fade out at destination)
      // so the proxy is always at the crossfade target's position
      // while its opacity ramps.
      const proxyOpacity =
        progress < TRAVEL_START
          ? progress / TRAVEL_START
          : progress > TRAVEL_END
            ? Math.max(0, (1 - progress) / (1 - TRAVEL_END))
            : 1;

      proxy.style.opacity = proxyOpacity.toFixed(4);

      // The proxy itself is a naked `<img>` — no frame chrome, no
      // gold trim, no cream matt. The destination on the wall is now
      // a Three.js painting viewer (`<WallPainting3D />`) which
      // already renders its own beveled wood frame in 3D, so trying
      // to fade a 2D frame in during flight would clash with the
      // 3D frame appearing on landing. The handoff is a straight
      // image → 3D-scene crossfade, driven by the proxy's own opacity
      // (above) and the wall's `--daily-travel-progress` opacity
      // shell.

      // Daily card opacity — falls off in the first 12% of progress so
      // the painting "lifts out" of the card cleanly without us
      // showing both at once.
      const cardOpacity = Math.max(0, 1 - progress * 8);
      setVar("--daily-card-opacity", cardOpacity);
      setVar("--daily-travel-progress", progress);
      setVar("--daily-travel-opacity", proxyOpacity);
    };

    const updateLeave = (progress: number) => {
      // 1 → 0 as the section scrolls off the top. `WallScene`
      // multiplies this against the travel progress, so the painting
      // is shown only while the section is actually in view and
      // fades out cleanly once the visitor scrolls past it.
      setVar("--daily-wall-leave-opacity", 1 - progress);
    };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        // Trigger on the wall scene — start the travel when its top is
        // about to enter the viewport, finish when its top reaches a
        // little above the centre so the landing locks in before the
        // visitor has to read the page below.
        trigger: "[data-wall-scene]",
        start: "top bottom",
        end: "top 30%",
        // Slightly smoothed scrub so wheel scroll feels glassy
        // rather than 1:1 jittery. Mobile / coarse-pointer never
        // reaches this code path — the effect is gated to desktop
        // by the `prefersCoarsePointer()` early-return above and by
        // `<WallScene />` not mounting on mobile.
        scrub: 0.4,
        onUpdate: (self) => {
          // Re-resolve rects each update — the page can grow / shrink
          // when admin-driven sections load in (`InspiredByYouRail`,
          // reviews, etc.) and any layout shift between mount and the
          // first scroll would otherwise leave the proxy stranded.
          originRect = null;
          destinationRect = null;
          updateProxy(self.progress);
        },
        // Refresh rects on every ScrollTrigger refresh (resize, async
        // sections loading in) so the lerp stays accurate. `self` is
        // the ScrollTrigger instance — we read progress off it rather
        // than closing over the returned reference because GSAP calls
        // `onRefresh` synchronously during `ScrollTrigger.create()`,
        // before the create() return value is bound. Capturing the
        // returned reference would throw a TDZ error on the very
        // first refresh when the trigger element is already in the
        // DOM (which is the case once `<WallScene />` mounts eagerly
        // outside the lazy-section Suspense).
        onRefresh: (self) => {
          originRect = null;
          destinationRect = null;
          updateProxy(self.progress);
        },
      });

      // Leave-fade trigger: independent from the travel trigger above
      // so the two scroll windows don't compete for the same progress
      // value. The leave window starts at the exact pin point where
      // the travel ends ("top 30%" — wall section's top crossing 30%
      // from the viewport top) so the wall painting is fully visible
      // at the boundary, and runs until the section's bottom passes
      // the viewport top ("bottom top" — section fully scrolled
      // past). Same scrub as the travel trigger; desktop-only.
      ScrollTrigger.create({
        trigger: "[data-wall-scene]",
        start: "top 30%",
        end: "bottom top",
        scrub: 0.4,
        onUpdate: (self) => updateLeave(self.progress),
        // `self` is the ScrollTrigger instance — same TDZ-safe pattern
        // as the travel trigger above. GSAP calls `onRefresh`
        // synchronously during `ScrollTrigger.create()`, before the
        // create() return value is bound, so we read progress off
        // `self` rather than closing over the returned reference.
        onRefresh: (self) => updateLeave(self.progress),
      });

      // First paint — apply progress 0 immediately so the proxy is
      // sized and positioned correctly before the first scroll event.
      updateProxy(0);
      updateLeave(0);
    });

    return () => {
      ctx.revert();
      root.style.removeProperty("--daily-travel-progress");
      root.style.removeProperty("--daily-card-opacity");
      root.style.removeProperty("--daily-travel-opacity");
      root.style.removeProperty("--daily-wall-leave-opacity");
    };
  }, [artwork]);

  if (loading) return null;
  if (!today || !artwork) return null;

  const image = artwork.images?.[0]?.url || artwork.image;

  return (
    <div
      ref={proxyRef}
      aria-hidden="true"
      data-traveling-painting
      className="pointer-events-none fixed left-0 top-0 z-40"
      style={{
        opacity: 0,
        willChange: "transform, opacity",
      }}
    >
      {/* Naked `<img>` proxy — no frame chrome, no shadow, no matt.
          The destination on the wall is a 3D Three.js viewer with its
          own beveled wood frame, so the proxy stays simple during
          flight and crossfades into the 3D scene on landing. */}
      <img
        src={image}
        alt=""
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
      />
    </div>
  );
};

export default TravelingDailyPainting;
