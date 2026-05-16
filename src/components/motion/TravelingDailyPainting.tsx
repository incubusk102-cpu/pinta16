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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
 * Coarse-pointer visitors (mobile / tablet) DO get the travel
 * animation — the scrub time is just tightened so it tracks finger
 * scrolling without feeling laggy.
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
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!artwork) return;
    if (prefersReducedMotion()) return;

    const isCoarsePointer = prefersCoarsePointer();

    const proxy = proxyRef.current;
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!proxy || !img || !frame) return;

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

      const x = o.left + (d.left - o.left) * progress;
      const y = o.top + (d.top - o.top) * progress;
      const w = o.width + (d.width - o.width) * progress;
      const h = o.height + (d.height - o.height) * progress;

      // Snap-to-pixel for crisper rendering — sub-pixel translations
      // are common during scroll and antialiasing can make the
      // painting look blurry mid-flight.
      proxy.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      proxy.style.width = `${Math.round(w)}px`;
      proxy.style.height = `${Math.round(h)}px`;

      // Fade the proxy in/out at the two endpoints so the crossfade
      // between (original ↔ proxy) and (proxy ↔ landed) is invisible.
      // Hold the proxy fully opaque through the middle 80% of travel.
      const proxyOpacity =
        progress < 0.1
          ? progress * 10
          : progress > 0.9
            ? Math.max(0, (1 - progress) * 10)
            : 1;

      proxy.style.opacity = proxyOpacity.toFixed(4);

      // Frame, gold trim, cream matt and shadow ramp in as the
      // painting approaches the wall — the picture is "unframed" while
      // in flight (matches what's in the Daily card) and "framed" once
      // it lands. We drive the bevel via CSS variables on the frame
      // element so all four shells (frame / gold / matt / shadow)
      // animate from the same source.
      const frameProgress = clamp01((progress - 0.45) / 0.55);
      frame.style.setProperty("--frame-progress", frameProgress.toFixed(4));

      // Daily card opacity — falls off in the first 12% of progress so
      // the painting "lifts out" of the card cleanly without us
      // showing both at once.
      const cardOpacity = Math.max(0, 1 - progress * 8);
      setVar("--daily-card-opacity", cardOpacity);
      setVar("--daily-travel-progress", progress);
      setVar("--daily-travel-opacity", proxyOpacity);
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
        // Touch scrolling has its own momentum / damping; a long
        // scrub time on mobile makes the painting feel like it's
        // dragging behind the finger. Tighten the smoothing so the
        // travel tracks the actual scroll position closely on
        // mobile, and keep the slightly smoothed value on desktop
        // where wheel scrolling is more discrete.
        scrub: isCoarsePointer ? 0.15 : 0.4,
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

      // First paint — apply progress 0 immediately so the proxy is
      // sized and positioned correctly before the first scroll event.
      updateProxy(0);
    });

    return () => {
      ctx.revert();
      root.style.removeProperty("--daily-travel-progress");
      root.style.removeProperty("--daily-card-opacity");
      root.style.removeProperty("--daily-travel-opacity");
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
      <div
        ref={frameRef}
        className="relative h-full w-full"
        style={
          {
            // `--frame-progress` is set from JS (0 → 1 as the painting
            // travels). All four shells below interpolate from "flush
            // image" to "framed and matted" against this single var.
            "--frame-progress": "0",
          } as React.CSSProperties
        }
      >
        {/* Cast shadow — soft ellipse that grows in as the painting
            nears the wall. Identical formula to the WallScene shadow
            so the two read as the same piece of art. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[8%] -bottom-[3%] h-[8%]"
          style={{
            background:
              "radial-gradient(ellipse 60% 100% at 50% 50%, rgba(20,12,2,0.32) 0%, rgba(20,12,2,0) 75%)",
            filter: "blur(2px)",
            opacity: "var(--frame-progress, 0)",
          }}
        />
        {/* Frame composition — the matte-black wood outer was removed
            per user feedback (felt persistent / boxy on the wall) so
            the in-flight proxy now mirrors the wall destination: just
            a thin gold trim around a cream matt around the painting,
            scaled in from "naked image" → "matted + gold trim" via
            `--frame-progress`. A soft drop shadow scales in on the
            outer container so the painting still reads as a physical
            object lifting onto the wall. */}
        <div
          className="relative h-full w-full"
          style={{
            boxShadow:
              "0 calc(var(--frame-progress, 0) * 18px) calc(var(--frame-progress, 0) * 30px) calc(var(--frame-progress, 0) * -14px) rgba(20,15,5,0.45)",
          }}
        >
          {/* Gold-leaf trim — padding scales with progress so the
              gold band appears only on landing. */}
          <div
            className="relative h-full w-full"
            style={{
              padding: "calc(var(--frame-progress, 0) * 2px)",
              background:
                "linear-gradient(135deg, #d8b56a 0%, #c9a96e 50%, #a78348 100%)",
              borderRadius: "1px",
            }}
          >
            {/* Cream matt between gold and painting. */}
            <div
              className="relative h-full w-full"
              style={{
                padding: "calc(var(--frame-progress, 0) * 10px)",
                backgroundColor: "#f5f3ee",
              }}
            >
              <img
                ref={imgRef}
                src={image}
                alt=""
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
                style={{
                  borderRadius: "0",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TravelingDailyPainting;
