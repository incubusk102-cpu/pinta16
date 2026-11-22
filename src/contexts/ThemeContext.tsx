import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { manilaIsDaytime } from "@/lib/sunset";

export type Theme = "dark" | "light" | "system" | "sunset";

const STORAGE_KEY = "canvhub_theme";

interface ThemeContextType {
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const readSystem = (): "dark" | "light" => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
};

const apply = (resolved: "dark" | "light") => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
  // Update theme-color meta so the browser chrome matches.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "light" ? "#f5f3ee" : "#1c1c1c");
  }
};

const isStoredTheme = (value: string | null): value is Theme =>
  value === "dark" ||
  value === "light" ||
  value === "system" ||
  value === "sunset";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isStoredTheme(stored)) return stored;
    return "dark";
  });
  const [systemResolved, setSystemResolved] = useState<"dark" | "light">(
    readSystem,
  );
  // For `theme === 'sunset'`, the actual resolved value flips between
  // light and dark at Manila sunrise / sunset. We re-evaluate on
  // mount and schedule a single timeout for the next boundary; the
  // boundary fires `setSunsetResolved` which restarts the cycle.
  const [sunsetResolved, setSunsetResolved] = useState<"dark" | "light">(() =>
    manilaIsDaytime().isDay ? "light" : "dark",
  );

  const resolved =
    theme === "system"
      ? systemResolved
      : theme === "sunset"
        ? sunsetResolved
        : theme;

  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  // Listen for OS-level changes when theme === "system".
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => setSystemResolved(readSystem());
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const order: Theme[] = ["dark", "light", "system", "sunset"];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Sunset mode: schedule a single timeout to flip at the next
  // sunrise / sunset boundary. We re-arm after every flip and tear
  // down whenever the user picks a different theme.
  useEffect(() => {
    if (theme !== "sunset") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      const { isDay, nextBoundary } = manilaIsDaytime();
      setSunsetResolved(isDay ? "light" : "dark");
      // Wake again ~10s after the boundary so jitter / clock drift
      // can't leave us a few seconds early.
      const delay = Math.max(1000, nextBoundary.getTime() - Date.now() + 10000);
      timer = setTimeout(tick, delay);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [theme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
