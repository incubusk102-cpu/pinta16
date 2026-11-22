import type { HeroSlide } from "@/contexts/HeroSlidesContext";

interface HeroSlidePreviewProps {
  slide: Pick<
    HeroSlide,
    "image" | "eyebrow" | "headline" | "subtext" | "ctaLabel" | "align"
  >;
}

const ALIGN_CLASSES: Record<HeroSlide["align"], string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

/**
 * Read-only thumbnail mirror of <HeroSlider /> for the admin editor.
 *
 * Deliberately static (no Framer Motion, no autoplay, no parallax) —
 * the goal is "what does this slide look like, right now, with the
 * text I'm typing?", not to replay the full home-page animation. The
 * scaled-down typography and the same gradient wash give a faithful
 * 16:9 preview that lives next to the form fields, so admins can
 * tweak the headline / CTA / alignment and immediately see the result
 * before they hit Save.
 */
export function HeroSlidePreview({ slide }: HeroSlidePreviewProps) {
  const hasAnyText =
    slide.eyebrow || slide.headline || slide.subtext || slide.ctaLabel;

  return (
    <div className="relative w-full aspect-[16/9] overflow-hidden rounded-md border border-border/60 bg-muted">
      {slide.image ? (
        <img
          src={slide.image}
          alt={slide.headline || slide.eyebrow || "Slide preview"}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
          No image yet
        </div>
      )}

      {/* Same readability gradient as HeroSlider so the preview reads
          identically once typography lands on top of the painting. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/55 to-background/15" />

      {hasAnyText && (
        <div
          className={`absolute inset-0 z-10 flex flex-col justify-center px-3 pb-2 ${ALIGN_CLASSES[slide.align]}`}
        >
          <div className="max-w-[80%] flex flex-col gap-1">
            {slide.eyebrow && (
              <p className="font-body text-[7px] sm:text-[8px] tracking-[0.25em] uppercase text-foreground/80 drop-shadow-sm">
                {slide.eyebrow}
              </p>
            )}
            {slide.headline && (
              <h3 className="font-display text-sm sm:text-base text-foreground leading-[1.1] drop-shadow line-clamp-2">
                {slide.headline}
              </h3>
            )}
            {slide.subtext && (
              <p className="font-body text-[9px] sm:text-[10px] text-foreground/80 leading-snug drop-shadow-sm line-clamp-2">
                {slide.subtext}
              </p>
            )}
            {slide.ctaLabel && (
              <span className="mt-0.5 inline-flex w-fit items-center justify-center font-body text-[7px] sm:text-[8px] tracking-[0.25em] uppercase px-2 py-1 bg-foreground/95 text-background shadow">
                {slide.ctaLabel}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
