import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Loader2 } from "lucide-react";
import { PaintingPlane } from "@/components/painting3d/PaintingMesh";

/**
 * `<WallPainting3D />` — the inline auto-rotating Three.js viewer that
 * sits inside `<WallScene />`. Shares the painting + wood-frame mesh
 * with the full-screen `<PaintingViewer3D />` modal (via
 * `@/components/painting3d/PaintingMesh`) so the canvas reads as the
 * same physical piece in both contexts.
 *
 * Differences from the modal viewer:
 *
 *   - No modal chrome (no header, no Reset / Close buttons).
 *   - No interactive controls — `pointer-events: none` so vertical
 *     scrolling, taps and page clicks pass through to the page
 *     instead of being captured by `OrbitControls`. The painting just
 *     auto-rotates as a decorative element.
 *   - Honours `prefers-reduced-motion`: opted-out visitors see a
 *     stationary painting, not a perpetually rotating one.
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
    // `pointer-events-none` ensures vertical scroll / taps pass through
    // to the page — the painting is a decorative auto-rotating element,
    // not an interactive control. The product-page modal viewer is
    // still available for visitors who want to drag / zoom.
    <div className="pointer-events-none absolute inset-0">
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

          {/* OrbitControls drives the auto-rotation. Manual rotate /
              pan / zoom are all disabled so even if a stray pointer
              event slipped past the wrapper's `pointer-events: none`
              the visitor couldn't accidentally throw the painting out
              of frame. `autoRotate` is independent of `enableRotate`
              in three.js OrbitControls and runs during the render
              tick regardless. */}
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableRotate={false}
            autoRotate={autoRotate}
            autoRotateSpeed={0.6}
            makeDefault
          />
        </Canvas>
      </Suspense>
    </div>
  );
};

export default WallPainting3D;
