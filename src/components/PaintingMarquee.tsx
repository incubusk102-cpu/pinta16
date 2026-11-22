import { useEffect, useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { animate, stagger } from "animejs";
import { useProducts } from "@/contexts/ProductContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";

// One full loop in seconds. Slow enough that thumbnails are easily
// scannable, fast enough that the strip never feels static. Mobile
// gets a touch more pace because the viewport is narrower so the
// duplicated half scrolls past faster relative to the user's eye.
const DURATION_S = 28;

// Show at most this many unique thumbnails per direction. Beyond this
// the strip stops adding visual interest and just inflates the DOM.
// (Each thumbnail is duplicated for the seamless wrap, so the total
// rendered tile count is 2× this.)
const MAX_TILES = 18;

const tileClass =
  "painting-marquee-tile relative shrink-0 size-[76px] sm:size-[104px] md:size-[124px] " +
  "rounded-lg overflow-hidden bg-muted/30 border border-border/40 " +
  "hover:border-foreground/50 transition-colors";

interface TileProps {
  art: DisplayArtwork;
  /** Whether this tile is part of the duplicate (cloned for seamless loop) — kept aria-hidden so screen readers don't double-announce. */
  cloned?: boolean;
}

function Tile({ art, cloned }: TileProps) {
  return (
    <Link
      to="/product/$id"
      params={{ id: art.id }}
      className={tileClass}
      aria-label={cloned ? undefined : `View ${art.title}`}
      aria-hidden={cloned ? true : undefined}
      tabIndex={cloned ? -1 : undefined}
    >
      <img
        src={art.image}
        alt={cloned ? "" : art.title}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform duration-300 motion-safe:hover:scale-[1.05]"
      />
      {art.availability === "sold" && (
        <span
          className="absolute inset-x-0 bottom-0 bg-foreground/85 text-background text-[10px] tracking-[0.18em] uppercase text-center py-0.5"
          aria-hidden="true"
        >
          Sold
        </span>
      )}
    </Link>
  );
}

/**
 * Continuously-scrolling strip of painting thumbnails — sits between
 * the hero and the social-proof ticker. Pulls from the same storefront
 * artwork list as the gallery (defaults + non-draft uploads, embargoed
 * pieces hidden from non-VIPs), pauses on hover so a curious visitor
 * can click through, and stays static when `prefers-reduced-motion` is
 * set (the keyframe animation is gated behind a `motion-safe` class so
 * the reduced-motion media query simply skips it).
 *
 * Renders nothing when there are fewer than three artworks — a strip
 * of one or two paintings looks accidental rather than intentional.
 */
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PaintingMarquee = () => {
  const { products } = useProducts();
  const trackRef = useRef<HTMLDivElement | null>(null);

  const artworks = useMemo(() => {
    const all = getStorefrontArtworks(products);
    return all.slice(0, MAX_TILES);
  }, [products]);

  // Initial-mount stagger: tiles fade in left-to-right via anime.js
  // before the CSS marquee keyframe takes over. Pure transform / opacity
  // so it composites onto the running animation without jank.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const track = trackRef.current;
    if (!track) return;
    const tiles = track.querySelectorAll<HTMLElement>(".painting-marquee-tile");
    if (tiles.length === 0) return;

    // Set the starting frame before painting so we don't see the tiles
    // in their final position for one render.
    tiles.forEach((tile) => {
      tile.style.opacity = "0";
      tile.style.transform = "translate3d(-18px, 6px, 0)";
    });

    const controls = animate(Array.from(tiles), {
      opacity: [0, 1],
      translateX: [-18, 0],
      translateY: [6, 0],
      duration: 700,
      delay: stagger(35, { start: 120 }),
      ease: "outQuad",
      onComplete: () => {
        // Clear inline styles so the parent's CSS marquee animation
        // controls position from here on.
        tiles.forEach((tile) => {
          tile.style.opacity = "";
          tile.style.transform = "";
        });
      },
    });

    return () => {
      controls.pause();
    };
  }, [artworks.length]);

  if (artworks.length < 3) return null;

  return (
    <div
      className="painting-marquee-rail relative overflow-hidden border-y border-border/40 bg-background/60 py-3 sm:py-4"
      aria-label="Product collection ticker"
    >
      {/* Soft fade-out gutters so thumbnails dissolve at the edges
          rather than pop in/out, matching the editorial feel of luxury
          / gallery storefronts. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-20 bg-gradient-to-r from-background to-transparent z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-20 bg-gradient-to-l from-background to-transparent z-10"
      />
      <div
        ref={trackRef}
        className="painting-marquee-track flex gap-3 sm:gap-4 md:gap-5 w-max"
        style={{
          animationDuration: `${DURATION_S}s`,
        }}
      >
        {artworks.map((art) => (
          <Tile key={`a-${art.id}`} art={art} />
        ))}
        {artworks.map((art) => (
          <Tile key={`b-${art.id}`} art={art} cloned />
        ))}
      </div>
    </div>
  );
};

export default PaintingMarquee;
