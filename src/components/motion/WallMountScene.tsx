import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface WallMountSceneProps {
  /**
   * The child whose first `[data-daily-image]` descendant the wall +
   * frame snap to. Designed for `DailyFeature` (the "Painting of the
   * Day" block), but works with any child that exposes a similarly
   * tagged image cell.
   */
  children: ReactNode;
  /**
   * CSS selector for the painting node the frame should hug. Defaults
   * to `[data-daily-image]` (the existing data-attr inside
   * `DailyFeature.tsx`). Override only if reusing for another block.
   */
  targetSelector?: string;
  /** Extra class names forwarded to the host element. */
  className?: string;
  /**
   * Optional `id` for the host element — useful for skip-link / dock
   * anchors when the wall scene is the navigable section root.
   */
  id?: string;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isCoarsePointer = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

// Inline SVG noise as a data URL. ~250 B, never hits the network and
// never costs a CSP entry. baseFrequency 0.85 reads as plaster-grain
// at typical viewport sizes; opacity is clamped low in the wall layer
// (mix-blend-multiply at 6%) so it never dominates the gradient.
const NOISE_DATA_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";

/**
 * `<WallMountScene />` — wraps the "Painting of the Day" block so
 * that, as the visitor scrolls past, a plaster wall fades in behind
 * it and a thin matte-black gallery frame (with a slim cream mat)
 * snaps onto the painting. A soft cast-shadow grows underneath.
 *
 * The end-state reads as "the daily painting has been mounted on a
 * gallery wall." All three layers — wall, frame, shadow — are pure
 * CSS / inline SVG, so the component adds no image assets, no
 * external fetches, and no CSP changes.
 *
 * The frame layer measures the `[data-daily-image]` node inside the
 * children on mount + on resize (via `ResizeObserver`), so it tracks
 * the painting's true bounding box even when DailyFeature reflows
 * (e.g. when the artwork loads asynchronously or the viewport
 * resizes between mobile and desktop breakpoints).
 *
 * Mobile (`pointer: coarse`) and `prefers-reduced-motion` users skip
 * the scrub entirely and render the fully-mounted end state from
 * first paint — scrubbed scroll animation on phones is jittery and
 * hurts more than it helps.
 */
const WallMountScene = ({
  children,
  targetSelector = "[data-daily-image]",
  className,
  id,
}: WallMountSceneProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wallRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  // `staticMounted` is the fallback path: when reduced-motion is on
  // or the device is coarse-pointer, we skip the scrub timeline and
  // simply render the fully-mounted end state from the start. The
  // lazy initializer runs once during the initial render so the
  // first paint already reflects the correct state — no cascading
  // setState-in-effect render. Both probes are SSR-safe.
  const [staticMounted] = useState(
    () => prefersReducedMotion() || isCoarsePointer(),
  );

  // Position the frame + shadow over the painting. We measure the
  // [data-daily-image] descendant's bounding rect relative to the
  // root and write the offsets to inline styles. A ResizeObserver
  // keeps the geometry correct across artwork loads / breakpoints.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const frame = frameRef.current;
    const shadow = shadowRef.current;
    if (!root || !frame) return;

    const target = root.querySelector<HTMLElement>(targetSelector);
    if (!target) return;

    const FRAME_PAD = 14; // px of black frame outside the painting
    const SHADOW_VERTICAL_OFFSET = 8; // shadow sits just under the bottom edge
    const SHADOW_HORIZONTAL_OVERHANG = 24;
    const SHADOW_HEIGHT = 36;

    const update = () => {
      const r = target.getBoundingClientRect();
      const parent = root.getBoundingClientRect();
      const top = r.top - parent.top;
      const left = r.left - parent.left;
      frame.style.top = `${top - FRAME_PAD}px`;
      frame.style.left = `${left - FRAME_PAD}px`;
      frame.style.width = `${r.width + FRAME_PAD * 2}px`;
      frame.style.height = `${r.height + FRAME_PAD * 2}px`;
      if (shadow) {
        shadow.style.top = `${top + r.height + SHADOW_VERTICAL_OFFSET}px`;
        shadow.style.left = `${left - SHADOW_HORIZONTAL_OVERHANG}px`;
        shadow.style.width = `${r.width + SHADOW_HORIZONTAL_OVERHANG * 2}px`;
        shadow.style.height = `${SHADOW_HEIGHT}px`;
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(target);
    ro.observe(root);
    window.addEventListener("resize", update);
    // Refresh ScrollTrigger geometry whenever the painting reflows so
    // the scrub window stays accurate (otherwise the trigger keeps
    // the original `start`/`end` pixel offsets from mount time).
    const refreshId = window.setTimeout(() => ScrollTrigger.refresh(), 0);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.clearTimeout(refreshId);
    };
  }, [targetSelector]);

  useEffect(() => {
    if (staticMounted) return;
    const root = rootRef.current;
    const wall = wallRef.current;
    const frame = frameRef.current;
    const shadow = shadowRef.current;
    if (!root || !wall || !frame || !shadow) return;

    const ctx = gsap.context(() => {
      gsap.set(wall, { opacity: 0, y: 28 });
      gsap.set(frame, { opacity: 0, scaleX: 0.96, scaleY: 0.9 });
      gsap.set(shadow, { opacity: 0, scale: 0.6 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          // Scrub-window starts before the section is fully on-screen
          // (so the wall begins to bloom into view as the visitor
          // approaches) and ends a bit before the section reaches
          // the top, so by the time the user reads the copy the
          // painting is fully mounted and stable.
          start: "top 90%",
          end: "top 30%",
          scrub: true,
        },
      });
      tl.to(wall, { opacity: 1, y: 0, ease: "none" }, 0)
        .to(frame, { opacity: 1, scaleX: 1, scaleY: 1, ease: "none" }, 0.15)
        .to(shadow, { opacity: 0.4, scale: 1, ease: "none" }, 0.1);
    }, root);

    return () => ctx.revert();
  }, [staticMounted]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`} id={id}>
      {/* Wall plaster + faint noise + picture-rail hairline. Sits
          behind everything else in the scene (-z-[1]) so the painting
          card's existing background / text never compete with it. */}
      <div
        ref={wallRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #efe9df 0%, #e9e1d3 60%, #ddd3c3 100%)",
          opacity: staticMounted ? 1 : 0,
          transform: staticMounted ? "translateY(0)" : undefined,
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 mix-blend-multiply"
          style={{ backgroundImage: NOISE_DATA_URL, opacity: 0.06 }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[14%] border-t border-stone-900/15"
        />
      </div>

      {/* Cast shadow under the painting — soft elliptical blur tied
          to the painting's bottom edge. Behind the frame (z-0). */}
      <div
        ref={shadowRef}
        aria-hidden="true"
        className="pointer-events-none absolute z-0 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%)",
          opacity: staticMounted ? 0.4 : 0,
        }}
      />

      {/* Thin matte-black gallery frame with a slim cream mat. Sits
          above the painting (z-[1]) so the inset cream border reads
          as the mat just inside the frame edge. The pointer-events
          guard keeps it from intercepting clicks on the painting
          link beneath. */}
      <div
        ref={frameRef}
        aria-hidden="true"
        className="pointer-events-none absolute z-[1] rounded-[2px]"
        style={{
          border: "10px solid #131313",
          boxShadow:
            "inset 0 0 0 6px #f5f3ee, 0 14px 30px -18px rgba(0,0,0,0.45)",
          opacity: staticMounted ? 1 : 0,
        }}
      />

      {children}
    </div>
  );
};

export default WallMountScene;
