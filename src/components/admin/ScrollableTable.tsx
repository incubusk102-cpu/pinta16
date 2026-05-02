import { useEffect, useRef, useState, type ReactNode } from "react";

// Wraps an `overflow-x-auto` table so visitors on smaller screens
// (especially tablet/mobile in landscape) get an unmistakable hint that
// the content scrolls horizontally. Two affordances:
//
//   1. A right-edge fade gradient that hides itself once the user reaches
//      the end of the scroll. The gradient signals "there's more →" the
//      same way modern apps do.
//   2. A subtle "Scroll →" caption rendered above the table, only when
//      the content actually overflows. We measure scrollWidth vs
//      clientWidth and listen for resize to keep it accurate.
//
// Doesn't change the existing table markup at all — call sites pass the
// table (or any wide content) as children, and we keep the same
// `overflow-x-auto` behaviour they had before.

interface ScrollableTableProps {
  children: ReactNode;
  className?: string;
  // When true, also keeps the legacy edge-bleed pattern some admin
  // sections used (`-mx-2 sm:mx-0`). Most call sites don't need it.
  edgeBleed?: boolean;
  // Override the rounded border styling. Defaults match the existing
  // `rounded-xl border border-border/60` pattern across admin tables.
  bordered?: boolean;
}

const ScrollableTable = ({
  children,
  className = "",
  edgeBleed = false,
  bordered = true,
}: ScrollableTableProps) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [overflowsRight, setOverflowsRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      const overflows = el.scrollWidth > el.clientWidth + 1;
      setHasOverflow(overflows);
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      setOverflowsRight(overflows && !atEnd);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [children]);

  const wrapperClasses = [
    "relative",
    bordered ? "rounded-xl border border-border/60" : "",
    edgeBleed ? "-mx-2 sm:mx-0" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      {hasOverflow && (
        <p
          aria-hidden="true"
          className="md:hidden mb-1 text-[10px] tracking-[0.18em] uppercase text-muted-foreground/80"
        >
          Scroll →
        </p>
      )}
      <div className={wrapperClasses}>
        <div
          ref={scrollerRef}
          className={`overflow-x-auto ${bordered ? "rounded-xl" : ""}`}
        >
          {children}
        </div>
        {/* Right-edge fade — only shown while there's content to the right
            of the visible viewport. Pointer-events-none so it doesn't
            block clicks on the underlying table cells. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-background/95 to-transparent transition-opacity duration-200 ${
            overflowsRight ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </div>
  );
};

export default ScrollableTable;
