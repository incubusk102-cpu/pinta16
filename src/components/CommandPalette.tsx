import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Search,
  ArrowRight,
  Hash,
  Compass,
  Clock,
  CornerDownLeft,
} from "lucide-react";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useProducts } from "@/contexts/ProductContext";
import { getStorefrontArtworks } from "@/lib/artworks";
import { useUserAuth } from "@/contexts/UserAuthContext";

/**
 * Storefront command palette. Mounted once at the root; opens on
 * Cmd+K / Ctrl+K / `/` (see `CommandPaletteContext`), via the search
 * button in `GalleryNav`, or programmatically.
 *
 * The palette searches three kinds of result:
 * 1. **Paintings** — fuzzy match against title, medium, year,
 *    category. Built from `getStorefrontArtworks(products)` so
 *    custom uploads + built-in defaults are both reachable.
 * 2. **Site sections** — hard-coded navigation targets (Collection,
 *    Account, Wishlist, Track order, etc.).
 * 3. **Recent searches** — last 5 successful queries, persisted to
 *    `localStorage` under `canvhub_palette_recent_v1` (clears on
 *    visitor-initiated "Clear").
 *
 * Keyboard model mirrors macOS Spotlight: ↑/↓ navigates, Enter opens,
 * Esc closes. The first list item is auto-selected when the query
 * changes so Enter always does something useful.
 */

const RECENT_KEY = "canvhub_palette_recent_v1";
const RECENT_LIMIT = 5;

type SectionRoute = "/" | "/collection" | "/track" | "/signup" | "/account";

type PaletteAction =
  | { kind: "section"; route: SectionRoute }
  | { kind: "painting"; productId: string }
  | { kind: "recent"; query: string };

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  /** Optional image to render next to the row. Painting results only. */
  image?: string;
  /** Destination encoded as a discriminated action so the typed
   *  TanStack `navigate` API can be called with the right params. */
  action: PaletteAction;
  /** Used as the recent-search key when the visitor opens this row. */
  recentLabel?: string;
}

interface SiteSection {
  id: string;
  label: string;
  hint: string;
  route: SectionRoute;
}

function buildSiteSections(opts: { signedIn: boolean }): SiteSection[] {
  const base: SiteSection[] = [
    { id: "home", label: "Home", hint: "Editorial landing", route: "/" },
    {
      id: "collection",
      label: "Collection",
      hint: "Browse every painting",
      route: "/collection",
    },
    {
      id: "track",
      label: "Track order",
      hint: "Live status by order ID",
      route: "/track",
    },
    {
      id: "signup",
      label: "Sign up",
      hint: "Create a Canvas Hub account",
      route: "/signup",
    },
  ];
  if (opts.signedIn) {
    base.splice(2, 0, {
      id: "account",
      label: "Account",
      hint: "Profile, wishlist, addresses",
      route: "/account",
    });
  }
  return base;
}

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // localStorage may be unavailable (Safari private). Recent
    // searches just don't persist — palette still works.
  }
}

function normalise(value: string): string {
  return value.toLowerCase().trim();
}

function matchScore(haystack: string, needle: string): number {
  // Cheap fuzzy scorer — higher is better. Exact prefix > word
  // boundary > substring > characters in order.
  const h = normalise(haystack);
  const n = normalise(needle);
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 90;
  const wordStart = h.split(/\s+/).some((word) => word.startsWith(n));
  if (wordStart) return 70;
  if (h.includes(n)) return 50;
  // Character-order check: every character in n appears in h in order.
  let hi = 0;
  for (let i = 0; i < n.length; i += 1) {
    const c = n[i];
    hi = h.indexOf(c, hi);
    if (hi === -1) return 0;
    hi += 1;
  }
  return 20;
}

