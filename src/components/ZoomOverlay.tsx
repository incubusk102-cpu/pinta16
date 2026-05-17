import { useEffect, useRef } from "react";
import gsap from "gsap";
import ZoomableImage from "@/components/ZoomableImage";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface ZoomOverlayProps {
  originRect: DOMRect | null;
  title: string;
  src: string;
  onClose: () => void;
}

function ZoomOverlay({ originRect, title, src, onClose }: ZoomOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!originRect || prefersReducedMotion()) {
      const ctx = gsap.context(() => {
        gsap.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
      }, overlay);
      return () => ctx.revert();
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = originRect.left + originRect.width / 2 - vw / 2;
    const cy = originRect.top + originRect.height / 2 - vh / 2;
    const sx = Math.max(originRect.width / vw, 0.05);
    const sy = Math.max(originRect.height / vh, 0.05);

    const ctx = gsap.context(() => {
      gsap.fromTo(
        overlay,
        {
          autoAlpha: 0,
          x: cx,
          y: cy,
          scaleX: sx,
          scaleY: sy,
          transformOrigin: "50% 50%",
        },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          duration: 0.7,
          ease: "power3.out",
        },
      );
    }, overlay);

    return () => {
      ctx.revert();
    };
  }, [originRect]);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label={`${title} – zoomed`}
      className="fixed inset-0 z-[110] bg-black/95 flex flex-col items-center justify-center p-4 md:p-6"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full bg-foreground text-background text-[11px] tracking-[0.2em] uppercase hover:opacity-90"
        aria-label="Close zoomed view"
      >
        Close
      </button>
      <ZoomableImage src={src} alt={title} className="w-full h-full" />
      <p className="mt-3 text-[10px] tracking-[0.25em] uppercase text-white/60">
        Pinch · scroll · double-tap to zoom · drag to pan
      </p>
    </div>
  );
}

export default ZoomOverlay;
