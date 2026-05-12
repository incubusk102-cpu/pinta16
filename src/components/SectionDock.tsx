import { useEffect, useState } from "react";

interface DockItem {
  /** DOM id of the section to scroll to. */
  id: string;
  /** Human-readable label shown on hover / for screen readers. */
  label: string;
}

interface SectionDockProps {
  items: DockItem[];
}

/**
 * Floating right-rail navigation dock for the homepage.
 *
 * Renders a vertical column of small dots fixed to the right edge of
 * the viewport. As the visitor scrolls, the dot for the currently
 * visible section pops to full size + becomes solid gold. Clicking a
 * dot smooth-scrolls to that section. On hover, each dot reveals a
 * label so the visitor knows what they're jumping to.
 *
 * Desktop / `md+` only. On touch / narrow viewports the standard
 * scroll already works fine and we don't want to overlap the
 * existing mobile chrome (`MobileBackToCollection` etc).
 *
 * Hidden until at least one of the target sections has actually
 * mounted — avoids a "ghost rail" of dots that scroll to nothing
 * when one of the lazy-loaded sections hasn't hydrated yet.
 */
export default function SectionDock({ items }: SectionDockProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mountedIds, setMountedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Poll for newly-mounted lazy sections every ~400ms for the first
    // ~6s of the page life. The homepage lazy-loads several below-the
    // -fold sections; an IntersectionObserver only fires once the
    // element exists in the DOM. We don't want to MutationObserver the
    // whole body (expensive) so a short bounded poll is plenty.
    let ticks = 0;
    const interval = window.setInterval(() => {
      const found = new Set<string>();
      items.forEach((item) => {
        if (document.getElementById(item.id)) found.add(item.id);
      });
      setMountedIds((prev) => {
        if (
          prev.size === found.size &&
          [...prev].every((id) => found.has(id))
        ) {
          return prev;
        }
        return found;
      });
      ticks += 1;
      if (ticks > 15) window.clearInterval(interval);
    }, 400);

    return () => window.clearInterval(interval);
  }, [items]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mountedIds.size === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry that is most visible (largest ratio). This
        // beats "first matching entry" when two sections overlap
        // briefly during the scroll handover between them.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Anchor the "active" band to the upper half of the viewport
        // so the dock highlights the section the visitor is reading,
        // not the one barely peeking in from the bottom.
        rootMargin: "-30% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items, mountedIds]);

  const handleJump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  };

  const visibleItems = items.filter((item) => mountedIds.has(item.id));
  if (visibleItems.length < 2) return null;

  return (
    <nav
      aria-label="Page sections"
      className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-30 flex-col items-end gap-3 pointer-events-none"
    >
      {visibleItems.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleJump(item.id)}
            className="group pointer-events-auto flex items-center gap-2 px-1 py-1"
            aria-label={`Jump to ${item.label}`}
            aria-current={active ? "true" : undefined}
          >
            <span
              className={`opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 font-body text-[10px] tracking-[0.25em] uppercase whitespace-nowrap ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {item.label}
            </span>
            <span
              className={`block rounded-full transition-all duration-300 ${
                active
                  ? "w-2.5 h-2.5 bg-foreground"
                  : "w-1.5 h-1.5 bg-foreground/30 group-hover:bg-foreground/60"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}
