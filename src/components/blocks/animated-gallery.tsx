import * as React from "react";
import {
  type HTMLMotionProps,
  type MotionValue,
  type Variants,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

// Motion-scroll gallery primitives — adapted from the 21st.dev
// "Animated Scroll Gallery" block to this repo's conventions
// (framer-motion instead of `motion/react`, `prefers-reduced-motion`
// honoured per AGENTS.md). The pieces compose into a sticky, 3D
// scroll-tilted column grid: as the visitor scrolls the tall
// `ContainerScroll`, the inner `GalleryContainer` rotates from a
// steep tilt up to flat and the columns drift at different speeds,
// giving the homepage a depth-rich "swipe through the wall" feel
// driven entirely by scroll — no pagination, no buttons.

interface ContainerScrollContextValue {
  scrollYProgress: MotionValue<number>;
  reduced: boolean;
}

const SPRING_CONFIG = {
  type: "spring" as const,
  stiffness: 100,
  damping: 16,
  mass: 0.75,
  restDelta: 0.005,
};

const blurVariants: Variants = {
  hidden: { filter: "blur(10px)", opacity: 0, y: 12 },
  visible: { filter: "blur(0px)", opacity: 1, y: 0 },
};

const ContainerScrollContext = React.createContext<
  ContainerScrollContextValue | undefined
>(undefined);

function useContainerScrollContext() {
  const context = React.useContext(ContainerScrollContext);
  if (!context) {
    throw new Error(
      "useContainerScrollContext must be used within a ContainerScroll component",
    );
  }
  return context;
}

export const ContainerScroll = ({
  children,
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const { scrollYProgress: rawProgress } = useScroll({ target: scrollRef });
  // Route the progress value through an identity transform. `useScroll`
  // tags its progress value with an `accelerate` config when the browser
  // supports ScrollTimeline; any range-based `useTransform` derived from
  // it then inherits that config and is handed to WAAPI with our input
  // range as keyframe offsets. Offsets outside [0,1] make WAAPI throw.
  // A function transform doesn't propagate `accelerate`, so downstream
  // transforms run on the JS frameloop — reliable and clamp-aware.
  const scrollYProgress = useTransform(rawProgress, (v) => v);
  return (
    <ContainerScrollContext.Provider value={{ scrollYProgress, reduced }}>
      <div
        ref={scrollRef}
        className={cn("relative min-h-[120vh]", className)}
        style={{
          perspective: "1000px",
          perspectiveOrigin: "center top",
          transformStyle: "preserve-3d",
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    </ContainerScrollContext.Provider>
  );
};
ContainerScroll.displayName = "ContainerScroll";

export const ContainerSticky = ({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        "sticky left-0 top-0 min-h-[30rem] w-full overflow-hidden",
        className,
      )}
      style={{
        perspective: "1000px",
        perspectiveOrigin: "center top",
        transformStyle: "preserve-3d",
        transformOrigin: "50% 50%",
        ...style,
      }}
      {...props}
    />
  );
};
ContainerSticky.displayName = "ContainerSticky";

export const GalleryContainer = ({
  children,
  className,
  style,
  ...props
}: HTMLMotionProps<"div">) => {
  const { scrollYProgress, reduced } = useContainerScrollContext();
  // Tilt the wall up from a steep 70° rake to flat as the deck enters
  // the viewport, then ease a slight zoom so the artwork meets the
  // visitor head-on. Reduced-motion visitors get a flat, static grid.
  const rotateX = useTransform(scrollYProgress, [0, 0.5], [70, 0]);
  const scale = useTransform(scrollYProgress, [0.5, 0.9], [1.15, 1]);

  return (
    <motion.div
      className={cn(
        "relative grid size-full grid-cols-3 gap-2 rounded-2xl sm:gap-3",
        className,
      )}
      style={
        reduced
          ? { transformStyle: "preserve-3d", ...style }
          : {
              rotateX,
              scale,
              transformStyle: "preserve-3d",
              perspective: "1000px",
              ...style,
            }
      }
      {...props}
    >
      {children}
    </motion.div>
  );
};
GalleryContainer.displayName = "GalleryContainer";

export const GalleryCol = ({
  className,
  style,
  yRange = ["0%", "-10%"],
  ...props
}: HTMLMotionProps<"div"> & { yRange?: [string, string] }) => {
  const { scrollYProgress, reduced } = useContainerScrollContext();
  const y = useTransform(scrollYProgress, [0.5, 1], yRange);

  return (
    <motion.div
      className={cn("relative flex w-full flex-col gap-2 sm:gap-3", className)}
      style={reduced ? style : { y, ...style }}
      {...props}
    />
  );
};
GalleryCol.displayName = "GalleryCol";

export const ContainerStagger = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div">
>(({ className, viewport, transition, ...props }, ref) => {
  return (
    <motion.div
      className={cn("relative", className)}
      ref={ref}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, ...viewport }}
      transition={{
        staggerChildren: transition?.staggerChildren ?? 0.18,
        ...transition,
      }}
      {...props}
    />
  );
});
ContainerStagger.displayName = "ContainerStagger";

export const ContainerAnimated = React.forwardRef<
  HTMLDivElement,
  HTMLMotionProps<"div">
>(({ className, transition, ...props }, ref) => {
  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      variants={blurVariants}
      transition={transition ?? SPRING_CONFIG}
      {...props}
    />
  );
});
ContainerAnimated.displayName = "ContainerAnimated";
