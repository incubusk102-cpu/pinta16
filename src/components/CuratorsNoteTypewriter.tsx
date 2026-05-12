import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface CuratorsNoteTypewriterProps {
  /** The description / curator's note text to reveal. */
  text: string;
  /** Optional class applied to the paragraph wrapper. */
  className?: string;
  /** Characters per second. Default 65 — fast enough to feel like
   *  a confident typewriter, slow enough to read the first sentence. */
  charsPerSecond?: number;
  /** Delay (ms) before typing begins, so the headline finishes its
   *  SplitText reveal first. */
  startDelayMs?: number;
}

/**
 * Animated "curator's note" reveal for the product page description.
 *
 * Types out the artwork description one character at a time with a
 * soft caret, and surfaces a tiny "Skip" button to reveal the whole
 * note instantly. Once the typing finishes (or is skipped) the caret
 * fades away and the paragraph reads like static body copy.
 *
 * Honours `prefers-reduced-motion`: with it on we render the entire
 * note immediately and never mount the caret / Skip button. Screen
 * readers always get the full text via an `sr-only` mirror so they
 * never hear the partial string growing character by character.
 */
export default function CuratorsNoteTypewriter({
  text,
  className,
  charsPerSecond = 65,
  startDelayMs = 250,
}: CuratorsNoteTypewriterProps) {
  const reduceMotion = useReducedMotion();
  const [shownChars, setShownChars] = useState(0);
  const [done, setDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Reset and rerun the animation any time the source text changes
  // (e.g. navigating between paintings without unmounting the route).
  const fullLength = text.length;
  const msPerChar = useMemo(
    () => 1000 / Math.max(1, charsPerSecond),
    [charsPerSecond],
  );

  useEffect(() => {
    if (reduceMotion) {
      setShownChars(fullLength);
      setDone(true);
      return;
    }
    setShownChars(0);
    setDone(false);
    startedAtRef.current = null;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      if (startedAtRef.current === null) startedAtRef.current = now;
      const elapsed = now - startedAtRef.current - startDelayMs;
      if (elapsed <= 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const next = Math.min(fullLength, Math.floor(elapsed / msPerChar));
      setShownChars(next);
      if (next < fullLength) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [fullLength, msPerChar, reduceMotion, startDelayMs, text]);

  const handleSkip = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setShownChars(fullLength);
    setDone(true);
  };

  const visible = done ? text : text.slice(0, shownChars);

  return (
    <div className="space-y-2">
      <p
        className={
          className ??
          "font-body text-sm md:text-base text-muted-foreground leading-relaxed first-letter:font-display first-letter:text-3xl first-letter:md:text-4xl first-letter:text-foreground first-letter:float-left first-letter:mr-1.5 first-letter:mt-1 first-letter:leading-none"
        }
        aria-hidden="true"
      >
        {visible}
        {!done && !reduceMotion && (
          <span
            className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-0.5 bg-foreground/70 animate-pulse"
            aria-hidden="true"
          />
        )}
      </p>
      {/* Screen-reader mirror so assistive tech reads the full
          description even while the visible text is still typing. */}
      <span className="sr-only">{text}</span>
      {!done && !reduceMotion && fullLength > 0 && (
        <button
          type="button"
          onClick={handleSkip}
          className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-200"
        >
          Skip
        </button>
      )}
    </div>
  );
}
