import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useProducts, getEffectivePrice } from "@/contexts/ProductContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";
import { variantSrc } from "@/lib/productImage";
import { formatPHP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ContainerAnimated,
  ContainerScroll,
  ContainerStagger,
  ContainerSticky,
  GalleryCol,
  GalleryContainer,
} from "@/components/blocks/animated-gallery";

// ScrollGalleryExperience — a motion / scroll-driven landing built on
// the 21st.dev "Animated Scroll Gallery" block. The whole homepage is
// browsed by scrolling (or swiping on touch); there are no
// "Browse Collection" or pagination buttons. Three movements:
//
//   1. Intro — a blur-in editorial title block.
//   2. The Wall — a sticky, 3D scroll-tilted three-column grid of the
//      full catalogue. The grid rakes up from a steep tilt to flat and
//      the columns drift at different speeds as you scroll, so the
//      collection assembles itself out of depth.
//   3. The Deck — a pinned, full-bleed "swipe" through the featured
//      pieces. Scroll position cross-fades + parallaxes one artwork
//      over the next, one screen at a time, like flipping through a
//      portfolio. A fixed counter tracks where you are.
//
// Every tile / slide links to the product page, so the entire
// catalogue is reachable from the homepage by scroll alone. Honours
// `prefers-reduced-motion`: the tilt flattens and the pinned deck
// degrades to a plain stacked grid.

const heroImage = (art: DisplayArtwork, preferred: "md" | "lg" = "lg") =>
  art.images?.[0] ? variantSrc(art.images[0], preferred) : art.image;

// Split a flat artwork list into N roughly-even columns, round-robin so
// adjacent columns never show the same piece next to each other.
function toColumns<T>(items: T[], cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, i) => out[i % cols].push(item));
  return out;
}

interface DeckSlideProps {
  art: DisplayArtwork;
  index: number;
  total: number;
  progress: MotionValue<number>;
}

