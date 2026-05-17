import { useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

interface ImageWithFallbackProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackClassName?: string;
  // `sizes` is forwarded to the inner <img> when responsive WebPs are
  // emitted. Default targets the gallery card grid: full width on
  // phones, half on tablets, third on desktop. Override per call site
  // (e.g. hero is "100vw", thumbnails are "300px").
  sizes?: string;
  /** When true, sets `fetchpriority="high"` on the <img> for LCP hints. */
  priority?: boolean;
}

// Matches public/images/<basename>.<png|jpe?g> — the only sources
// processed by scripts/optimize-images.mjs at build time. Anything
// that doesn't match (admin uploads via /api/r/, external CDN URLs,
// data: URIs) renders as a plain <img>.
const STATIC_IMAGE_RE = /^\/images\/([^/?#]+)\.(png|jpe?g)$/i;

// Must mirror WIDTHS in scripts/optimize-images.mjs.
const WIDTHS = [300, 600, 1200, 1800] as const;
const DEFAULT_SIZES =
  "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

const buildWebpSrcSet = (basename: string): string =>
  WIDTHS.map((w) => `/images/${basename}-${w}.webp ${w}w`).join(", ");

// Wraps a plain <img> with a graceful fallback when the URL fails to
// load (404, blocked, expired CDN). Instead of the browser's broken-
// image glyph the visitor sees a soft frame matching the rest of the
// gallery aesthetic. Visible alt text is preserved for accessibility.
//
// When the src is a static /images/*.png|jpg path, the optimised WebP
// variants emitted by `npm run optimize:images` are wired up via a
// <picture> + srcset wrapper so modern browsers download the smallest
// size that satisfies the layout. Browsers without WebP support (~1%)
// fall back to the original PNG/JPEG.
//
// Defaults: every image gets `loading="lazy"` and `decoding="async"`
// so off-screen gallery thumbnails don't compete with the hero on
// initial paint. Call sites that need eager loading (e.g. the LCP
// image on the product detail page) can pass `loading="eager"` to
// override.
const ImageWithFallback = ({
  src,
  alt,
  className,
  fallbackClassName,
  loading = "lazy",
  decoding = "async",
  sizes,
  priority,
  ...rest
}: ImageWithFallbackProps) => {
  const [errored, setErrored] = useState(false);

  if (errored || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={
          fallbackClassName ??
          `${className ?? ""} flex items-center justify-center bg-muted/30 border border-border/20`.trim()
        }
      >
        <ImageOff
          className="w-1/3 h-1/3 max-w-[48px] max-h-[48px] text-muted-foreground/50"
          aria-hidden="true"
        />
      </div>
    );
  }

  const staticMatch = STATIC_IMAGE_RE.exec(src);
  const img = (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? "eager" : loading}
      decoding={decoding}
      sizes={staticMatch ? (sizes ?? DEFAULT_SIZES) : sizes}
      onError={() => setErrored(true)}
      {...(priority
        ? ({ fetchpriority: "high" } as Record<string, string>)
        : {})}
      {...rest}
    />
  );

  if (!staticMatch) return img;

  const basename = staticMatch[1];
  return (
    <picture>
      <source type="image/webp" srcSet={buildWebpSrcSet(basename)} />
      {img}
    </picture>
  );
};

export default ImageWithFallback;
