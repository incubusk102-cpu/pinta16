import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment } from "@react-three/drei";
import {
  CanvasTexture,
  Group,
  MathUtils,
  RepeatWrapping,
  Vector2,
} from "three";

// Editorial 3D sculpture for the new homepage hero. The brand monogram
// "C" is built from a partial torus, sculpted with a procedural noise
// texture so it reads as moss-on-stone. A small low-poly kingfisher
// perches on the top arc and a few grass blades / wildflowers spring
// from the base. The whole composition sits inside a `<Float>` for a
// gentle ambient bob and reacts subtly to the cursor.
//
// We intentionally avoid downloading any textures at runtime — every
// material in this scene is procedural so the hero renders on the
// first frame the chunk lands, even on slow connections.

// ── Procedural textures ────────────────────────────────────────────

/**
 * Builds a CanvasTexture of soft noise. Used as both a bump map (for
 * the stone "C") and a colour map (for the moss patches).
 */
const makeNoiseTexture = (size: number, seed: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);
  const img = ctx.createImageData(size, size);
  // Mulberry32 — tiny deterministic PRNG so the texture is stable
  // across re-renders (otherwise the bumps would re-roll every mount).
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // A second low-frequency pass mottles the noise so the bumps cluster
  // rather than reading as static.
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "#888";
  for (let i = 0; i < 36; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 12 + rand() * 36;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
};

// ── Composition ────────────────────────────────────────────────────

interface SculptureGroupProps {
  pointer: React.MutableRefObject<Vector2>;
}

