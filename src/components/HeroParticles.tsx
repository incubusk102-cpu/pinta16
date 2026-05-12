import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import { AdditiveBlending, Color, type Points as PointsType } from "three";

// Lazy-loaded WebGL particle field rendered inside the existing
// `Hero3D` `<Canvas>`. ~600 small additive-blended points drifting
// slowly behind the framed painting, tinted brand-gold so the field
// reads as "stardust around the artwork" rather than a generic
// space scene. Mounted only when `Hero3D` itself is mounted, which
// is desktop / fine-pointer only — so this never ships to mobile.
//
// Honours `prefers-reduced-motion` via a `reduced` prop fed from the
// parent: when set, the field still renders so the hero has visual
// weight, but the per-frame rotation is suppressed.

const COUNT = 600;
const RADIUS = 6;
const GOLD = new Color("#c9a25f");

function generatePositions(): Float32Array {
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    // Sphere-shell distribution so the field reads as depth rather
    // than a flat scatter. Outer shell radius nudged inward at the
    // poles so we don't crowd the wordmark area.
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = RADIUS * (0.6 + Math.random() * 0.4);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

interface HeroParticlesProps {
  reduced: boolean;
}

export default function HeroParticles({ reduced }: HeroParticlesProps) {
  const ref = useRef<PointsType>(null);
  const positions = useMemo(() => generatePositions(), []);

  useFrame((_state, delta) => {
    if (reduced) return;
    const group = ref.current;
    if (!group) return;
    group.rotation.y += delta * 0.018;
    group.rotation.x += delta * 0.006;
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled>
      <PointMaterial
        transparent
        color={GOLD}
        size={0.045}
        sizeAttenuation
        depthWrite={false}
        blending={AdditiveBlending}
        opacity={0.85}
      />
    </Points>
  );
}
