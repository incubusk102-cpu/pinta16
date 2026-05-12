import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Keyboard, X } from "lucide-react";

interface Shortcut {
  /** Visible key combination, e.g. ["⌘", "K"] or ["?"]. */
  keys: string[];
  /** What pressing it does. */
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["⌘", "K"], description: "Open the command palette" },
  {
    keys: ["Ctrl", "K"],
    description: "Open the command palette (Windows / Linux)",
  },
  { keys: ["/"], description: "Open the command palette" },
  { keys: ["?"], description: "Show this shortcuts overlay" },
  { keys: ["Esc"], description: "Close any open dialog or drawer" },
];

/**
 * Lightweight keyboard-shortcuts cheat-sheet, opened by pressing `?`.
 *
 * Mounted once at the route root. Listens for plain `?` presses
 * outside of typing surfaces (input / textarea / contenteditable) so
 * the overlay never fires while the visitor is typing into the
 * command palette, a checkout field, or the new painting-notes
 * textarea. Esc closes the overlay.
 *
 * Pure presentation — does not bind or override the actual shortcuts
 * documented; those are owned by `CommandPalette` and friends. The
 * overlay just teaches new visitors what already exists.
 */
export default function KeyboardShortcutsOverlay() {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "?") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      // Some keyboards emit `?` only when Shift is held; either way
      // the `e.key === "?"` check above is the source of truth.
      e.preventDefault();
      setOpen((o) => !o);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const backdropMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
  const cardMotion = reduceMotion
    ? {
        initial: false,
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, y: 8 },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...backdropMotion}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="kbd-shortcuts-title"
          className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            {...cardMotion}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background border border-border/60 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <Keyboard className="w-4 h-4 text-muted-foreground shrink-0" />
                <h2
                  id="kbd-shortcuts-title"
                  className="font-display text-lg text-foreground truncate"
                >
                  Keyboard shortcuts
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close shortcuts overlay"
                className="text-muted-foreground hover:text-foreground transition-colors duration-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-border/30">
              {SHORTCUTS.map((s) => (
                <li
                  key={`${s.keys.join("+")}-${s.description}`}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <span className="font-body text-sm text-foreground">
                    {s.description}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {s.keys.map((k, i) => (
                      <kbd
                        key={`${k}-${i}`}
                        className="px-1.5 py-0.5 rounded-sm border border-border/60 bg-muted/40 font-body text-[11px] text-foreground"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-border/40">
              <p className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                Press{" "}
                <kbd className="px-1 py-0.5 rounded-sm border border-border/60 bg-muted/40 font-body text-[10px]">
                  Esc
                </kbd>{" "}
                to close ·{" "}
                <kbd className="px-1 py-0.5 rounded-sm border border-border/60 bg-muted/40 font-body text-[10px]">
                  ?
                </kbd>{" "}
                to reopen
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