// One full-screen artwork in the pinned deck. Its opacity peaks while
// its scroll window is centred and cross-fades into its neighbours; the
// image drifts + eases scale across the window for a slow ken-burns.
function DeckSlide({ art, index, total, progress }: DeckSlideProps) {
  const seg = 1 / total;
  const start = index * seg;
  const opacity = useTransform(
    progress,
    [start - seg * 0.5, start, start + seg, start + seg * 1.5],
    [0, 1, 1, 0],
    { clamp: true },
  );
  const imgY = useTransform(
    progress,
    [start - seg, start + seg * 2],
    ["10%", "-10%"],
  );
  const imgScale = useTransform(
    progress,
    [start - seg, start + seg * 2],
    [1.18, 1],
  );
  const copyY = useTransform(
    progress,
    [start - seg * 0.5, start, start + seg, start + seg * 1.5],
    [60, 0, 0, -60],
  );

  const price = getEffectivePrice(art);
  const onSale = typeof art.salePrice === "number" && art.salePrice < art.price;

  return (
    <motion.div
      style={{ opacity }}
      className="absolute inset-0 flex items-center justify-center"
      aria-hidden={undefined}
    >
      <Link
        to="/product/$id"
        params={{ id: art.id }}
        className="group relative block size-full"
        aria-label={`View ${art.title}`}
      >
        <div className="absolute inset-0 overflow-hidden">
          <motion.img
            src={heroImage(art)}
            alt={art.title}
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            style={{ y: imgY, scale: imgScale }}
            className="size-full object-cover"
          />
        </div>
        {/* Legibility scrim — heavier at the bottom where the copy sits. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
        <motion.div
          style={{ y: copyY }}
          className="absolute inset-x-0 bottom-0 mx-auto flex max-w-5xl flex-col gap-3 px-6 pb-[14vh] sm:px-10 md:pb-[12vh]"
        >
          <span className="font-body text-[10px] uppercase tracking-[0.4em] text-white/70">
            {String(index + 1).padStart(2, "0")} · {art.category ?? art.medium}
          </span>
          <h3 className="font-display text-3xl leading-[1.05] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)] sm:text-5xl md:text-6xl">
            {art.title}
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-body text-sm text-white/80">
            <span className="uppercase tracking-[0.2em]">
              {art.medium}
              {art.year ? ` · ${art.year}` : ""}
            </span>
            <span className="flex items-baseline gap-2">
              <span
                className="text-base font-medium"
                style={{ color: "var(--logo-color)" }}
              >
                {formatPHP(price)}
              </span>
              {onSale && (
                <span className="text-xs text-white/50 line-through">
                  {formatPHP(art.price)}
                </span>
              )}
            </span>
          </div>
          <span className="mt-1 inline-flex w-fit items-center gap-2 font-body text-[11px] uppercase tracking-[0.3em] text-white/80 transition-colors group-hover:text-white">
            View piece
            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </span>
        </motion.div>
      </Link>
    </motion.div>
  );
}

interface DeckProps {
  artworks: DisplayArtwork[];
}

// The pinned swipe deck. A tall scroll region drives a sticky viewport;
// `scrollYProgress` (0→1 across the region) is handed to each slide so
// the deck advances one screen per artwork.
function ScrollDeck({ artworks }: DeckProps) {
  const deckRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: deckRef,
    offset: ["start start", "end end"],
  });
  const total = artworks.length;
  // Counter index follows scroll progress; clamps to the last slide.
  const counter = useTransform(scrollYProgress, (p) =>
    String(Math.min(total, Math.floor(p * total) + 1)).padStart(2, "0"),
  );
  const railScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  if (reduced) {
    // Reduced-motion: no pinning / scroll-linked transforms — just a
    // clean stacked column the visitor scrolls through normally.
    return (
      <div className="flex flex-col">
        {artworks.map((art, i) => {
          const price = getEffectivePrice(art);
          return (
            <Link
              key={art.id}
              to="/product/$id"
              params={{ id: art.id }}
              className="group relative block h-[80svh] w-full overflow-hidden"
              aria-label={`View ${art.title}`}
            >
              <img
                src={heroImage(art)}
                alt={art.title}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
              <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-5xl flex-col gap-2 px-6 pb-16 sm:px-10">
                <h3 className="font-display text-3xl text-white sm:text-5xl">
                  {art.title}
                </h3>
                <span
                  className="font-body text-base font-medium"
                  style={{ color: "var(--logo-color)" }}
                >
                  {formatPHP(price)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={deckRef}
      className="relative"
      style={{ height: `${total * 100}svh` }}
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden bg-black">
        {artworks.map((art, i) => (
          <DeckSlide
            key={art.id}
            art={art}
            index={i}
            total={total}
            progress={scrollYProgress}
          />
        ))}

        {/* Fixed swipe-progress counter + scrub rail. Purely a wayfinding
            affordance — there are no next / prev controls. */}
        <div className="pointer-events-none absolute right-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-4 sm:flex">
          <motion.span className="font-body text-xs tabular-nums tracking-[0.3em] text-white/80">
            {counter}
          </motion.span>
          <div className="relative h-40 w-px overflow-hidden bg-white/20">
            <motion.div
              className="absolute inset-x-0 top-0 w-px origin-top"
              style={{
                height: "100%",
                scaleY: railScaleY,
                background: "var(--logo-color)",
              }}
            />
          </div>
          <span className="font-body text-xs tabular-nums tracking-[0.3em] text-white/40">
            {String(total).padStart(2, "0")}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-1 text-white/60 sm:hidden">
          <span className="font-body text-[10px] uppercase tracking-[0.35em]">
            Swipe to browse
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ScrollGalleryExperience() {
  const { products } = useProducts();
  const artworks = getStorefrontArtworks(products);

  // The Wall shows a broad slice of the catalogue; the Deck features a
  // curated handful so the pinned scroll stays a comfortable length.
  const wallArtworks = artworks.slice(0, 18);
  const deckArtworks = artworks.slice(0, 6);
  const columns = toColumns(wallArtworks, 3);
  // Each column drifts at a different speed for parallax depth.
  const colRanges: [string, string][] = [
    ["2%", "-8%"],
    ["-6%", "4%"],
    ["4%", "-10%"],
  ];

  return (
    <div className="relative bg-background">
      {/* ── 1. Intro ─────────────────────────────────────────────── */}
      <ContainerStagger className="relative z-10 mx-auto flex min-h-[78svh] max-w-4xl flex-col items-center justify-center px-6 pt-28 text-center">
        <ContainerAnimated>
          <span
            className="font-body text-[11px] uppercase tracking-[0.5em]"
            style={{ color: "var(--logo-color)" }}
          >
            Canvas Hub — Original Filipino Art
          </span>
        </ContainerAnimated>
        <ContainerAnimated>
          <h1 className="mt-6 font-display text-5xl leading-[1.02] text-foreground sm:text-7xl md:text-8xl">
            The collection,
            <br />
            in motion.
          </h1>
        </ContainerAnimated>
        <ContainerAnimated>
          <p className="mx-auto mt-6 max-w-xl font-body text-sm leading-relaxed text-muted-foreground sm:text-base">
            No menus, no pages. Just scroll — every piece is hand-crafted to
            order by Filipino makers and shipped nationwide.
          </p>
        </ContainerAnimated>
        <ContainerAnimated className="mt-12">
          <span className="flex flex-col items-center gap-3 font-body text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
            Scroll to explore
            <motion.span
              aria-hidden="true"
              className="block h-10 w-px bg-gradient-to-b from-[var(--logo-color)] to-transparent"
              animate={{ scaleY: [0.4, 1, 0.4], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ originY: 0 }}
            />
          </span>
        </ContainerAnimated>
      </ContainerStagger>

      {/* ── 2. The Wall — 3D scroll-tilted catalogue ─────────────── */}
      <ContainerScroll className="relative h-[320vh]">
        <ContainerSticky className="h-svh">
          <GalleryContainer className="mx-auto max-w-6xl px-3 sm:px-6">
            {columns.map((col, ci) => (
              <GalleryCol
                key={ci}
                yRange={colRanges[ci]}
                className={cn(ci === 1 && "mt-[-12%]")}
              >
                {col.map((art) => (
                  <Link
                    key={art.id}
                    to="/product/$id"
                    params={{ id: art.id }}
                    aria-label={`View ${art.title}`}
                    className="group relative block aspect-[3/4] overflow-hidden rounded-lg border border-border/40 bg-muted/20"
                  >
                    <img
                      src={heroImage(art, "md")}
                      alt={art.title}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                      <p className="font-display text-sm text-white">
                        {art.title}
                      </p>
                      <p
                        className="font-body text-xs"
                        style={{ color: "var(--logo-color)" }}
                      >
                        {formatPHP(getEffectivePrice(art))}
                      </p>
                    </div>
                  </Link>
                ))}
              </GalleryCol>
            ))}
          </GalleryContainer>
          {/* Heading floats over the rising wall. */}
          <div className="pointer-events-none absolute inset-x-0 top-[12svh] z-10 text-center">
            <h2 className="font-display text-3xl text-foreground sm:text-5xl">
              The Wall
            </h2>
            <p className="mt-2 font-body text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
              Scroll — the collection rises
            </p>
          </div>
        </ContainerSticky>
      </ContainerScroll>

      {/* ── 3. The Deck — pinned full-bleed swipe ────────────────── */}
      {deckArtworks.length > 0 && (
        <section aria-label="Featured pieces — swipe to browse">
          <ScrollDeck artworks={deckArtworks} />
        </section>
      )}

      {/* ── Outro ────────────────────────────────────────────────── */}
      <ContainerStagger className="relative z-10 mx-auto flex min-h-[60svh] max-w-3xl flex-col items-center justify-center px-6 py-24 text-center">
        <ContainerAnimated>
          <h2 className="font-display text-4xl leading-tight text-foreground sm:text-6xl">
            Found something
            <br />
            <span style={{ color: "var(--logo-color)" }}>that moves you?</span>
          </h2>
        </ContainerAnimated>
        <ContainerAnimated>
          <p className="mt-6 max-w-md font-body text-sm leading-relaxed text-muted-foreground">
            Every piece is made to order. Open any artwork to read its story and
            reserve it — we craft and ship it straight to you.
          </p>
        </ContainerAnimated>
      </ContainerStagger>
    </div>
  );
}
