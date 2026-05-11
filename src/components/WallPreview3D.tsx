import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { TextureLoader } from "three";
import { X, Loader2, RotateCcw, Users, UserMinus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// WallPreview3D — "View on your wall".
//
// Canvhub uploads two photos per painting: the artwork itself and a
// mockup with the painting in its real frame. This modal hangs that
// second photo on a virtual wall at roughly life-size, with a 1.7m
// human silhouette next to it for sense of scale. The frame and any
// matting are part of the uploaded mockup, so the scene deliberately
// renders the photo as a flat plane — no synthesised wooden border
// on top — to avoid duplicating the frame the customer already sees.
//
// World units are metres so the silhouette and painting share an
// honest coordinate system. The wall is 4m wide × 3m tall — wide
// enough to comfortably frame a sizeable mockup without clipping.
//
// The ~120 KB gz three.js + r3f + drei runtime is shared with the
// existing PaintingViewer3D, so a customer who's already opened the
// 3D viewer pays no additional bundle cost when opening this one.

interface WallPreview3DProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}

// Width of the painting on the wall, in metres. Tuned so a 4:3
// landscape mockup reads as a comfortably hangable piece next to the
// 1.7m human silhouette without looking either dinky or oversized.
const DEFAULT_WIDTH_M = 0.9;
const MIN_WIDTH_M = 0.4;
const MAX_WIDTH_M = 1.6;
const MIN_HEIGHT_M = 0.3;
const MAX_HEIGHT_M = 1.8;

// Y-position of the painting's centre, measured from the floor. A
// real gallery hangs the centre at roughly eye-level (~1.5m); we use
// that as a sensible default so the human silhouette and the painting
// share visual space.
const PAINTING_CENTRE_Y_M = 1.5;

interface PaintingOnWallProps {
  imageUrl: string;
  widthM: number;
  heightM: number;
}

function PaintingOnWall({ imageUrl, widthM, heightM }: PaintingOnWallProps) {
  const texture = useLoader(TextureLoader, imageUrl);

  return (
    <group position={[0, PAINTING_CENTRE_Y_M, 0]}>
      {/* The uploaded mockup is rendered as a single flat plane on
          the wall. The frame in the photo IS the frame on the wall —
          we deliberately do not draw a wooden border around it. */}
      <mesh position={[0, 0, 0.005]} castShadow receiveShadow>
        <planeGeometry args={[widthM, heightM]} />
        <meshStandardMaterial map={texture} roughness={0.7} metalness={0} />
      </mesh>
    </group>
  );
}

// Wall + floor backdrop. The wall is a warm off-white that flatters
// the painting without competing for attention; the floor is a flat
// matte grey that picks up just enough of the directional light to
// ground the scene.
function Backdrop() {
  return (
    <group>
      {/* Wall */}
      <mesh position={[0, 1.5, -0.05]} receiveShadow>
        <planeGeometry args={[6, 3]} />
        <meshStandardMaterial color="#ebe6dc" roughness={1} />
      </mesh>
      {/* Floor */}
      <mesh position={[0, 0, 1]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 4]} />
        <meshStandardMaterial color="#b8b1a4" roughness={1} />
      </mesh>
    </group>
  );
}

// Stylised human silhouette for scale. Three boxes (head / torso /
// legs) at honest proportions for a ~1.7m adult, placed to the left
// of the painting at touching distance. We deliberately don't model
// arms / feet — the goal is "is that the right size for a person to
// stand next to?", not a photoreal mannequin.
interface HumanScaleProps {
  show: boolean;
  paintingWidthM: number;
}

