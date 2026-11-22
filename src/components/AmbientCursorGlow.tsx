import { useEffect, useRef } from "react";

// Soft, brand-gold spotlight that tracks the cursor across the
// viewport. Adds a calm, "next-gen" depth cue to the storefront
// without committing to a heavyweight WebGL background. Pointer
// events pass through, so nothing under it becomes inert.
//
// Disabled when:
// - `prefers-reduced-motion: reduce` is set (accessibility);
// - the visitor is on a coarse pointer (touch) device — there's no
//   cursor to follow, and the layer would just be a stuck blob.
//
// We render at z-0 with `mix-blend-mode: screen` (dark theme) /
// `multiply` (light theme) so the glow paints onto the page surface
// rather than over the top of every element. Updates run on
// `requestAnimationFrame` and bypass React state to keep the
// effect cheap (~one transform per frame, no re-renders).
export default function AmbientCursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const coarsePointer =
      window.matchMedia?.("(pointer: coarse)").matches ?? false;
    if (reduceMotion || coarsePointer) {
      el.style.display = "none";
      return;
    }

    // Start in the middle of the viewport so the first cursor move
    // doesn't reveal a glow stuck in the corner.
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let frame = 0;

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const tick = () => {
      // Lerp toward the cursor for a soft, lagging follow. 0.18 is
      // fast enough to feel responsive but slow enough that the
      // light looks like it has mass.
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;
      el.style.transform = `translate3d(${currentX - 320}px, ${
        currentY - 320
      }px, 0)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-0 h-[640px] w-[640px] rounded-full mix-blend-screen opacity-60 [@media(prefers-reduced-motion:reduce)]:hidden"
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in oklab, var(--logo-color) 38%, transparent) 0%, transparent 70%)",
        filter: "blur(40px)",
        willChange: "transform",
      }}
    />
  );
}
