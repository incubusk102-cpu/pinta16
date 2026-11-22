import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { X, Loader2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import gsap from "gsap";
import { PaintingPlane } from "@/components/painting3d/PaintingMesh";

// 3D framed-painting viewer for the product page. Lazy-loaded behind a
// "View in 3D" button so the three.js + r3f + drei runtime (~120 KB
// gzipped) only ships when a customer actually opens it. The scene is
// deliberately simple — a thin painting plane sandwiched in a beveled
// wood frame, soft three-point lighting, mouse/touch orbit. No env
// HDRI map (the asset alone would dwarf the bundle savings) and no
// post-processing. The painting mesh + wood frame geometry are shared
// with `<WallPainting3D />` (inline auto-rotating viewer on the
// homepage wall scene) via `@/components/painting3d/PaintingMesh`.

interface PaintingViewer3DProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
  /**
   * Optional source rectangle (in viewport coordinates) for the GSAP
   * launch animation. When provided, the viewer first paints as a
   * scaled-down clone of that rectangle and then expands to fill the
   * screen — reads as if the hero frame zoomed into a 3D viewer.
   * Omit to skip the launch animation (e.g. when invoked from a
   * non-spatial caller).
   */
  originRect?: DOMRect | null;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function PaintingViewer3D({
  imageUrl,
  title,
  onClose,
  originRect,
}: PaintingViewer3DProps) {
  // Honour `prefers-reduced-motion`: customers who've opted out of
  // motion get a stationary scene they can still drag manually,
  // rather than a perpetually rotating one that triggers vestibular
  // discomfort. Read once at first render via useState's initializer
  // — doing this in an effect would force a second render and could
  // briefly auto-rotate before the opt-out applied.
  const [autoRotate] = useState(() => {
    if (typeof window === "undefined") return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [resetKey, setResetKey] = useState(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Esc closes the modal — same affordance as the 2D zoom view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Launch animation: scale + fade from the hero frame rectangle to a
  // fullscreen viewer. Runs once on mount; cleans up via
  // gsap.context().revert() so unmounting mid-animation doesn't leak.
  // Skipped when originRect is not provided OR the visitor opted out
  // of motion.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!originRect || prefersReducedMotion()) return;

    const vw =
      typeof window === "undefined" ? originRect.width : window.innerWidth;
    const vh =
      typeof window === "undefined" ? originRect.height : window.innerHeight;
    // Translate so the overlay's centre lines up with the hero
    // centre, then scale the (already-fullscreen) overlay down to
    // the hero rectangle. GSAP animates back to identity for the
    // expand.
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
          duration: 0.75,
          ease: "power3.out",
        },
      );
    }, overlay);

    return () => {
      ctx.revert();
    };
  }, [originRect]);

  return (
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1100] bg-background/95 backdrop-blur-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — 3D view`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/30">
          <p className="font-display text-lg sm:text-xl text-foreground">
            {title}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setResetKey((k) => k + 1)}
              className="p-2 rounded-sm hover:bg-accent/40 transition-colors"
              aria-label="Reset camera"
              title="Reset view"
            >
              <RotateCcw className="w-4 h-4 text-foreground" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-sm hover:bg-accent/40 transition-colors"
              aria-label="Close 3D view"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <Canvas
              key={resetKey}
              camera={{ position: [0, 0, 5.5], fov: 35 }}
              dpr={[1, 2]}
              shadows
              gl={{ antialias: true, alpha: true }}
            >
              {/* Three-point-ish lighting. Key light from upper right,
                  fill from the left, soft ambient floor. No HDRI env
                  to keep the bundle small. */}
              <ambientLight intensity={0.55} />
              <directionalLight
                position={[3, 4, 5]}
                intensity={1.4}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
              />
              <directionalLight position={[-4, 2, 2]} intensity={0.5} />

              <PaintingPlane imageUrl={imageUrl} />

              <OrbitControls
                enablePan={false}
                enableZoom
                minDistance={3}
                maxDistance={10}
                autoRotate={autoRotate}
                autoRotateSpeed={0.6}
                makeDefault
              />
            </Canvas>
          </Suspense>

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground pointer-events-none select-none">
            Drag to rotate · pinch / scroll to zoom
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
