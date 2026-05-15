import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search, ChevronDown, Globe } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";

// Floating, segmented "pill" navigation inspired by editorial studio
// sites (Floema, Active Theory, Bruno Simon). Sits fixed at the top
// of every storefront route. Hides under `/admin` (rendered conditionally
// from __root.tsx) so the admin tool stays free of marketing chrome.
//
// Layout:
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Canvas Hub®   [🔍]              [ Paintings  Studio  …  ]  EN▾│
//   └──────────────────────────────────────────────────────────────┘
//
// All segments are anchor links to the homepage's existing section
// ids (`#about`, `#reviews`, `#contact`) so the redesigned hero is
// the entry point but the rest of the editorial homepage is reachable
// from anywhere on the site.

interface NavItem {
  label: string;
  /** Either a TanStack-Router internal route (`to`) or an anchor link
   *  on the homepage (`href`). Anchor links route to `/` first if the
   *  visitor is on another page, then scroll to the section. */
  to?: string;
  href?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Paintings", to: "/collection" },
  { label: "Studio", href: "/#about" },
  { label: "Artists", href: "/#reviews" },
  { label: "Journal", href: "/#home-marquee" },
];

const SCROLL_REVEAL_PX = 12;

const FloemaNav = () => {
  const { locale, setLocale } = useLocale();
  const { open: openCommandPalette } = useCommandPalette();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [scrolled, setScrolled] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > SCROLL_REVEAL_PX);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the language popover when navigating between routes.
  useEffect(() => {
    setLangOpen(false);
  }, [pathname]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 pointer-events-none"
      aria-label="Primary"
    >
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5 md:px-10 md:pt-6">
        {/* Brand mark — left pill */}
        <Link
          to="/"
          aria-label="Canvas Hub — home"
          className={`pointer-events-auto group inline-flex items-center gap-2 rounded-full border border-foreground/8 bg-background/70 px-4 py-2 font-display text-base tracking-tight text-foreground shadow-[0_2px_18px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all duration-500 hover:bg-background/90 motion-reduce:transition-none ${
            scrolled ? "translate-y-0 opacity-100" : "opacity-95"
          }`}
        >
          <span className="font-logo text-[1.05rem] leading-none">C</span>
          <span className="hidden text-[0.95rem] font-medium sm:inline">
            Canvas&nbsp;Hub
          </span>
          <span className="text-[0.65rem] align-top text-muted-foreground">
            ®
          </span>
          <span
            aria-hidden="true"
            className="ml-1 hidden h-4 w-px bg-foreground/20 sm:inline-block"
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openCommandPalette();
            }}
            aria-label="Open command palette"
            className="pointer-events-auto hidden h-7 w-7 items-center justify-center rounded-full text-foreground/70 transition-colors hover:text-foreground sm:inline-flex"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </Link>

        {/* Center segmented pill */}
        <nav
          aria-label="Sections"
          className="pointer-events-auto hidden items-center gap-1 rounded-full border border-foreground/8 bg-background/70 p-1 shadow-[0_2px_18px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md md:inline-flex"
        >
          {NAV_ITEMS.map((item) => {
            const baseClass =
              "rounded-full px-4 py-1.5 text-[0.78rem] font-medium tracking-[0.02em] text-foreground/75 transition-colors duration-300 hover:bg-foreground hover:text-background motion-reduce:transition-none";
            if (item.to) {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`${baseClass} ${
                    active ? "bg-foreground text-background" : ""
                  }`}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <a key={item.label} href={item.href} className={baseClass}>
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Language switcher — right pill */}
        <div className="pointer-events-auto relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            aria-label="Language"
            onClick={() => setLangOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/8 bg-background/70 px-3.5 py-2 text-[0.78rem] font-medium tracking-[0.04em] uppercase text-foreground shadow-[0_2px_18px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors hover:bg-background/90 motion-reduce:transition-none"
          >
            <Globe className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{locale === "tl" ? "FIL" : "EN"}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-300 ${
                langOpen ? "rotate-180" : ""
              }`}
              strokeWidth={2}
            />
          </button>
          {langOpen ? (
            <ul
              role="listbox"
              aria-label="Select language"
              className="absolute right-0 top-full mt-2 min-w-[8.5rem] overflow-hidden rounded-2xl border border-foreground/10 bg-background/95 p-1.5 text-left text-[0.78rem] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.4)] backdrop-blur-md"
            >
              {(
                [
                  { code: "en", label: "English" },
                  { code: "tl", label: "Filipino" },
                ] as const
              ).map((opt) => (
                <li
                  key={opt.code}
                  role="option"
                  aria-selected={locale === opt.code}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLocale(opt.code);
                      setLangOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-foreground/5 ${
                      locale === opt.code
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em]">
                      {opt.code === "tl" ? "FIL" : "EN"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default FloemaNav;
