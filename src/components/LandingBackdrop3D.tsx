import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, MathUtils } from "three";
import type { Group, Mesh, Points as PointsType } from "three";

// Drei's <Points /> + <PointMaterial /> are the simplest way to ship
// a particle field without hand-rolling a BufferGeometry / sprite
// shader. Lazy-pulled so this component pays for them only when
// actually mounted (desktop + fine-pointer, see <LandingBackdrop3D />
// gate below).
const DreiPoints = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.Points })),
);
const DreiPointMaterial = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.PointMaterial })),
);

// --- Tunables ------------------------------------------------------
// Particles are deliberately under-budgeted relative to a typical
// "Three.js starfield" demo (which often ships 3–10k points) — the
// scene is purely chrome behind the gallery content, so anything
// more is wasted GPU.
const PARTICLE_COUNT = 420;
const PARTICLE_RADIUS = 9;
const GOLD = new Color("#c9a25f");

// Wireframe icosahedron sits in the deep background ahead of the
// particle shell so scroll-driven camera dolly reads as "passing
// through" the mesh.
const MESH_DETAIL = 1;
const MESH_RADIUS = 5.4;

interface SceneProps {
  reduced: boolean;
}

function generateParticlePositions(): Float32Array {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Sphere-shell distribution so depth reads as a halo rather
    // than a flat scatter. Vertical squash matches the existing
    // HeroParticles aesthetic (this scene runs site-wide so visual
    // continuity matters).
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = PARTICLE_RADIUS * (0.5 + Math.random() * 0.5);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function Scene({ reduced }: SceneProps) {
  const particlesRef = useRef<PointsType>(null);
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const positions = useMemo(() => generateParticlePositions(), []);

  // Mutable scroll progress (0..1). Updated from a window listener
  // so we don't tax React with state changes every scroll event.
  const scrollProgressRef = useRef(0);

  useEffect(() => {
    const compute = () => {
      const max = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      scrollProgressRef.current = MathUtils.clamp(window.scrollY / max, 0, 1);
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  // Camera dolly — z=8 at top, z=2.4 deep in the page. Combined with
  // the particle shell radius of 9 this gives the "passing through
  // a gold halo" feel without ever clipping into the wireframe core.
  // Tweens via lerp so the move is buttery even when scroll jumps.
  // Camera is read via the per-frame `state` arg (not `useThree()`)
  // so the eslint hook-immutability rule doesn't fire on the
  // intentional Vector3 mutations below — R3F state is a per-frame
  // snapshot, not a hook return value.
  useFrame((state, delta) => {
    const cam = state.camera;
    const t = scrollProgressRef.current;
    const targetZ = 8 - t * 5.6;
    cam.position.setZ(MathUtils.lerp(cam.position.z, targetZ, 0.08));
    // Subtle vertical drift so the world doesn't read as completely
    // static when scroll is paused.
    cam.position.setY(MathUtils.lerp(cam.position.y, t * -1.4, 0.08));
    cam.lookAt(0, 0, 0);

    if (reduced) {
      // Reduced-motion users still get the depth-by-camera effect
      // above (it's tied to deliberate scroll input, not ambient
      // motion) but we skip the autonomous rotations / breathing
      // pulse on the inner geometry so nothing animates on its own.
      return;
    }

    const group = groupRef.current;
    if (group) {
      // Ambient rotation independent of scroll. ~0.015 rad/s on Y
      // makes the field feel alive but never distracts from copy.
      group.rotation.y += delta * 0.015;
      group.rotation.x += delta * 0.004;
    }
    const mesh = meshRef.current;
    if (mesh) {
      // Counter-rotate the wireframe so the two layers don't lock
      // visually as a single rigid body.
      mesh.rotation.y -= delta * 0.025;
      mesh.rotation.z += delta * 0.01;
      // Scroll-driven scale pulse — peaks past mid-page so visitors
      // see the mesh "breathe" when reading the editorial blocks
      // (About / Reviews) rather than the hero.
      const pulse = 1 + Math.sin(t * Math.PI) * 0.06;
      mesh.scale.setScalar(pulse);
    }
    // Keep `particlesRef` in the dep graph so React doesn't strip the
    // ref assignment under aggressive minification. The Points object
    // is otherwise read indirectly via `groupRef` (its parent).
    void particlesRef.current;
  });

  return (
    <group ref={groupRef}>
      {/* Soft warm ambient — the gold particles still read against
          the dark background without any explicit light, but a
          touch of fill keeps the wireframe from going black. */}
      <ambientLight intensity={0.35} />
      <Suspense fallback={null}>
        <DreiPoints positions={positions} ref={particlesRef} stride={3}>
          <DreiPointMaterial
            transparent
            color={GOLD}
            size={0.038}
            sizeAttenuation
            depthWrite={false}
            blending={AdditiveBlending}
            opacity={0.7}
          />
        </DreiPoints>
      </Suspense>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[MESH_RADIUS, MESH_DETAIL]} />
        <meshBasicMaterial
          color={GOLD}
          wireframe
          transparent
          opacity={0.18}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// --- Public component ---------------------------------------------

/**
 * `<LandingBackdrop3D />` — a fixed, full-viewport Three.js scene
 * rendered behind the homepage content. Provides the "3D depth"
 * feeling Mario asked for: as the visitor scrolls, the camera
 * dollies forward through a gold particle halo and a slowly
 * rotating wireframe icosahedron sitting at the centre of the
 * scene.
 *
 * Constraints honoured:
 * - The Canvhub logo / wordmark sit in DOM siblings above this
 *   element; the backdrop never touches them and applies no 3D
 *   distortion to text.
 * - Coarse-pointer / narrow-viewport visitors get a pure CSS
 *   radial-gradient fallback instead of the WebGL canvas — keeps
 *   the average Philippine mobile customer's data plan happy and
 *   matches the `Hero3D` gating used in `HomeHero`.
 * - `prefers-reduced-motion: reduce` mounts the scene but suppresses
 *   the per-frame rotation, so the backdrop is still visible but
 *   visually static.
 * - DPR clamped to `[1, 1.5]` so retina laptops don't render at 3x.
 * - Auto-paused via the browser when the tab is hidden (R3F's
 *   default loop pauses with `requestAnimationFrame`).
 */
export default function LandingBackdrop3D() {
  const [enabled, setEnabled] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const desktop = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setEnabled(desktop.matches);
      setReduced(reduceMq.matches);
    };
    update();
    desktop.addEventListener("change", update);
    reduceMq.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      reduceMq.removeEventListener("change", update);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      data-testid="landing-backdrop-3d"
    >
      {/* CSS fallback — also visible *behind* the canvas as a safety
          net while the three.js chunk is still downloading on the
          desktop path, so the page never flashes a hard background. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,95,0.10),transparent_60%),radial-gradient(circle_at_80%_85%,rgba(58,38,24,0.18),transparent_55%)]" />
      {enabled && (
        <Canvas
          camera={{ position: [0, 0, 8], fov: 50 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
          }}
          className="!absolute !inset-0"
        >
          <Suspense fallback={null}>
            <Scene reduced={reduced} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
