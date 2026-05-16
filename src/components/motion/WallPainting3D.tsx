import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { TOUCH } from "three";
import { Loader2 } from "lucide-react";
import { PaintingPlane } from "@/components/painting3d/PaintingMesh";

/**
 * `<WallPainting3D />` — the inline auto-rotating Three.js viewer that
 * sits inside `<WallScene />`. Shares the painting + wood-frame mesh
 * with the full-screen `<PaintingViewer3D />` modal (via
 * `@/components/painting3d/PaintingMesh`) so the canvas reads as the
 * same physical piece in both contexts.
 *
 * Compared to the modal viewer this one is "lightly interactive":
 *
 *   - The painting still auto-rotates as a decorative element, but
 *     visitors can now **pinch (mobile) / scroll-wheel (desktop) to
 *     zoom** the camera in and out within the same min/max bounds the
 *     product-page modal uses.
 *   - Single-finger drag still passes through to the page: the wrapper
 *     uses `touch-action: pan-y` and `OrbitControls.enableRotate` is
 *     off, so a one-finger vertical drag early-returns from
 *     OrbitControls' touch handler without `preventDefault`, leaving
 *     the browser free to scroll the page natively. The visitor never
 *     gets stuck "inside" the canvas trying to scroll past the wall.
 *   - Pan is off so the camera always stays centred on the painting —
 *     pinch zooms straight in/out instead of letting the visitor drag
 *     the artwork out of frame.
 *   - No modal chrome (no header, no Reset / Close buttons). A tiny
 *     bottom-centred hint label tells the visitor the zoom affordance
 *     is there.
 *   - Honours `prefers-reduced-motion`: opted-out visitors see a
 *     stationary painting, not a perpetually rotating one. They can
 *     still pinch / scroll to zoom.
 *
 * Three.js / r3f / drei are heavy (~120 KB gzipped); this component is
 * lazy-imported by `<WallScene />` so the bundle only ships when the
 * homepage is actually rendered.
 */

interface WallPainting3DProps {
  imageUrl: string;
}

const WallPainting3D = ({ imageUrl }: WallPainting3DProps) => {
  // Honour `prefers-reduced-motion`. Read once at first render via
  // useState's initializer — doing this in an effect would force a
  // second render and could briefly auto-rotate before the opt-out
  // applied.
  const [autoRotate] = useState(() => {
    if (typeof window === "undefined") return true;
    if (typeof window.matchMedia !== "function") return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  return (
    // `touch-pan-y` (= `touch-action: pan-y`) lets the browser keep
    // scrolling the page on single-finger vertical drags — the canvas
    // never claims the gesture, so visitors don't get stuck swiping
    // inside the wall trying to scroll past it. Two-finger pinches
    // still reach the JS layer because `pan-y` only opts in to native
    // vertical panning; every other gesture is left for JS, and
    // OrbitControls' `touches.TWO=DOLLY_PAN` picks them up to dolly
    // the camera (with `enablePan=false` only the dolly half runs, so
    // the camera stays centred on the painting).
    <div className="absolute inset-0 touch-pan-y">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2
              className="w-6 h-6 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        }
      >
        <Canvas
          camera={{ position: [0, 0, 5.5], fov: 35 }}
          dpr={[1, 2]}
          shadows
          gl={{ antialias: true, alpha: true }}
        >
          {/* Same three-point-ish lighting as the modal viewer so the
              painting reads identically in both contexts. */}
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

          {/* `enableZoom` + `enablePan=false` + `enableRotate=false`
              gives a "zoom-only" interaction model. Auto-rotation
              still runs as decoration whenever OrbitControls is idle
              (the auto-rotate tick pauses while the visitor is
              actively pinching, then resumes from the new angle).
              `minDistance` / `maxDistance` match the product-page
              modal viewer so the zoom range feels consistent across
              the two contexts.

              `touches.ONE = TOUCH.ROTATE` is OrbitControls' default —
              kept explicit here so future readers see exactly why
              single-finger drags don't do anything. Combined with
              `enableRotate=false` above, the touch handler hits the
              `case TOUCH.ROTATE` branch and early-returns without
              calling `preventDefault`, leaving the browser free to
              handle the gesture as a native vertical scroll thanks
              to `touch-action: pan-y` on the wrapper. */}
          <OrbitControls
            enableZoom
            enablePan={false}
            enableRotate={false}
            minDistance={3}
            maxDistance={10}
            autoRotate={autoRotate}
            autoRotateSpeed={0.6}
            touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
            makeDefault
          />
        </Canvas>
      </Suspense>

      {/* Visible affordance — same wording the product page's modal
          viewer uses, so the gesture is consistent across both
          contexts. `pointer-events-none` keeps the hint from blocking
          any touches that should reach the canvas underneath. */}
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 select-none font-body text-[9px] uppercase tracking-[0.3em] text-muted-foreground/70">
        Pinch · scroll to zoom
      </p>
    </div>
  );
};

export default WallPainting3D;
