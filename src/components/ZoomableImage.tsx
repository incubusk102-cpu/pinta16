import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  WheelEvent as ReactWheelEvent,
} from "react";

interface Props {
  src: string;
  alt: string;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 280;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

/**
 * Pinch + drag + wheel + double-tap zoom for a single image. Mobile uses
 * pinch and drag-to-pan; desktop uses wheel-to-zoom and click-drag-to-pan;
 * double-click / double-tap toggles between fit and 2x.
 */
export default function ZoomableImage({ src, alt, className }: Props) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const lastTapRef = useRef(0);
  const dragStartRef = useRef<{
    pointerId: number;
    startTranslate: Point;
    startPointer: Point;
  } | null>(null);
  const pinchStartRef = useRef<{
    distance: number;
    scale: number;
    translate: Point;
    midpoint: Point;
  } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Reset zoom whenever the image src changes.
  useEffect(() => {
    reset();
  }, [src, reset]);

  const clampTranslate = useCallback(
    (next: Point, nextScale: number): Point => {
      const el = containerRef.current;
      if (!el) return next;
      const { clientWidth, clientHeight } = el;
      const overflowX = (clientWidth * (nextScale - 1)) / 2;
      const overflowY = (clientHeight * (nextScale - 1)) / 2;
      return {
        x: clamp(next.x, -overflowX, overflowX),
        y: clamp(next.y, -overflowY, overflowY),
      };
    },
    [],
  );

  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0025;
    const nextScale = clamp(scale * (1 + delta), MIN_SCALE, MAX_SCALE);
    setScale(nextScale);
    setTranslate((prev) => clampTranslate(prev, nextScale));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      // Detect double-tap.
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        if (scale > 1) reset();
        else {
          setScale(2);
          setTranslate({ x: 0, y: 0 });
        }
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
      dragStartRef.current = {
        pointerId: e.pointerId,
        startTranslate: translate,
        startPointer: { x: e.clientX, y: e.clientY },
      };
      pinchStartRef.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStartRef.current = {
        distance: distance(a, b),
        scale,
        translate,
        midpoint: midpoint(a, b),
      };
      dragStartRef.current = null;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStartRef.current) {
      const [a, b] = Array.from(pointers.current.values());
      const ratio = distance(a, b) / pinchStartRef.current.distance;
      const nextScale = clamp(
        pinchStartRef.current.scale * ratio,
        MIN_SCALE,
        MAX_SCALE,
      );
      setScale(nextScale);
      setTranslate((prev) => clampTranslate(prev, nextScale));
      return;
    }

    if (
      dragStartRef.current &&
      dragStartRef.current.pointerId === e.pointerId
    ) {
      if (scale === 1) return;
      const dx = e.clientX - dragStartRef.current.startPointer.x;
      const dy = e.clientY - dragStartRef.current.startPointer.y;
      const next = {
        x: dragStartRef.current.startTranslate.x + dx,
        y: dragStartRef.current.startTranslate.y + dy,
      };
      setTranslate(clampTranslate(next, scale));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStartRef.current = null;
    if (
      dragStartRef.current &&
      dragStartRef.current.pointerId === e.pointerId
    ) {
      dragStartRef.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden touch-none select-none ${className || ""}`}
      onWheel={handleWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => {
        if (scale > 1) reset();
        else setScale(2);
      }}
      style={{
        cursor: scale > 1 ? "grab" : "zoom-in",
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="eager"
        decoding="async"
        className="w-full h-full object-contain pointer-events-none transition-transform duration-75 ease-out"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
      />
      {scale > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            reset();
          }}
          className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-foreground text-background text-[11px] tracking-[0.2em] uppercase opacity-90 hover:opacity-100"
        >
          Reset
        </button>
      )}
    </div>
  );
}
