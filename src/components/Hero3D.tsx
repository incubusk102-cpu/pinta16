import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { TextureLoader } from "three";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { Link } from "@tanstack/react-router";
import { useProducts } from "@/contexts/ProductContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";
import { variantSrc } from "@/lib/productImage";

// Lazy WebGL particle field rendered as a sibling of the framed
// painting inside the existing Canvas. Hero3D itself is already
// gated to desktop / fine-pointer via HomeHero's media query, so
// the additional cost only lands on visitors with hardware that can
// already absorb the three.js scene.
const HeroParticles = lazy(() => import("@/components/HeroParticles"));

// Cinematic 3D landing hero. Renders a framed painting drifting in
// space behind the Canvas Hub wordmark, lit with a warm three-point
// rig and a soft bloom. The painting cycles through the freshest
// pieces in the catalogue every few seconds so the homepage feels
// like a curated gallery wall rather than a static splash.
//
// Lazy-loaded from `routes/index.tsx`. The three.js + r3f + drei +
// postprocessing runtime lives in the `three` manual chunk shared
// with `PaintingViewer3D` on the product page, so visitors who land
// here and then click into a product pay the chunk cost once.

const FRAME_COLOR = "#3a2618";
const CANVAS_BACK = "#f5f3ee";
const CYCLE_MS = 7000;

interface FramedPaintingProps {
  imageUrl: string;
}

function FramedPainting({ imageUrl }: FramedPaintingProps) {
  const texture = useLoader(TextureLoader, imageUrl);
  const aspect = useMemo(() => {
    const w = texture.image?.naturalWidth || texture.image?.width || 4;
    const h = texture.image?.naturalHeight || texture.image?.height || 3;
    return w / h;
  }, [texture]);

  const longSide = 3.4;
  const width = aspect >= 1 ? longSide : longSide * aspect;
  const height = aspect >= 1 ? longSide / aspect : longSide;
  const depth = 0.06;
  const frameThickness = 0.16;
  const frameDepth = 0.22;
  const halfW = width / 2;
  const halfH = height / 2;

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial attach="material-0" color={CANVAS_BACK} />
        <meshStandardMaterial attach="material-1" color={CANVAS_BACK} />
        <meshStandardMaterial attach="material-2" color={CANVAS_BACK} />
        <meshStandardMaterial attach="material-3" color={CANVAS_BACK} />
        <meshStandardMaterial
          attach="material-4"
          map={texture}
          roughness={0.62}
          metalness={0}
        />
        <meshStandardMaterial attach="material-5" color="#1c1c1c" />
      </mesh>

      {/* Top rail */}
      <mesh position={[0, halfH + frameThickness / 2, 0]} castShadow>
        <boxGeometry
          args={[width + frameThickness * 2, frameThickness, frameDepth]}
        />
        <meshStandardMaterial
          color={FRAME_COLOR}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      {/* Bottom rail */}
      <mesh position={[0, -halfH - frameThickness / 2, 0]} castShadow>
        <boxGeometry
          args={[width + frameThickness * 2, frameThickness, frameDepth]}
        />
        <meshStandardMaterial
          color={FRAME_COLOR}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      {/* Left rail */}
      <mesh position={[-halfW - frameThickness / 2, 0, 0]} castShadow>
        <boxGeometry args={[frameThickness, height, frameDepth]} />
        <meshStandardMaterial
          color={FRAME_COLOR}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
      {/* Right rail */}
      <mesh position={[halfW + frameThickness / 2, 0, 0]} castShadow>
        <boxGeometry args={[frameThickness, height, frameDepth]} />
        <meshStandardMaterial
          color={FRAME_COLOR}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

interface SceneProps {
  imageUrl: string;
  reduced: boolean;
}

function Scene({ imageUrl, reduced }: SceneProps) {
  // Float drifts the painting subtly so the hero feels alive without
  // ever being distracting. When the visitor has opted out of motion
  // we keep the same scene at rest — they can still rotate manually
  // in the product viewer if they want to inspect the piece.
  const floatProps = reduced
    ? { speed: 0, rotationIntensity: 0, floatIntensity: 0 }
    : { speed: 1.1, rotationIntensity: 0.35, floatIntensity: 0.55 };

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[3, 4, 5]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 2, 2]} intensity={0.5} />
      <Float {...floatProps}>
        <FramedPainting imageUrl={imageUrl} />
      </Float>
      <Suspense fallback={null}>
        <HeroParticles reduced={reduced} />
      </Suspense>
      {!reduced && (
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.45}
            luminanceThreshold={0.35}
            luminanceSmoothing={0.6}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </>
  );
}

