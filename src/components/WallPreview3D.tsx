import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { TextureLoader } from "three";
import {
  X,
  Loader2,
  RotateCcw,
  Copy,
  Check,
  Ruler,
  Users,
  UserMinus,
  ShoppingBag,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  SIZE_PRESETS,
  type SizePreset,
  type PaintingSizeCm,
  formatSize,
  formatSizeInches,
  defaultPresetFor,
} from "@/lib/painting-sizes";

// WallPreview3D — "View on your wall" for made-to-order paintings.
//
// Canvhub paints to order, so the size IS part of the order. This
// modal lets the customer pick a size from a small preset palette
// (S/M/L/XL/XXL) and see the painting hanging on a virtual wall at
// real-world scale, with a 1.7m human silhouette next to it for
// "is that the right size for my hallway?" comparison.
//
// World units are metres so the silhouette and painting share an
// honest coordinate system. The wall is 4m wide × 3m tall — wide
// enough to comfortably frame the largest XXL canvas (1.2m × 1.6m)
// without clipping the edges.
//
// The ~120 KB gz three.js + r3f + drei runtime is shared with the
// existing PaintingViewer3D, so a customer who's already opened the
// 3D viewer pays no additional bundle cost when opening this one.
//
// Native AR (model-viewer + .glb / .usdz Quick Look) is intentionally
// deferred to a follow-up — generating per-product GLB dynamically
// in Cloudflare Workers needs its own pipeline and that's a larger
// architectural decision than this preview-only PR is scoped for.

interface WallPreview3DProps {
  imageUrl: string;
  title: string;
  dimensions?: string;
  onClose: () => void;
  /**
   * Pre-select a size in the preset palette — used when the modal is
   * re-opened from the product page to edit a size already on a cart
   * line. When omitted the modal falls through to `defaultPresetFor`
   * with the product's free-form dimensions hint.
   */
  initialSizeCm?: PaintingSizeCm;
  /**
   * Optional confirm-and-add-to-cart callback. When provided, the
   * panel renders a primary "Add to cart at this size" button next to
   * the existing "Copy for checkout notes" affordance and invokes
   * this with the picked size. The modal closes on confirm so the
   * cart drawer can take over.
   */
  onConfirmSize?: (size: PaintingSizeCm) => void;
  /** Label override for the confirm button (e.g. "Update size"). */
  confirmLabel?: string;
}

const CM_PER_M = 100;
const HUMAN_HEIGHT_M = 1.7;

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
  const aspect = useMemo(() => {
    const w = texture.image?.naturalWidth || texture.image?.width || 4;
    const h = texture.image?.naturalHeight || texture.image?.height || 3;
    return w / h;
  }, [texture]);

  // The customer picked a *canvas* size (e.g. 60×90 cm), but the
  // painting's natural aspect ratio may not match that frame. Letterbox
  // the painted region inside the canvas so the artwork is never
  // squished, and the surrounding canvas shows the unpainted neutral
  // off-white you'd see on the side of a real stretched canvas.
  const frameAspect = widthM / heightM;
  let paintedW = widthM;
  let paintedH = heightM;
  if (aspect > frameAspect) {
    paintedH = widthM / aspect;
  } else {
    paintedW = heightM * aspect;
  }

  const canvasDepth = 0.04;
  const frameThicknessM = 0.04;
  const frameDepthM = 0.05;

  return (
    <group position={[0, PAINTING_CENTRE_Y_M, 0]}>
      {/* Stretched canvas backing — neutral off-white, slightly
          thicker than the painted layer so the side of the canvas
          shows when the customer rotates the view. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[widthM, heightM, canvasDepth]} />
        <meshStandardMaterial color="#f5f3ee" roughness={0.85} />
      </mesh>

      {/* Painted region — sits a hair proud of the canvas so there's
          no z-fight, and inherits the painting's natural aspect. */}
      <mesh position={[0, 0, canvasDepth / 2 + 0.001]}>
        <planeGeometry args={[paintedW, paintedH]} />
        <meshStandardMaterial map={texture} roughness={0.7} metalness={0} />
      </mesh>

      {/* Slim dark frame, kept understated so the customer's eye
          stays on the painting. Four box rails, same trick as
          PaintingViewer3D's frame. */}
      <Frame
        width={widthM}
        height={heightM}
        thickness={frameThicknessM}
        depth={frameDepthM}
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
  const woodColor = "#2a1d12";

  return (
    <group position={[0, 0, depth / 2]}>
      <mesh position={[0, halfH + thickness / 2, 0]} castShadow>
        <boxGeometry args={[railLength(width), thickness, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[0, -halfH - thickness / 2, 0]} castShadow>
        <boxGeometry args={[railLength(width), thickness, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[-halfW - thickness / 2, 0, 0]} castShadow>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[halfW + thickness / 2, 0, 0]} castShadow>
        <boxGeometry args={[thickness, height, depth]} />
        <meshStandardMaterial
          color={woodColor}
          roughness={0.55}
          metalness={0.05}
        />
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

export default function WallPreview3D({
  imageUrl,
  title,
  dimensions,
  onClose,
  initialSizeCm,
  onConfirmSize,
  confirmLabel,
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
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<SizePreset>(() => {
    if (initialSizeCm) {
      const matching = SIZE_PRESETS.find(
        (p) =>
          p.widthCm === initialSizeCm.widthCm &&
          p.heightCm === initialSizeCm.heightCm,
      );
      if (matching) return matching;
    }
    return defaultPresetFor(dimensions);
  });

  const widthM = selected.widthCm / CM_PER_M;
  const heightM = selected.heightCm / CM_PER_M;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copySize = useCallback(() => {
    const text = `Size: ${formatSize(selected)} (${formatSizeInches(selected)})`;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("Clipboard not available — please type the size manually.");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        toast.success("Size copied — paste it into your checkout notes.");
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error("Couldn't copy — please type the size manually.");
      });
  }, [selected]);

  // Frame the painting tightly: camera distance scales with the
  // painting's longest edge so XXL doesn't clip and S isn't lost
  // in the middle of a vast wall.
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
              View on your wall · made to order
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

        <div className="border-t border-border/30 p-4 sm:p-5 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              Pick your size — painted to order
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SIZE_PRESETS.map((preset) => {
              const isActive =
                preset.widthCm === selected.widthCm &&
                preset.heightCm === selected.heightCm;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setSelected(preset)}
                  aria-pressed={isActive}
                  className={
                    "flex flex-col items-center justify-center px-4 py-2.5 rounded-sm border transition-colors min-w-[80px] " +
                    (isActive
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background/60 text-foreground border-border/60 hover:bg-accent/30")
                  }
                >
                  <span className="font-display text-sm leading-none">
                    {preset.label}
                  </span>
                  <span className="font-body text-[10px] tracking-wider mt-1 opacity-80">
                    {preset.caption}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="font-body text-xs sm:text-sm text-muted-foreground">
              Selected:{" "}
              <span className="text-foreground">{formatSize(selected)}</span>{" "}
              <span className="opacity-60">({formatSizeInches(selected)})</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2 self-start sm:self-auto">
              {onConfirmSize ? (
                <button
                  type="button"
                  onClick={() => {
                    onConfirmSize({
                      widthCm: selected.widthCm,
                      heightCm: selected.heightCm,
                    });
                    onClose();
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-[10px] tracking-[0.25em] uppercase"
                >
                  <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                  {confirmLabel ?? "Add to cart at this size"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={copySize}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-sm border border-border/60 hover:bg-accent/30 font-body text-[10px] tracking-[0.25em] uppercase text-foreground"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied" : "Copy for checkout notes"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
