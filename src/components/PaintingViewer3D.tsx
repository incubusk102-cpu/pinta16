import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { TextureLoader } from "three";
import { X, Loader2, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// 3D framed-painting viewer for the product page. Lazy-loaded behind a
// "View in 3D" button so the three.js + r3f + drei runtime (~120 KB
// gzipped) only ships when a customer actually opens it. The scene is
// deliberately simple — a thin painting plane sandwiched in a beveled
// wood frame, soft three-point lighting, mouse/touch orbit. No env
// HDRI map (the asset alone would dwarf the bundle savings) and no
// post-processing.

interface PaintingViewer3DProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}

// Load the painting as a texture and stretch it across the front face
// of a thin canvas. Aspect ratio comes from the loaded texture itself
// — we don't need to parse the artwork's `dimensions` string (which
// is free-form like "60x40 cm") to get the right shape.
function PaintingPlane({ imageUrl }: { imageUrl: string }) {
  const texture = useLoader(TextureLoader, imageUrl);
  const aspect = useMemo(() => {
    const w = texture.image?.naturalWidth || texture.image?.width || 4;
    const h = texture.image?.naturalHeight || texture.image?.height || 3;
    return w / h;
  }, [texture]);

  // Pick the longer side as 4 world units so any aspect fits the
  // initial camera framing. Canvas thickness is ~3 cm in real life;
  // map that to a visible 0.05 world units so the side of the canvas
  // shows when the customer rotates the painting.
  const longSide = 4;
  const width = aspect >= 1 ? longSide : longSide * aspect;
  const height = aspect >= 1 ? longSide / aspect : longSide;
  const depth = 0.05;
  const frameThickness = 0.18;
  const frameDepth = 0.22;

  return (
    <group>
      {/* Painting (front-facing canvas). The texture sits on a thin
          box so the side edges are visible from raking angles. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        {/* Six materials — front uses the texture, the rest are a
            neutral canvas back/side. */}
        <meshStandardMaterial attach="material-0" color="#f5f3ee" />
        <meshStandardMaterial attach="material-1" color="#f5f3ee" />
        <meshStandardMaterial attach="material-2" color="#f5f3ee" />
        <meshStandardMaterial attach="material-3" color="#f5f3ee" />
        <meshStandardMaterial
          attach="material-4"
          map={texture}
          roughness={0.65}
          metalness={0}
        />
        <meshStandardMaterial attach="material-5" color="#1c1c1c" />
      </mesh>

      {/* Frame — four boxes hugging the painting on each side. Cheaper
          than ExtrudeGeometry, looks identical from typical viewing
          distance. Wood-tone matches the site's neutral palette. */}
      <Frame
        width={width}
        height={height}
        thickness={frameThickness}
        depth={frameDepth}
      />
    </group>
  );
}

interface FrameProps {
  width: number;
  height: number;
  thickness: number;
  depth: number;
}

function Frame({ width, height, thickness, depth }: FrameProps) {
  const halfW = width / 2;
  const halfH = height / 2;
  const railLength = (longest: number) => longest + thickness * 2;
  const woodColor = "#3a2618";

  return (
    <group>
      {/* Top rail */}
      <mesh position={[0, halfH + thickness / 2, 0]} castShadow>
        <boxGeometry args={[railLength(width), thickness, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      {/* Bottom rail */}
      <mesh position={[0, -halfH - thickness / 2, 0]} castShadow>
        <boxGeometry args={[railLength(width), thickness, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      {/* Left rail */}
      <mesh position={[-halfW - thickness / 2, 0, 0]} castShadow>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      {/* Right rail */}
      <mesh position={[halfW + thickness / 2, 0, 0]} castShadow>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

export default function PaintingViewer3D({
  imageUrl,
  title,
  onClose,
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

  // Esc closes the modal — same affordance as the 2D zoom view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
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