function HumanScale({ show, paintingWidthM }: HumanScaleProps) {
  if (!show) return null;
  const xOffset = -(paintingWidthM / 2 + 0.6);
  const torsoH = 0.6;
  const legH = 0.85;
  const headR = 0.11;
  return (
    <group position={[xOffset, 0, 0.3]}>
      {/* Legs */}
      <mesh position={[0, legH / 2, 0]} castShadow>
        <boxGeometry args={[0.32, legH, 0.18]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, legH + torsoH / 2, 0]} castShadow>
        <boxGeometry args={[0.4, torsoH, 0.22]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
      </mesh>
      {/* Head */}
      <mesh position={[0, legH + torsoH + headR + 0.02, 0]} castShadow>
        <sphereGeometry args={[headR, 16, 16]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
      </mesh>
    </group>
  );
}

// Probe the natural aspect ratio of the mockup image before mounting
// the three.js scene so we can size the wall plane to match the
// uploaded photo exactly. Falls back to 4:3 (landscape) for the brief
// window between mount and decode, which is the most common mockup
// shape and reads naturally for both portrait and landscape art.
function useImageAspect(imageUrl: string): number {
  const [aspect, setAspect] = useState<number>(4 / 3);

  useEffect(() => {
    if (typeof window === "undefined" || !imageUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) setAspect(w / h);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return aspect;
}

export default function WallPreview3D({
  imageUrl,
  title,
  onClose,
}: WallPreview3DProps) {
  // Honour `prefers-reduced-motion`: opt-outs get a fully manual
  // camera, no auto-rotation. Read once via useState's initializer
  // so we never animate before the opt-out applies.
  const [autoRotate] = useState(() => {
    if (typeof window === "undefined") return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const [resetKey, setResetKey] = useState(0);
  const [showHuman, setShowHuman] = useState(true);
  const aspect = useImageAspect(imageUrl);

  // Pick a comfortable wall-plane size from the image's own aspect
  // ratio. Landscape mockups widen up to MAX_WIDTH_M and clamp height;
  // portrait mockups clamp height first and let width fall out of it.
  const { widthM, heightM } = useMemo(() => {
    let w = DEFAULT_WIDTH_M;
    let h = DEFAULT_WIDTH_M / aspect;
    if (h > MAX_HEIGHT_M) {
      h = MAX_HEIGHT_M;
      w = h * aspect;
    }
    if (w > MAX_WIDTH_M) {
      w = MAX_WIDTH_M;
      h = w / aspect;
    }
    if (w < MIN_WIDTH_M) w = MIN_WIDTH_M;
    if (h < MIN_HEIGHT_M) h = MIN_HEIGHT_M;
    return { widthM: w, heightM: h };
  }, [aspect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Frame the painting tightly: camera distance scales with the
  // painting's longest edge so larger pieces don't clip and smaller
  // ones aren't lost in the middle of a vast wall.
  const cameraZ = Math.max(2.8, Math.max(widthM, heightM) * 2 + 1.4);
  const humanCaption = showHuman
    ? "Person shown is 1.7 m (5′7″) tall"
    : "Tap the person icon to show a 1.7 m silhouette for scale";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1100] bg-background/95 backdrop-blur-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — view on your wall`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/30">
          <div>
            <p className="font-display text-lg sm:text-xl text-foreground">
              {title}
            </p>
            <p className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground mt-0.5">
              View on your wall
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHuman((v) => !v)}
              className="p-2 rounded-sm hover:bg-accent/40 transition-colors"
              aria-label={
                showHuman ? "Hide person silhouette" : "Show person silhouette"
              }
              aria-pressed={showHuman}
              title={showHuman ? "Hide scale figure" : "Show scale figure"}
            >
              {showHuman ? (
                <Users className="w-4 h-4 text-foreground" />
              ) : (
                <UserMinus className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
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
              aria-label="Close wall preview"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative min-h-[280px]">
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <Canvas
              key={resetKey}
              camera={{ position: [0, 1.5, cameraZ], fov: 38 }}
              dpr={[1, 2]}
              shadows
              gl={{ antialias: true, alpha: true }}
            >
              {/* Soft three-point lighting. Key light from the upper
                  right mimics a gallery spot; the fill keeps the
                  painting readable from any orbit angle. */}
              <ambientLight intensity={0.55} />
              <directionalLight
                position={[3, 4, 4]}
                intensity={1.3}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
              />
              <directionalLight position={[-3, 2, 2]} intensity={0.4} />

              <Backdrop />
              <PaintingOnWall
                imageUrl={imageUrl}
                widthM={widthM}
                heightM={heightM}
              />
              <HumanScale show={showHuman} paintingWidthM={widthM} />

              <OrbitControls
                enablePan={false}
                enableZoom
                target={[0, 1.4, 0]}
                minDistance={1.5}
                maxDistance={8}
                minPolarAngle={Math.PI / 4}
                maxPolarAngle={Math.PI / 2.05}
                autoRotate={autoRotate}
                autoRotateSpeed={0.4}
                makeDefault
              />
            </Canvas>
          </Suspense>

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground pointer-events-none select-none px-3 text-center max-w-[90%]">
            {humanCaption}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
