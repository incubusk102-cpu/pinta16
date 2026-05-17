import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Loader2 } from "lucide-react";
import { PaintingPlane } from "@/components/painting3d/PaintingMesh";

/**
 * `<WallPainting3D />` — the inline Three.js viewer that sits inside
 * `<WallScene />`. Shares the painting + wood-frame mesh with the
 * full-screen `<PaintingViewer3D />` modal (via
 * `@/components/painting3d/PaintingMesh`) so the canvas reads as the
 * same physical piece in both contexts.
 *
 * On the homepage the painting is intentionally **non-interactive**:
 *
 *   - No auto-rotation. The painting holds the same angle the camera
 *     sees on first paint, so visitors don't see it drift to an angle
 *     they cannot manually restore.
 *   - No rotation, pan, or zoom controls. The wrapper still carries
 *     `touch-action: pan-y` so single-finger vertical drags scroll the
 *     page natively without getting captured by the canvas.
 *   - No affordance hint label — there's nothing to interact with, so
 *     no "pinch / scroll to zoom" copy is shown.
 *
 * Visitors who want the full interactive viewer can launch the
 * product-page `<PaintingViewer3D />` modal from any artwork card.
 *
 * Three.js / r3f / drei are heavy (~120 KB gzipped); this component is
 * lazy-imported by `<WallScene />` so the bundle only ships when the
 * homepage is actually rendered.
 */

interface WallPainting3DProps {
  imageUrl: string;
}

const WallPainting3D = ({ imageUrl }: WallPainting3DProps) => {
  return (
    // `touch-pan-y` (= `touch-action: pan-y`) lets the browser keep
    // scrolling the page on single-finger vertical drags — the canvas
    // never claims the gesture, so visitors don't get stuck swiping
    // inside the wall trying to scroll past it. With rotation, pan,
    // and zoom all disabled below, the canvas reads as a static
    // painting; the `pan-y` opt-in is kept defensively so any browser
    // that would still try to consume the gesture defers to the page.
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
          // Initial camera position is tuned so the painting + wood
          // frame fills the square wall box almost edge-to-edge, with
          // only a sliver of breathing room around it. This matters
          // for the handoff with `<TravelingDailyPainting />`: the
          // flying proxy is a 2D `<img>` that's `object-cover`-fitted
          // into the same `[data-wall-target]` square, so it visually
          // fills the box. Crossfading the proxy into a 3D painting
          // that's significantly smaller would read as the painting
          // "shrinking on arrival" — pulling the camera in to z=7
          // makes the 3D painting land at roughly the same on-screen
          // size as the 2D proxy, so the handoff is positionally and
          // proportionally seamless. The 4-unit-tall painting + 0.18
          // frame at fov=35, z=7 yields a visible height of
          // 2·7·tan(17.5°) ≈ 4.41 world units — just enough to fit
          // the 4.36-unit painting+frame without clipping.
          //
          // The product-page modal viewer (which lives at z=5.5) is
          // not adjusted here — its canvas is the visitor's whole
          // viewport (usually landscape), so the same mesh has more
          // horizontal world-space to spread into and a closer camera
          // is fine. The wall scene is constrained to `aspect-square`
          // so we need slightly more distance to fit the long edge.
          camera={{ position: [0, 0, 7], fov: 35 }}
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

          {/* No `<OrbitControls />`. With rotation, pan, zoom, and
              auto-rotation all intentionally disabled there is no
              control surface to mount — the camera stays at the
              position declared above, so the painting always lands
              centred and at its actual framed size as the visitor
              scrolls the wall scene into view. */}
        </Canvas>
      </Suspense>
    </div>
  );
};

export default WallPainting3D;
