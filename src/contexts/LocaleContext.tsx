import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { dictionaries, type Locale, type TranslationKey } from "@/lib/i18n";

const STORAGE_KEY = "canvhub_locale";

interface LocaleContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextType | null>(null);

const readInitial = (): Locale => {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "tl") return stored;
  const lang = navigator.language?.toLowerCase() || "";
  if (lang.startsWith("tl") || lang.startsWith("fil")) return "tl";
  return "en";
};

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitial);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "tl" ? "fil" : "en";
    }
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] || dictionaries.en;
      const fallback = dictionaries.en;
      let str = dict[key] ?? fallback[key] ?? key;
      if (vars) {
        for (const k of Object.keys(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
        }
      }
      return str;
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextType {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