export default function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const { products } = useProducts();
  const { user } = useUserAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  // Close the palette automatically on route changes so the visitor
  // never sees an orphan modal after navigating away (e.g. tapping
  // a result on a slow connection while the route is mid-load).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  const sections = useMemo(
    () => buildSiteSections({ signedIn: Boolean(user) }),
    [user],
  );

  const paintings = useMemo(() => {
    const arts = getStorefrontArtworks(products, {
      vipEarlyAccess: Boolean(user?.vipEarlyAccess),
    });
    return arts.map((a) => ({
      id: a.id,
      title: a.title,
      medium: a.medium,
      year: a.year,
      category: a.category ?? "",
      image: a.image,
    }));
  }, [products, user?.vipEarlyAccess]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    if (!q) {
      // No query yet — surface recent searches + a handful of section
      // shortcuts so the palette never feels empty. Recent searches
      // are rehydrated through the input on Enter so the visitor can
      // refine without retyping.
      const recentItems: PaletteItem[] = recent.map((label) => ({
        id: `recent:${label}`,
        label,
        action: { kind: "recent", query: label },
        recentLabel: label,
      }));
      const sectionItems: PaletteItem[] = sections.map((s) => ({
        id: `section:${s.id}`,
        label: s.label,
        hint: s.hint,
        action: { kind: "section", route: s.route },
        recentLabel: s.label,
      }));
      return [...recentItems, ...sectionItems];
    }
    const sectionMatches: PaletteItem[] = sections
      .map((s) => ({
        section: s,
        score: Math.max(matchScore(s.label, q), matchScore(s.hint, q)),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => ({
        id: `section:${entry.section.id}`,
        label: entry.section.label,
        hint: entry.section.hint,
        action: { kind: "section", route: entry.section.route },
        recentLabel: entry.section.label,
      }));
    const paintingMatches: PaletteItem[] = paintings
      .map((p) => {
        const score = Math.max(
          matchScore(p.title, q),
          // Lower-weighted facets — divide the score so a title hit
          // always beats a medium / year hit of equal "type".
          Math.floor(matchScore(p.medium, q) * 0.7),
          Math.floor(matchScore(p.year, q) * 0.6),
          Math.floor(matchScore(p.category, q) * 0.6),
        );
        return { p, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => ({
        id: `painting:${entry.p.id}`,
        label: entry.p.title,
        hint: `${entry.p.medium} · ${entry.p.year}`,
        image: entry.p.image,
        action: { kind: "painting", productId: entry.p.id },
        recentLabel: entry.p.title,
      }));
    return [...paintingMatches, ...sectionMatches];
  }, [query, recent, sections, paintings]);

  useEffect(() => {
    if (!isOpen) return;
    // Reset query + selection each time the palette opens so the
    // visitor starts from a clean slate. Focus the input on the next
    // tick — opening can coincide with the closing keystroke of a
    // shortcut, and focusing too early gets pre-empted by browser
    // default handling on some platforms.
    setQuery("");
    setActiveIndex(0);
    setRecent(readRecent());
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) close();
    // We deliberately exclude `close` from deps — `useCallback` keeps
    // its identity stable, and listening on pathname alone is the
    // intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const commit = useCallback(
    (item: PaletteItem) => {
      // Recent-search rows just rehydrate the input so the visitor
      // can refine without retyping; section / painting rows close
      // the palette and route.
      if (item.action.kind === "recent") {
        setQuery(item.action.query);
        return;
      }
      if (item.recentLabel) {
        const next = [
          item.recentLabel,
          ...recent.filter((r) => r !== item.recentLabel),
        ].slice(0, RECENT_LIMIT);
        setRecent(next);
        writeRecent(next);
      }
      close();
      if (item.action.kind === "section") {
        void navigate({ to: item.action.route });
      } else {
        void navigate({
          to: "/product/$id",
          params: { id: item.action.productId },
        });
      }
    },
    [close, navigate, recent],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) commit(item);
      }
    },
    [activeIndex, items, commit, close],
  );

  const overlayMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
  const panelMotion = reduceMotion
    ? {
        initial: false,
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 0 },
      }
    : {
        initial: { opacity: 0, y: -16, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -8, scale: 0.98 },
      };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          {...overlayMotion}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[150] flex items-start justify-center px-4 pt-[12vh] sm:pt-[16vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onClick={close}
        >
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
          <motion.div
            {...panelMotion}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl bg-background border border-border/60 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
              <Search
                aria-hidden
                className="w-4 h-4 text-muted-foreground shrink-0"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search paintings, sections, anything…"
                className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
                aria-label="Search the storefront"
              />
              <kbd className="hidden sm:inline-flex items-center text-[10px] tracking-[0.2em] uppercase text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">
                Esc
              </kbd>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto py-2" role="listbox">
              {items.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No matches for "{query}".
                </li>
              )}
              {items.map((item, index) => {
                const active = index === activeIndex;
                const Icon =
                  item.action.kind === "painting"
                    ? Hash
                    : item.action.kind === "section"
                      ? Compass
                      : Clock;
                return (
                  <li key={item.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(item)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        active
                          ? "bg-accent/60"
                          : "bg-transparent hover:bg-accent/30"
                      }`}
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="w-9 h-9 object-cover rounded-sm shrink-0"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="w-9 h-9 rounded-sm bg-foreground/5 flex items-center justify-center shrink-0">
                          <Icon
                            aria-hidden
                            className="w-4 h-4 text-muted-foreground"
                          />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground truncate">
                          {item.label}
                        </span>
                        {item.hint && (
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {item.hint}
                          </span>
                        )}
                      </span>
                      {active ? (
                        <CornerDownLeft
                          aria-hidden
                          className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                        />
                      ) : (
                        <ArrowRight
                          aria-hidden
                          className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground shrink-0"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-border/40 text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
              <span className="hidden sm:inline">
                <kbd className="border border-border/50 rounded px-1">↑</kbd>{" "}
                <kbd className="border border-border/50 rounded px-1">↓</kbd> to
                move ·{" "}
                <kbd className="border border-border/50 rounded px-1">↵</kbd> to
                open
              </span>
              {recent.length > 0 && !query && (
                <button
                  type="button"
                  onClick={() => {
                    setRecent([]);
                    writeRecent([]);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear recents
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
