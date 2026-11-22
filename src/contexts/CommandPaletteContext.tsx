import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Tiny coordinator for the storefront command palette (Cmd+K / Ctrl+K
 * / `/`). Holds the open/closed state and exposes `open()` / `close()`
 * / `toggle()` so any surface (nav button, mobile drawer, deep links)
 * can drive the palette without prop-drilling.
 *
 * The palette UI itself lives in `<CommandPalette />` (mounted once at
 * the root) — this context only manages visibility + the keyboard
 * shortcut. We deliberately keep the input value local to the palette
 * so closing the palette resets the query without ping-ponging through
 * context.
 */

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
}

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined);

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({
  children,
}: CommandPaletteProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Global keyboard shortcut. Listen on `keydown` so the platform
  // modifier (Cmd on macOS, Ctrl on Windows / Linux) plus K, or a
  // bare `/` when no input is focused, opens the palette. Native
  // browser shortcuts (Cmd+Shift+K for history) stay untouched
  // because we ignore events with Shift.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
        return;
      }
      // Slash opens the palette only when the visitor isn't currently
      // typing into something — otherwise it would steal `/` from
      // search inputs and contenteditable surfaces.
      if (e.key === "/" && !isMod) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable = target?.isContentEditable;
        if (
          tag !== "INPUT" &&
          tag !== "TEXTAREA" &&
          tag !== "SELECT" &&
          !editable
        ) {
          e.preventDefault();
          setIsOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, close, toggle, isOpen }),
    [open, close, toggle, isOpen],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider",
    );
  }
  return ctx;
}
