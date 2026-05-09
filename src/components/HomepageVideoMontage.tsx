import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import FilmGrain from "@/components/FilmGrain";
import SplitText from "@/components/motion/SplitText";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { isExternalHref, safeHref } from "@/lib/safeUrl";

// Cinematic full-bleed video reel section. Sits between DailyFeature
// and CinematicCollectionCTA so the homepage gets a "moving image"
// moment before dropping into the static collection scene.
//
// Behaviour:
// - Renders nothing if admin hasn't set a `videoUrl` yet, so this is
//   safe to ship without any uploaded asset.
// - Lazy-loads the actual <video> source via IntersectionObserver:
//   the poster image renders immediately, but the video bytes only
//   start downloading once the section is within ~30% of the
//   viewport. Mobile visitors who never scroll this far never pay
//   the download cost.
// - Honours `prefers-reduced-motion`: skips video playback entirely
//   and shows the poster only. The headline / CTA reveal animations
//   also disable themselves under reduce — same pattern as
//   CinematicCollectionCTA.
// - Foreground content matches the Cinematic CTA family: eyebrow +
//   word-by-word SplitText headline + body + button, layered above
//   gradient wash, vignette, and a film-grain overlay.
//
// Internal CTA links use TanStack <Link>; external links fall back
// to a plain anchor with rel="noopener" so the SPA router doesn't
// try to handle them.

interface CtaButtonProps {
  href: string;
  children: React.ReactNode;
}

const CtaButton = ({ href, children }: CtaButtonProps) => {
  const className =
    "inline-flex items-center justify-center px-8 sm:px-10 py-4 bg-foreground text-background font-body text-xs tracking-[0.3em] uppercase hover:bg-foreground/90 transition-colors rounded-none shadow-lg shadow-background/30";
  // The landing-video sanitiser in `storefront-config.js` already filters
  // dangerous schemes server-side, but we re-validate via the shared
  // `safeHref` helper so a stale cached payload can't smuggle a
  // `javascript:` link into the foreground CTA button.
  const safe = safeHref(href);
  if (!safe) return null;
  if (isExternalHref(safe)) {
    return (
      <a
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link to={safe} className={className}>
      {children}
    </Link>
  );
};

const HomepageVideoMontage = () => {
  const { config } = useStorefrontConfig();
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Becomes true once the section enters the viewport — at that
  // point we attach the real <source> so the browser starts
  // downloading the video. Before that the <video> stays empty so
  // there's no network request beyond the poster image.
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);

  // Subtle parallax on the video frame as the user scrolls past.
  // Same range as CinematicCollectionCTA so the two scenes feel like
  // they belong to the same family.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });
  const videoY = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  const lv = config.landingVideo;

  useEffect(() => {
    if (!lv.videoUrl) return;
    if (reduce) return; // reduced-motion stays on the poster, never fetches the video.
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // SSR / very old browsers — fall back to eager load. There's
      // no graceful detection-free way to lazy-load otherwise.
      setShouldLoadVideo(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldLoadVideo(true);
            io.disconnect();
            break;
          }
        }
      },
      // 30% of the viewport before the section enters: gives the
      // browser a head start so the first frame is already buffered
      // by the time the user actually sees the section.
      { rootMargin: "0px 0px 30% 0px", threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [lv.videoUrl, reduce]);

  // Once we've decided to load the video, ask the element to start
  // playback. autoplay+muted should be enough on every modern
  // browser, but Safari occasionally needs an explicit .play()
  // after the source is attached.
  useEffect(() => {
    if (!shouldLoadVideo) return;
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        // Browsers reject autoplay if there's no user gesture and the
        // tab isn't visible yet — that's fine, the poster carries the
        // section in that case.
        p.catch(() => {});
      }
    };
    if (v.readyState >= 2) {
      tryPlay();
    } else {
      v.addEventListener("loadeddata", tryPlay, { once: true });
      return () => v.removeEventListener("loadeddata", tryPlay);
    }
  }, [shouldLoadVideo]);

  // Empty videoUrl = section disabled. Returning null is intentional
  // so the homepage layout collapses cleanly with no placeholder.
  if (!lv.videoUrl) return null;

  return (
    <section
      ref={containerRef}
      aria-label={lv.eyebrow || "Studio reel"}
      className="relative min-h-[60vh] sm:min-h-[70vh] md:min-h-[78vh] overflow-hidden bg-background"
    >
      {/* Background video frame. Wrapped in a parallax-translated div
          so the cinematic-collection scene above and below moves
          together with this one. */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={reduce ? undefined : { y: videoY }}
      >
        {/* Poster image carries the section while the video bytes
            download — and is the only thing rendered for visitors
            on prefers-reduced-motion. */}
        {lv.posterUrl && !shouldLoadVideo && (
          <img
            src={lv.posterUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            style={{ filter: "saturate(0.9) brightness(0.6)" }}
          />
        )}
        {shouldLoadVideo && (
          <video
            ref={videoRef}
            // Mobile-safe autoplay set: muted + playsInline so iOS
            // doesn't kick the player into fullscreen. preload=none
            // is moot now (we're past the IO gate) but harmless.
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={lv.posterUrl || undefined}
            className="w-full h-full object-cover"
            style={{ filter: "saturate(0.9) brightness(0.6)" }}
          >
            <source src={lv.videoUrl} />
          </video>
        )}
      </motion.div>

      {/* Top + bottom soft fades so the section blends into the
          adjacent sections rather than looking like a hard slab. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/55 to-background/90" />

      {/* Centre vignette pushes attention onto the headline. */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.35) 80%)",
        }}
      />

      {/* Subtle film grain — keeps the look cinematic and hides the
          banding we'd otherwise see on the dark wash gradient. */}
      <FilmGrain opacity={0.07} />

      {/* Foreground content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center min-h-[60vh] sm:min-h-[70vh] md:min-h-[78vh] px-4 sm:px-6 md:px-12 max-w-3xl mx-auto">
        {lv.eyebrow ? (
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="font-body text-[10px] sm:text-xs tracking-[0.45em] uppercase text-foreground/70 mb-5"
          >
            {lv.eyebrow}
          </motion.p>
        ) : null}
        {lv.headline ? (
          <SplitText
            as="h2"
            by="word"
            stagger={0.08}
            duration={0.95}
            yFrom={36}
            className="font-display text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-foreground leading-[1.05] mb-6 drop-shadow-md"
          >
            {lv.headline}
          </SplitText>
        ) : null}
        {lv.description ? (
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 0.85, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="font-body text-sm sm:text-base text-foreground/80 leading-relaxed max-w-xl mb-9"
          >
            {lv.description}
          </motion.p>
        ) : null}
        {lv.ctaLabel && lv.ctaHref ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{
              duration: 0.85,
              delay: 0.55,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <CtaButton href={lv.ctaHref}>{lv.ctaLabel}</CtaButton>
          </motion.div>
        ) : null}
      </div>
    </section>
  );
};

export default HomepageVideoMontage;
