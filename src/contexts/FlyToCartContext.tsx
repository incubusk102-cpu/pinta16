import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Drives the "fly to cart" thumbnail animation: when a visitor clicks
 * an add-to-cart button (from a gallery card, the product page, or
 * any future surface), we project a small thumbnail from the source
 * button's rectangle to the cart icon in the nav. The animation
 * itself is owned here — callers only fire `trigger({ imageUrl,
 * fromRect })` and the provider handles the rest.
 *
 * The cart icon registers its element via `registerCartTarget(ref)`
 * (GalleryNav does this on mount), so the destination rectangle is
 * read at trigger time. Silent under `prefers-reduced-motion` — the
 * cart badge already pulses so the visitor still gets a confirmation
 * cue.
 */

interface FlyTrigger {
  imageUrl: string;
  fromRect: DOMRect;
}

interface InternalFlight {
  /** Monotonically-increasing id so each click renders its own
   *  `motion.img` even when fired in rapid succession. */
  id: number;
  imageUrl: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  endX: number;
  endY: number;
}

interface FlyToCartContextValue {
  trigger: (input: FlyTrigger) => void;
  registerCartTarget: (ref: RefObject<HTMLElement | null>) => void;
}

const FlyToCartContext = createContext<FlyToCartContextValue | undefined>(
  undefined,
);

interface FlyToCartProviderProps {
  children: ReactNode;
}

export function FlyToCartProvider({ children }: FlyToCartProviderProps) {
  const targetRef = useRef<RefObject<HTMLElement | null> | null>(null);
  const idRef = useRef(0);
  const [flights, setFlights] = useState<InternalFlight[]>([]);
  const reduceMotion = useReducedMotion();

  const registerCartTarget = useCallback(
    (ref: RefObject<HTMLElement | null>) => {
      targetRef.current = ref;
    },
    [],
  );

  const trigger = useCallback(
    ({ imageUrl, fromRect }: FlyTrigger) => {
      if (reduceMotion) return;
      // Without a registered cart target (e.g. /admin pages) there's
      // nowhere to fly to. Bail silently — the underlying add-to-cart
      // call still completes through the cart context.
      const targetEl = targetRef.current?.current;
      if (!targetEl) return;
      const toRect = targetEl.getBoundingClientRect();
      idRef.current += 1;
      const flight: InternalFlight = {
        id: idRef.current,
        imageUrl,
        startX: fromRect.left,
        startY: fromRect.top,
        startW: Math.min(fromRect.width, 96),
        startH: Math.min(fromRect.height, 96),
        endX: toRect.left + toRect.width / 2 - 18,
        endY: toRect.top + toRect.height / 2 - 18,
      };
      setFlights((prev) => [...prev, flight]);
    },
    [reduceMotion],
  );

  const dismiss = useCallback((id: number) => {
    setFlights((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Clean up any pending flights when the tab is hidden (browser
  // pauses RAF so the exit animation could otherwise hang).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setFlights([]);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const value = useMemo<FlyToCartContextValue>(
    () => ({ trigger, registerCartTarget }),
    [trigger, registerCartTarget],
  );

  return (
    <FlyToCartContext.Provider value={value}>
      {children}
      <div
        aria-hidden
        // Keep this layer above the cart drawer overlay (z-80) so a
        // rapid second add lands on top, but below toasts (z-[200]).
        className="pointer-events-none fixed inset-0 z-[120]"
      >
        <AnimatePresence>
          {flights.map((flight) => (
            <motion.img
              key={flight.id}
              src={flight.imageUrl}
              alt=""
              initial={{
                x: flight.startX,
                y: flight.startY,
                width: flight.startW,
                height: flight.startH,
                opacity: 0.95,
                borderRadius: 6,
                rotate: 0,
              }}
              animate={{
                x: flight.endX,
                y: flight.endY,
                width: 36,
                height: 36,
                opacity: 0.2,
                borderRadius: 999,
                rotate: 18,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.7, 0.05, 0.2, 1] }}
              onAnimationComplete={() => dismiss(flight.id)}
              className="absolute top-0 left-0 object-cover shadow-xl ring-1 ring-black/10"
            />
          ))}
        </AnimatePresence>
      </div>
    </FlyToCartContext.Provider>
  );
}

export function useFlyToCart(): FlyToCartContextValue {
  const ctx = useContext(FlyToCartContext);
  if (!ctx) {
    throw new Error("useFlyToCart must be used within a FlyToCartProvider");
  }
  return ctx;
}
