import { useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

interface ImageWithFallbackProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackClassName?: string;
}

// Wraps a plain <img> with a graceful fallback when the URL fails to
// load (404, blocked, expired CDN). Instead of the browser's broken-
// image glyph the visitor sees a soft frame matching the rest of the
// gallery aesthetic. Visible alt text is preserved for accessibility.
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

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={() => setErrored(true)}
      {...rest}
    />
  );
};

export default ImageWithFallback;
