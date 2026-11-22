import { useEffect, useRef } from "react";
import { animate } from "animejs";

interface OrnamentProps {
  className?: string;
  label?: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Decorative section header with two short rules flanking a small label.
 * Used to break up long pages with editorial / magazine-style seams.
 *
 * Motion: when scrolled into view, anime.js scales the two side rules
 * outward from the centre while fading the label in. An
 * IntersectionObserver gates the animation so off-screen ornaments
 * don't fire until the user reaches them.
 */
const Ornament = ({ className = "", label }: OrnamentProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const leftRule = host.querySelector<HTMLElement>("[data-ornament-left]");
    const rightRule = host.querySelector<HTMLElement>("[data-ornament-right]");
    const labelEl = host.querySelector<HTMLElement>("[data-ornament-label]");

    if (prefersReducedMotion()) {
      [leftRule, rightRule, labelEl].forEach((el) => {
        if (el) {
          el.style.opacity = "1";
          el.style.transform = "";
        }
      });
      return;
    }

    if (leftRule) {
      leftRule.style.transformOrigin = "100% 50%";
      leftRule.style.transform = "scaleX(0)";
      leftRule.style.opacity = "0";
    }
    if (rightRule) {
      rightRule.style.transformOrigin = "0% 50%";
      rightRule.style.transform = "scaleX(0)";
      rightRule.style.opacity = "0";
    }
    if (labelEl) {
      labelEl.style.opacity = "0";
      labelEl.style.transform = "translateY(6px)";
    }

    let animationStarted = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !animationStarted) {
            animationStarted = true;
            // Side rules ease out from the centre; label settles in
            // a beat behind so the eye lands on the typography last.
            if (leftRule && rightRule) {
              animate([leftRule, rightRule], {
                scaleX: [0, 1],
                opacity: [0, 1],
                duration: 900,
                ease: "outExpo",
              });
            }
            if (labelEl) {
              animate(labelEl, {
                opacity: [0, 1],
                translateY: [6, 0],
                duration: 700,
                delay: 300,
                ease: "outQuad",
              });
            }
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={`flex items-center gap-3 sm:gap-4 text-muted-foreground/70 ${className}`}
      aria-hidden
    >
      <span
        data-ornament-left
        className="flex-1 h-px bg-gradient-to-r from-transparent via-current to-current/40"
      />
      <span
        data-ornament-label
        className="font-body text-[10px] tracking-[0.4em] uppercase whitespace-nowrap"
      >
        {label || "·   ·   ·"}
      </span>
      <span
        data-ornament-right
        className="flex-1 h-px bg-gradient-to-l from-transparent via-current to-current/40"
      />
    </div>
  );
};

export default Ornament;