function MonogramC({ pointer }: SculptureGroupProps) {
  const groupRef = useRef<Group>(null);
  const bumpMap = useMemo(() => makeNoiseTexture(256, 42), []);
  const mossMap = useMemo(() => makeNoiseTexture(256, 137), []);

  // Subtle mouse-follow parallax — the whole sculpture tilts a few
  // degrees toward the cursor while staying within a tight envelope so
  // the wordmark behind it never goes out of alignment.
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const targetX = -pointer.current.y * 0.08;
    const targetY = pointer.current.x * 0.14;
    groupRef.current.rotation.x = MathUtils.damp(
      groupRef.current.rotation.x,
      targetX,
      4,
      dt,
    );
    groupRef.current.rotation.y = MathUtils.damp(
      groupRef.current.rotation.y,
      targetY,
      4,
      dt,
    );
  });

  return (
    <group ref={groupRef}>
      {/* The "C": a 270° torus arc rotated to face the camera. Heavy
          tessellation so the procedural bump map reads as carved
          stone rather than smooth plastic. */}
      <mesh rotation={[0, 0, Math.PI * 0.05]} castShadow receiveShadow>
        <torusGeometry args={[1.4, 0.42, 64, 220, Math.PI * 1.5]} />
        <meshStandardMaterial
          color="#cab896"
          roughness={0.92}
          metalness={0.04}
          bumpMap={bumpMap}
          bumpScale={0.18}
        />
      </mesh>

      {/* Moss collar — a slimmer torus arc draped over the upper half
          of the "C", deep green with the noise map sampled as its
          colour for a clumpy organic surface. */}
      <mesh
        rotation={[0, 0, Math.PI * 0.05]}
        position={[0, 0, 0.06]}
        scale={[1.02, 1.02, 0.4]}
      >
        <torusGeometry args={[1.42, 0.36, 48, 160, Math.PI * 0.9]} />
        <meshStandardMaterial
          color="#506b3a"
          roughness={1}
          metalness={0}
          map={mossMap}
        />
      </mesh>

      {/* Mossy crown — bumpy patch glued to the top arc where the
          kingfisher perches. Slightly emissive so it reads under the
          bloom pass. */}
      <mesh position={[-0.95, 1.05, 0.12]} rotation={[0, 0, 0.6]}>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial
          color="#4a6b3a"
          roughness={1}
          metalness={0}
          bumpMap={bumpMap}
          bumpScale={0.35}
        />
      </mesh>

      {/* Kingfisher — low-poly four-piece bird (body, head, beak,
          tail). Bright cobalt + brand-orange so it pops against the
          warm stone. */}
      <group position={[-0.92, 1.45, 0.18]} rotation={[0, 0.4, 0]} scale={0.78}>
        <mesh castShadow>
          <sphereGeometry args={[0.18, 24, 18]} />
          <meshStandardMaterial color="#1e5fae" roughness={0.55} />
        </mesh>
        <mesh position={[0.18, 0.08, 0]} castShadow>
          <sphereGeometry args={[0.11, 20, 16]} />
          <meshStandardMaterial color="#2a72c7" roughness={0.55} />
        </mesh>
        <mesh position={[0.22, -0.05, 0]}>
          <sphereGeometry args={[0.05, 12, 10]} />
          <meshStandardMaterial color="#d9853b" roughness={0.45} />
        </mesh>
        <mesh position={[0.3, 0.08, 0]} rotation={[0, 0, -0.2]}>
          <coneGeometry args={[0.03, 0.16, 12]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.6} />
        </mesh>
        <mesh position={[-0.15, -0.05, 0]} rotation={[0, 0, 0.4]}>
          <coneGeometry args={[0.08, 0.22, 12]} />
          <meshStandardMaterial color="#1e5fae" roughness={0.55} />
        </mesh>
      </group>

      {/* Grass + wildflowers at the base — a small spray emerging from
          behind / underneath the C. Built from a handful of stretched
          cones so it reads as foliage from any angle. */}
      <group position={[0.15, -1.55, 0.4]}>
        {[
          { x: -0.55, y: 0.0, z: 0.05, h: 0.6, rot: -0.18, color: "#7ea455" },
          { x: -0.35, y: -0.05, z: 0.0, h: 0.74, rot: -0.1, color: "#8eb55f" },
          {
            x: -0.12,
            y: -0.02,
            z: -0.05,
            h: 0.52,
            rot: 0.04,
            color: "#6e9248",
          },
          { x: 0.12, y: 0.0, z: 0.05, h: 0.82, rot: 0.06, color: "#9bc26b" },
          { x: 0.35, y: -0.04, z: 0.08, h: 0.6, rot: 0.18, color: "#7ea455" },
          { x: 0.55, y: -0.02, z: -0.08, h: 0.7, rot: 0.22, color: "#8eb55f" },
          { x: 0.75, y: 0.0, z: 0.02, h: 0.48, rot: 0.28, color: "#a5cf75" },
        ].map((blade, i) => (
          <mesh
            key={i}
            position={[blade.x, blade.y + blade.h / 2, blade.z]}
            rotation={[0, 0, blade.rot]}
            castShadow
          >
            <coneGeometry args={[0.05, blade.h, 10]} />
            <meshStandardMaterial color={blade.color} roughness={0.9} />
          </mesh>
        ))}
        {/* Daisy wildflowers — small spheres in cream / brand-gold. */}
        {[
          { x: -0.4, y: 0.55, z: 0.1, c: "#f4d97a" },
          { x: 0.05, y: 0.7, z: 0.05, c: "#f1f0e4" },
          { x: 0.55, y: 0.45, z: 0.0, c: "#f4d97a" },
        ].map((f, i) => (
          <mesh key={`flw-${i}`} position={[f.x, f.y, f.z]}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshStandardMaterial color={f.c} roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

interface FloemaSculpture3DProps {
  /** Optional callback that surfaces normalised pointer motion
   *  (`-1..1` on each axis, `(0,0)` at the centre) to the parent so
   *  the wordmark behind the canvas can parallax in sync. */
  onPointerMove?: (x: number, y: number) => void;
}

const FloemaSculpture3D = ({ onPointerMove }: FloemaSculpture3DProps) => {
  const pointer = useRef(new Vector2(0, 0));

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointer.current.set(nx, ny);
    onPointerMove?.(nx, ny);
  };
  const handlePointerLeave = () => {
    pointer.current.set(0, 0);
    onPointerMove?.(0, 0);
  };

  return (
    <Canvas
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.2, 6.2], fov: 28 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="!absolute inset-0"
    >
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[3.5, 4, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize={1024}
      />
      <directionalLight
        position={[-4, 2, 2]}
        intensity={0.45}
        color="#c9a05a"
      />
      <Environment preset="sunset" />
      <Float
        speed={0.9}
        rotationIntensity={0.12}
        floatIntensity={0.4}
        floatingRange={[-0.06, 0.06]}
      >
        <group scale={1.35}>
          <MonogramC pointer={pointer} />
        </group>
      </Float>
    </Canvas>
  );
};

export default FloemaSculpture3D;
