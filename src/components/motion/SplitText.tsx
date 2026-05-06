import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode } from "react";

interface SplitTextProps {
  /**
   * The string to split. We only split strings — passing `<span>foo</span>`
   * would defeat screen readers that already get a stable text node.
   */
  children: string;
  /** Split granularity. "word" is the apple.com sweet spot — "letter" reads as a typewriter. */
  by?: "word" | "letter";
  /** Per-token delay (s). Multiplied by token index. */
  stagger?: number;
  /** Animation duration per token (s). */
  duration?: number;
  /** Initial Y offset (px). Tokens slide up from this distance. */
  yFrom?: number;
  /** Trigger only the first time this scrolls into view. Default true. */
  once?: boolean;
  /** Override the host element's class. */
  className?: string;
  /** Optional initial delay before the first token (s). */
  delay?: number;
  /** Render as: defaults to <span>. Pass "h1" / "h2" / "p" if you want the host element to be the heading itself. */
  as?: "span" | "h1" | "h2" | "h3" | "p" | "div";
}

/**
 * Apple-style word-by-word (or letter-by-letter) reveal. Each token
 * fades in and rises into place with a small stagger so the text
 * literally assembles itself as the user scrolls into the viewport.
 *
 * Accessibility: the host element keeps the original string as its
 * `aria-label` so screen readers announce the whole headline at
 * once instead of "Canvas. Hub." letter-by-letter. When
 * `prefers-reduced-motion` is on we render plain static text.
 */
const SplitText = ({
  children,
  by = "word",
  stagger = 0.06,
  duration = 0.7,
  yFrom = 24,
  once = true,
  className,
  delay = 0,
  as = "span",
}: SplitTextProps) => {
  const reduce = useReducedMotion();
  const Host = motion[as] as typeof motion.span;

  if (reduce) {
    return <Host className={className}>{children}</Host>;
  }

  // For "word" mode each whitespace-delimited chunk is one motion span.
  // For "letter" mode we keep words intact (so they don't break across
  // lines mid-word) but every visible character animates separately.
  const tokens: { text: string; key: string }[] = [];
  if (by === "word") {
    children.split(/(\s+)/).forEach((chunk, i) => {
      tokens.push({ text: chunk, key: `w-${i}-${chunk}` });
    });
  } else {
    children.split("").forEach((ch, i) => {
      tokens.push({ text: ch, key: `l-${i}-${ch}` });
    });
  }

  let animatedIndex = 0;

  return (
    <Host className={className} aria-label={children}>
      {tokens.map((tok) => {
        const isWhitespace = /^\s+$/.test(tok.text);
        if (isWhitespace) {
          // Render whitespace as plain text so the layout stays
          // identical to the unsplit string.
          return (
            <span key={tok.key} aria-hidden>
              {tok.text}
            </span>
          );
        }
        const i = animatedIndex++;
        return (
          <span
            key={tok.key}
            aria-hidden
            // inline-block is what lets transform: translateY work on
            // an inline element. The wrapper preserves layout while
            // the inner span tweens.
            className="inline-block overflow-hidden align-baseline whitespace-pre"
          >
            <motion.span
              className="inline-block"
              initial={{ y: yFrom, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once, margin: "-10% 0px" }}
              transition={{
                duration,
                delay: delay + i * stagger,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {tok.text}
            </motion.span>
          </span>
        );
      })}
    </Host>
  );
};

export default SplitText;
