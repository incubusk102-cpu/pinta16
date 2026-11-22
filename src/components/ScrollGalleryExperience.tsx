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
//   3. The Studio — a pinned, full-bleed walk through the featured
//      pieces. Each painting fills the viewport edge-to-edge (no frame,
//      no margins) with an editorial caption set bottom-left over a
//      lower-band gradient, so the type reads large without burying the
//      focal area. Scroll cross-fades one piece into the next; a fixed
//      counter tracks where you are.
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

// One full-bleed piece in the studio walk. The painting fills the whole
// viewport edge-to-edge (no frame, no mat, no margins — a "studio" hang),
// drifting + slowly scaling for a ken-burns as you scroll. The caption is
// an editorial block anchored bottom-left over a gradient that only darkens
// the lower band, so the artwork's focal area stays clear while the type
// reads large and deliberate. Opacity peaks while the slide's scroll window
// is centred and cross-fades into its neighbours.
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
    ["8%", "-8%"],
  );
  const imgScale = useTransform(
    progress,
    [start - seg, start + seg * 2],
    [1.18, 1.02],
  );
  const copyY = useTransform(
    progress,
    [start - seg * 0.5, start, start + seg, start + seg * 1.5],
    [60, 0, 0, -60],
  );

  const price = getEffectivePrice(art);
  const onSale = typeof art.salePrice === "number" && art.salePrice < art.price;

  return (
    <motion.div style={{ opacity }} className="absolute inset-0">
      <Link
        to="/product/$id"
        params={{ id: art.id }}
        className="group relative block size-full"
        aria-label={`View ${art.title}`}
      >
        {/* Full-bleed artwork — edge to edge, no frame. */}
        <motion.img
          src={heroImage(art)}
          alt={art.title}
          loading={index === 0 ? "eager" : "lazy"}
          decoding="async"
          style={{ y: imgY, scale: imgScale }}
          className="absolute inset-0 size-full object-cover"
        />
        {/* Light vignette top (nav legibility) + caption gradient bottom only. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {/* Editorial caption — anchored bottom-left, type stays off the focal area. */}
        <motion.figcaption
          style={{ y: copyY }}
          className="absolute inset-x-0 bottom-0 z-10 px-6 pb-[12vh] sm:px-10 sm:pb-[9vh] md:px-16 md:pb-[8vh]"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <span
                className="font-body text-[11px] uppercase tracking-[0.5em]"
                style={{ color: "var(--logo-color)" }}
              >
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(total).padStart(2, "0")}
              </span>
              <span className="h-px w-10 bg-white/40 sm:w-20" />
              <span className="font-body text-[11px] uppercase tracking-[0.4em] text-white/70">
                {art.category ?? art.medium}
              </span>
            </div>
            <h3 className="max-w-3xl font-display text-4xl leading-[1.02] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-6xl md:text-7xl">
              {art.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="font-body text-xs uppercase tracking-[0.25em] text-white/65 sm:text-sm">
                {art.medium}
                {art.year ? ` · ${art.year}` : ""}
              </span>
              <span
                className="flex items-baseline gap-2 font-display text-2xl sm:text-3xl"
                style={{ color: "var(--logo-color)" }}
              >
                {formatPHP(price)}
                {onSale && (
                  <span className="font-body text-sm text-white/45 line-through">
                    {formatPHP(art.price)}
                  </span>
                )}
              </span>
              <span className="inline-flex items-center gap-2 font-body text-[11px] uppercase tracking-[0.3em] text-white/80 transition-colors group-hover:text-white">
                View piece
                <span
                  aria-hidden="true"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </span>
            </div>
          </div>
        </motion.figcaption>
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
  const { scrollYProgress: rawProgress } = useScroll({
    target: deckRef,
    offset: ["start start", "end end"],
  });
  // Identity transform strips the ScrollTimeline `accelerate` config so
  // our slide ranges (which intentionally extend past [0,1]) don't get
  // handed to WAAPI as invalid keyframe offsets. See animated-gallery.tsx.
  const scrollYProgress = useTransform(rawProgress, (v) => v);
  const total = artworks.length;
  // Counter index follows scroll progress; clamps to the last slide.
  const counter = useTransform(scrollYProgress, (p) =>
    String(Math.min(total, Math.floor(p * total) + 1)).padStart(2, "0"),
  );
  const railScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  if (reduced) {
    // Reduced-motion: no pinning / scroll-linked transforms — just a
    // clean stack of full-bleed studio frames the visitor scrolls through
    // normally. Same edge-to-edge artwork + editorial caption, no motion.
    return (
      <div className="flex flex-col bg-black">
        {artworks.map((art, i) => {
          const price = getEffectivePrice(art);
          const onSale =
            typeof art.salePrice === "number" && art.salePrice < art.price;
          return (
            <Link
              key={art.id}
              to="/product/$id"
              params={{ id: art.id }}
              className="group relative block h-[88svh] w-full overflow-hidden"
              aria-label={`View ${art.title}`}
            >
              <img
                src={heroImage(art)}
                alt={art.title}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 size-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 z-10 px-6 pb-12 sm:px-10 md:px-16">
                <div className="mx-auto flex max-w-7xl flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="font-body text-[11px] uppercase tracking-[0.5em]"
                      style={{ color: "var(--logo-color)" }}
                    >
                      {String(i + 1).padStart(2, "0")} /{" "}
                      {String(artworks.length).padStart(2, "0")}
                    </span>
                    <span className="h-px w-10 bg-white/40 sm:w-20" />
                    <span className="font-body text-[11px] uppercase tracking-[0.4em] text-white/70">
                      {art.category ?? art.medium}
                    </span>
                  </div>
                  <h3 className="max-w-3xl font-display text-4xl leading-[1.02] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-6xl">
                    {art.title}
                  </h3>
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                    <span className="font-body text-xs uppercase tracking-[0.25em] text-white/65 sm:text-sm">
                      {art.medium}
                      {art.year ? ` · ${art.year}` : ""}
                    </span>
                    <span
                      className="flex items-baseline gap-2 font-display text-2xl sm:text-3xl"
                      style={{ color: "var(--logo-color)" }}
                    >
                      {formatPHP(price)}
                      {onSale && (
                        <span className="font-body text-sm text-white/45 line-through">
                          {formatPHP(art.price)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </figcaption>
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
            {/* CSS-only scroll cue: a gold segment bounces down a hairline
                track. Pure Tailwind keyframes — no framer/WAAPI animation
                on mount, and `motion-safe:` opts out under reduced motion. */}
            <span
              aria-hidden="true"
              className="relative block h-10 w-px overflow-hidden bg-border"
            >
              <span className="absolute inset-x-0 top-0 h-3 w-px bg-[var(--logo-color)] motion-safe:animate-bounce" />
            </span>
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
          {/* Heading floats over the rising wall — on a soft backdrop
              chip so it stays legible over bright artwork. */}
          <div className="pointer-events-none absolute inset-x-0 top-[10svh] z-10 flex justify-center px-6 text-center">
            <div className="rounded-2xl border border-white/15 bg-black/45 px-6 py-3 backdrop-blur-md">
              <h2 className="font-display text-3xl text-white sm:text-5xl">
                The Gallery Wall
              </h2>
              <p className="mt-1 font-body text-[11px] uppercase tracking-[0.35em] text-white/70">
                Scroll — the collection rises
              </p>
            </div>
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
        <ContainerAnimated>
          <Link
            to="/collection"
            className="group mt-8 inline-flex items-center gap-2 rounded-full border border-[var(--logo-color)]/40 px-6 py-3 font-body text-[11px] uppercase tracking-[0.3em] text-foreground transition-colors hover:border-[var(--logo-color)] hover:text-[var(--logo-color)]"
          >
            Browse the full collection
            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </ContainerAnimated>
      </ContainerStagger>
    </div>
  );
}
