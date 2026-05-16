import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";

/**
 * Shared three.js mesh used by both:
 *
 *   - `<PaintingViewer3D />`  : full-screen modal viewer launched from
 *                                the product / hero pages.
 *   - `<WallPainting3D />`   : inline auto-rotating viewer that sits on
 *                                the homepage `<WallScene />`.
 *
 * The geometry deliberately matches the real-world canvas size that
 * the studio paints onto (24" × 36") so what the customer sees on the
 * screen reflects what they'll receive — a thin painting plane held
 * inside a beveled wood frame. No HDRI env, no post-processing — the
 * lighting + textures are driven by the parent `<Canvas>` so this
 * module only owns the geometry / materials.
 */

// Canvhub paintings are made to order on a standard 24" × 36" canvas
// (60.96 × 91.44 cm). Orientation follows the source photo: landscape
// images get a 36 × 24 canvas, portrait images get a 24 × 36 canvas.
// The customer's photo is UV-mapped onto the front face — modest
// stretch is expected and acceptable since the real-world painting
// will be repainted to fit the standard size anyway.
const CANVAS_LONG_IN = 36;
const CANVAS_SHORT_IN = 24;
const CANVAS_SHORT_TO_LONG = CANVAS_SHORT_IN / CANVAS_LONG_IN;

interface PaintingPlaneProps {
  imageUrl: string;
}

export function PaintingPlane({ imageUrl }: PaintingPlaneProps) {
  const texture = useLoader(TextureLoader, imageUrl);
  // Use the source image's aspect only to pick orientation
  // (landscape vs portrait); the canvas dimensions themselves are
  // fixed at 24×36 inches.
  const isLandscape = useMemo(() => {
    const w = texture.image?.naturalWidth || texture.image?.width || 4;
    const h = texture.image?.naturalHeight || texture.image?.height || 3;
    return w >= h;
  }, [texture]);

  // Pick the long side as 4 world units so the initial camera framing
  // still fits comfortably. The short side falls out at 4 * 24/36
  // ≈ 2.667. Canvas thickness is ~3 cm in real life; map that to a
  // visible 0.05 world units so the side of the canvas shows when the
  // customer rotates the painting.
  const longSide = 4;
  const shortSide = longSide * CANVAS_SHORT_TO_LONG;
  const width = isLandscape ? longSide : shortSide;
  const height = isLandscape ? shortSide : longSide;
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

export function Frame({ width, height, thickness, depth }: FrameProps) {
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
