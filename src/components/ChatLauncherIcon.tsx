import { useEffect, useRef } from "react";
import gsap from "gsap";
import { animate } from "animejs";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface ChatLauncherIconProps {
  /**
   * When true, the icon switches into "attention" mode: idle bob
   * speeds up, the three dots cascade-flash, and a single sparkle
   * burst fires the moment unread arrives. Mirrors the cart-icon
   * sparkle vocabulary shipped in #469.
   */
  unread?: boolean;
}

/**
 * Custom brush-stroke chat-bubble icon for the storefront chat
 * launcher. Designed to feel hand-painted (matches the gallery
 * aesthetic) and animated via GSAP + anime.js layered on top of
 * the existing framer-motion baseline that owns the launcher's
 * hover/tap scale and unread-badge crossfade.
 *
 * Motion layers (all silent under prefers-reduced-motion):
 * - GSAP: stroke-draws the bubble outline on mount via
 *   `strokeDashoffset`, then idle-shimmers a highlight gradient
 *   along the stroke every ~6s.
 * - GSAP: the three typing dots cascade-fade on a 2.4s loop so the
 *   button reads as "alive" even with no unread.
 * - anime.js: when `unread` flips true, fires a single 6-particle
 *   sparkle burst around the icon (orange-pink-cyan palette,
 *   reused from CartIconSparkle) and accelerates the dot cascade.
 */
const ChatLauncherIcon = ({ unread = false }: ChatLauncherIconProps) => {
  const hostRef = useRef<SVGSVGElement | null>(null);
  const strokeRef = useRef<SVGPathElement | null>(null);
  const highlightRef = useRef<SVGPathElement | null>(null);
  const dot1Ref = useRef<SVGCircleElement | null>(null);
  const dot2Ref = useRef<SVGCircleElement | null>(null);
  const dot3Ref = useRef<SVGCircleElement | null>(null);
  // Track the previous unread state so the sparkle burst only
  // fires on the transition (false → true), not on every re-render
  // while the chat sits unread.
  const lastUnreadRef = useRef<boolean>(false);

  // Stroke-draw on mount + idle highlight loop. Pinned to an empty
  // dep array because the visual targets are refs and the easing
  // curve is constant — re-running on every render would restart
  // the draw mid-flight.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    if (!host) return;

    const ctx = gsap.context(() => {
      const stroke = strokeRef.current;
      const highlight = highlightRef.current;
      if (stroke) {
        const length = stroke.getTotalLength();
        gsap.set(stroke, {
          strokeDasharray: length,
          strokeDashoffset: length,
        });
        gsap.to(stroke, {
          strokeDashoffset: 0,
          duration: 0.7,
          ease: "power2.out",
        });
      }
      if (highlight) {
        const length = highlight.getTotalLength();
        gsap.set(highlight, {
          strokeDasharray: `${length * 0.18} ${length}`,
          strokeDashoffset: length,
          opacity: 0,
        });
        // Slow shimmer that travels along the stroke, fades in for
        // the first third of the loop and out for the last third.
        // 6s feels present without being twitchy.
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 2 });
        tl.to(highlight, { opacity: 1, duration: 0.6 }, 0)
          .to(
            highlight,
            { strokeDashoffset: -length, duration: 3, ease: "none" },
            0,
          )
          .to(highlight, { opacity: 0, duration: 0.6 }, 2.4);
      }
    }, host);

    return () => {
      ctx.revert();
    };
  }, []);

  // Cascading dot fade. Standalone GSAP context so the unread
  // attention boost can re-target it without disturbing the
  // stroke-draw timeline.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    if (!host) return;
    const dots = [dot1Ref.current, dot2Ref.current, dot3Ref.current].filter(
      (d): d is SVGCircleElement => d !== null,
    );
    if (dots.length === 0) return;

    const ctx = gsap.context(() => {
      // When unread, dots cascade-flash twice as fast and reach a
      // brighter opacity. Without unread they read as a gentle
      // ambient breath.
      const loopDuration = unread ? 1.2 : 2.4;
      const maxOpacity = unread ? 1 : 0.85;
      gsap.set(dots, { opacity: 0.25 });
      gsap.to(dots, {
        opacity: maxOpacity,
        duration: loopDuration / 2,
        ease: "sine.inOut",
        stagger: { each: loopDuration / 6, repeat: -1, yoyo: true },
      });
    }, host);
    return () => {
      ctx.revert();
    };
  }, [unread]);

  // Sparkle burst on the unread transition. Mirrors the
  // CartIconSparkle vocabulary so the storefront speaks the same
  // motion language across cart + chat surfaces.
  useEffect(() => {
    const prev = lastUnreadRef.current;
    lastUnreadRef.current = unread;
    if (!unread || prev) return;
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const colors = [
      "rgba(253,224,71,0.95)", // yellow-300
      "rgba(251,191,36,0.95)", // amber-400
      "rgba(244,114,182,0.9)", // pink-400
      "rgba(165,243,252,0.9)", // cyan-200
    ];
    for (let i = 0; i < 6; i += 1) {
      const sparkle = document.createElement("span");
      const angle = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.4;
      const distance = 22 + Math.random() * 12;
      const size = 4 + Math.random() * 3;
      sparkle.setAttribute("aria-hidden", "true");
      sparkle.style.cssText = `position:fixed;top:${cy - size / 2}px;left:${cx - size / 2}px;width:${size}px;height:${size}px;border-radius:9999px;background:${colors[i % colors.length]};box-shadow:0 0 10px ${colors[i % colors.length]};pointer-events:none;z-index:9999;will-change:transform,opacity;`;
      document.body.appendChild(sparkle);
      animate(sparkle, {
        translateX: Math.cos(angle) * distance,
        translateY: Math.sin(angle) * distance,
        scale: [0.5, 1.1, 0.4],
        opacity: [1, 1, 0],
        duration: 620 + Math.random() * 160,
        ease: "outQuad",
        onComplete: () => {
          sparkle.remove();
        },
      });
    }
  }, [unread]);

  return (
    <svg
      ref={hostRef}
      width="24"
      height="24"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      // Slight tilt makes the brush-stroke feel hand-painted rather
      // than centred on a grid.
      className="rotate-[-4deg]"
    >
      {/* Brush-stroke bubble outline. Two close points at the tail
          give a tapered tip that reads as a speech-bubble pointer
          rather than a balloon. */}
      <path
        ref={strokeRef}
        d="M7 11 Q7 6.5 12 6.5 L21 6.5 Q26 6.5 26 11 L26 17 Q26 21.5 21 21.5 L14 21.5 L10 25 L11 21.4 Q7 21 7 17 Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Highlight stroke — narrower and translucent, rides on top
          of the outline so the GSAP shimmer reads as a brush
          glimmer rather than a redraw. */}
      <path
        ref={highlightRef}
        d="M7 11 Q7 6.5 12 6.5 L21 6.5 Q26 6.5 26 11 L26 17 Q26 21.5 21 21.5 L14 21.5 L10 25 L11 21.4 Q7 21 7 17 Z"
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Three typing dots — opacity is GSAP-driven so they cascade
          on the idle loop and brighten under unread. */}
      <circle ref={dot1Ref} cx="12" cy="14" r="1.6" fill="currentColor" />
      <circle ref={dot2Ref} cx="16.5" cy="14" r="1.6" fill="currentColor" />
      <circle ref={dot3Ref} cx="21" cy="14" r="1.6" fill="currentColor" />
    </svg>
  );
};

export default ChatLauncherIcon;
