import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type PointerEvent,
  type ReactNode,
} from "react";

interface MagneticButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof motion.button>,
  "ref"
> {
  children: ReactNode;
  /**
   * Maximum pixel offset the element travels toward the cursor.
   * Default 10 px is the apple.com sweet spot — visible polish, never
   * looks broken on slow trackpads or low-DPI screens.
   */
  strength?: number;
}

/**
 * A button that subtly tilts toward the pointer when the cursor
 * enters its bounds, like the CTAs on apple.com. Dropped in
 * everywhere a regular `<button>` would go — passes through every
 * standard prop / event / class.
 *
 * Disabled automatically on touch devices (no hover state) and on
 * `prefers-reduced-motion: reduce`.
 */
const MagneticButton = forwardRef<HTMLButtonElement, MagneticButtonProps>(
  (
    { children, strength = 10, onPointerMove, onPointerLeave, style, ...rest },
    ref,
  ) => {
    const reduce = useReducedMotion();
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const springConfig = { stiffness: 220, damping: 18, mass: 0.4 };
    const sx = useSpring(x, springConfig);
    const sy = useSpring(y, springConfig);

    const handleMove = (e: PointerEvent<HTMLButtonElement>) => {
      onPointerMove?.(e);
      if (reduce || e.pointerType !== "mouse") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = (e.clientX - rect.left) / rect.width - 0.5;
      const dy = (e.clientY - rect.top) / rect.height - 0.5;
      x.set(dx * strength * 2);
      y.set(dy * strength * 2);
    };

    const handleLeave = (e: PointerEvent<HTMLButtonElement>) => {
      onPointerLeave?.(e);
      x.set(0);
      y.set(0);
    };

    return (
      <motion.button
        ref={ref}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        style={reduce ? style : { ...style, x: sx, y: sy }}
        {...rest}
      >
        {children}
      </motion.button>
    );
  },
);

MagneticButton.displayName = "MagneticButton";

export default MagneticButton;
