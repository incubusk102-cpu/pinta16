import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useProducts } from "@/contexts/ProductContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";

// One full loop in seconds. Slow enough that thumbnails are easily
// scannable, fast enough that the strip never feels static. Mobile
// gets a touch more pace because the viewport is narrower so the
// duplicated half scrolls past faster relative to the user's eye.
const DURATION_S = 36;

// Show at most this many unique thumbnails per direction. Beyond this
// the strip stops adding visual interest and just inflates the DOM.
// (Each thumbnail is duplicated for the seamless wrap, so the total
// rendered tile count is 2× this.)
const MAX_TILES = 24;

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
        className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.06]"
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
const PaintingMarquee = () => {
  const { products } = useProducts();

  const artworks = useMemo(() => {
    const all = getStorefrontArtworks(products);
    return all.slice(0, MAX_TILES);
  }, [products]);

  if (artworks.length < 3) return null;

  return (
    <div
      className="painting-marquee-rail relative overflow-hidden border-y border-border/40 bg-background/60 py-3 sm:py-4"
      aria-label="Painting collection ticker"
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
        className="painting-marquee-track flex gap-3 sm:gap-4 md:gap-5 w-max hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]"
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
