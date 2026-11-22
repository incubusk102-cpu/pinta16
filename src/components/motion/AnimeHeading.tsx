import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

interface AnimeHeadingProps {
  /** Text to render. We split into individual letters / words so anime.js
   *  can stagger across them. Only plain strings are supported. */
  children: string;
  /** Split granularity. "letter" reads as a typewriter-y reveal,
   *  "word" reads as an apple.com-style headline. */
  by?: "letter" | "word";
  /** Per-token delay in ms multiplied by token index. */
  staggerMs?: number;
  /** Animation duration per token in ms. */
  durationMs?: number;
  /** Initial Y offset (px) — tokens slide up from this distance. */
  yFrom?: number;
  /** Pause before the first token plays (ms). */
  delayMs?: number;
  /** Easing name from anime.js. Defaults to "outExpo" — punchy on entry, settles cleanly. */
  ease?: string;
  /** Render-as: defaults to <span>. Pass "h1" / "p" / "div" if the host element should be the heading. */
  as?: "span" | "h1" | "h2" | "h3" | "p" | "div";
  /** Optional class names for the host element. */
  className?: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * anime.js-powered headline reveal. Splits the string into tokens
 * (letters or words) and runs a coordinated stagger of opacity + Y
 * translation. Honours `prefers-reduced-motion` by rendering plain
 * static text. Keeps the original string as the host element's
 * `aria-label` so screen readers announce the headline atomically
 * instead of letter-by-letter.
 *
 * Why anime.js here (not framer-motion / our existing SplitText):
 * the v4 easing presets (`outExpo`, `outElastic`) and the
 * `stagger()` helper give the wordmark a noticeably crisper attack
 * than the spring physics SplitText uses. SplitText is still the
 * right tool for scroll-triggered body copy elsewhere on the page.
 */
const AnimeHeading = ({
  children,
  by = "letter",
  staggerMs = 45,
  durationMs = 900,
  yFrom = 26,
  delayMs = 120,
  ease = "outExpo",
  as = "span",
  className,
}: AnimeHeadingProps) => {
  const hostRef = useRef<HTMLElement | null>(null);
  const Host = as;

  // Pre-split so the rendered DOM is stable across renders. Whitespace
  // is preserved as its own non-animated node so word wrapping behaves
  // the same as the underlying string.
  const tokens =
    by === "word"
      ? children.split(/(\s+)/)
      : Array.from(children).flatMap((char) =>
          // Keep whitespace as static text rather than an animated span.
          char === " " ? [" "] : [char],
        );

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    if (!host) return;

    const targets = Array.from(
      host.querySelectorAll<HTMLElement>("[data-anime-token]"),
    );
    if (targets.length === 0) return;

    // Hide tokens before the first frame so we don't see them flash
    // into position. anime.js will animate from these starting values.
    targets.forEach((node) => {
      node.style.opacity = "0";
      node.style.transform = `translate3d(0, ${yFrom}px, 0)`;
    });

    const controls = animate(targets, {
      opacity: [0, 1],
      translateY: [yFrom, 0],
      duration: durationMs,
      delay: stagger(staggerMs, { start: delayMs }),
      ease,
    });

    return () => {
      controls.pause();
      // Reset inline styles so React-driven re-renders don't see the
      // half-animated state.
      targets.forEach((node) => {
        node.style.opacity = "";
        node.style.transform = "";
      });
    };
    // Tokens are pre-rendered in the JSX below so the effect only
    // needs to re-fire when the input string or motion params change.
  }, [children, by, staggerMs, durationMs, yFrom, delayMs, ease]);

  return (
    <Host
      ref={hostRef as React.RefObject<HTMLHeadingElement>}
      className={className}
      aria-label={children}
    >
      {tokens.map((token, idx) => {
        // Whitespace stays inline so flexbox / wrapping behaves
        // identically to a plain string.
        if (/^\s+$/.test(token)) {
          return (
            <span key={`s-${idx}`} aria-hidden="true">
              {token}
            </span>
          );
        }
        return (
          <span
            key={`t-${idx}`}
            data-anime-token
            aria-hidden="true"
            style={{
              display: "inline-block",
              willChange: "transform, opacity",
            }}
          >
            {token}
          </span>
        );
      })}
    </Host>
  );
};

export default AnimeHeading;