const pickFeatured = (artworks: DisplayArtwork[]): DisplayArtwork[] => {
  // ProductContext orders customer-posted products createdAt-desc, so
  // the newest pieces bubble to the front of `getStorefrontArtworks`.
  // Show three so the hero feels rotated, not single-pinned.
  const seen = new Set<string>();
  const out: DisplayArtwork[] = [];
  for (const art of artworks) {
    if (seen.has(art.id)) continue;
    seen.add(art.id);
    out.push(art);
    if (out.length >= 3) break;
  }
  return out;
};

export default function Hero3D() {
  const { products } = useProducts();
  const artworks = useMemo(() => {
    return pickFeatured(getStorefrontArtworks(products));
  }, [products]);

  const reduced = useReducedMotion() ?? false;
  const [activeIndex, setActiveIndex] = useState(0);

  // Cycle the featured painting on a slow timer. Pause the cycle
  // when the visitor's opted out of motion or when the document is
  // hidden (a hot tab in the background should not burn battery).
  useEffect(() => {
    if (reduced || artworks.length <= 1) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        setActiveIndex((i) => (i + 1) % artworks.length);
      }, CYCLE_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [artworks.length, reduced]);

  // Scroll-driven reveal: as the visitor scrolls past the hero the
  // painting tilts and shrinks, signalling "you've left the gallery
  // wall" before the marquee takes over. framer-motion's useScroll
  // is enough — no need for GSAP / ScrollTrigger here.
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const wordmarkY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const wordmarkOpacity = useTransform(
    scrollYProgress,
    [0, 0.6, 1],
    [1, 0.6, 0],
  );

  if (artworks.length === 0) {
    // No paintings published yet — keep the screen-reader-only
    // heading so SEO / smoke tests still find an h1.
    return <h1 className="sr-only">Canvas Hub</h1>;
  }

  const featured = artworks[activeIndex] ?? artworks[0];
  const featuredImage = featured.images?.[0]
    ? variantSrc(featured.images[0], "lg")
    : featured.image;

  return (
    <section
      ref={sectionRef}
      aria-label="Canvas Hub — featured painting"
      className="relative w-full h-[80vh] sm:h-[85vh] min-h-[520px] overflow-hidden bg-background"
    >
      {/* Soft radial gradient backdrop. Keeps the canvas readable
          on both light and dark themes without a hard edge. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(58,38,24,0.18),transparent_65%)]"
      />

      <Canvas
        camera={{ position: [0, 0, 5.2], fov: 38 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        className="!absolute !inset-0"
      >
        <Suspense fallback={null}>
          <Scene imageUrl={featuredImage} reduced={reduced} />
        </Suspense>
      </Canvas>

      <motion.div
        style={{ y: wordmarkY, opacity: wordmarkOpacity }}
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-12 sm:pb-16 px-6 text-center"
      >
        <h1 className="font-display text-4xl sm:text-6xl md:text-7xl tracking-[0.04em] text-foreground drop-shadow-[0_2px_24px_rgba(0,0,0,0.18)]">
          Canvas Hub
        </h1>
        <p className="mt-3 max-w-xl font-body text-[11px] sm:text-xs tracking-[0.3em] uppercase text-muted-foreground">
          Hand-crafted paintings, framed and ready to hang
        </p>
        <Link
          to="/collection"
          className="pointer-events-auto mt-6 inline-flex items-center justify-center font-body text-[11px] sm:text-xs tracking-[0.3em] uppercase px-6 sm:px-10 py-3 sm:py-4 bg-foreground/95 text-background hover:bg-foreground transition-colors duration-300"
        >
          Browse the collection
        </Link>
      </motion.div>

      {/* Featured-piece caption: anchors the cycling painting to a
          real piece a customer can click straight into. Sits in the
          top-right so it doesn't fight the centred wordmark. */}
      <Link
        to="/product/$id"
        params={{ id: featured.id }}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 max-w-[60%] text-right font-body text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        Now showing · {featured.title}
      </Link>
    </section>
  );
}
