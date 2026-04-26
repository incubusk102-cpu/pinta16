import { Globe, Laptop, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import { useLocale } from "@/contexts/LocaleContext";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n";

const themeIcon: Record<Theme, React.ReactNode> = {
  dark: <Moon className="w-4 h-4" />,
  light: <Sun className="w-4 h-4" />,
  system: <Laptop className="w-4 h-4" />,
};

const nextTheme: Record<Theme, Theme> = {
  dark: "light",
  light: "system",
  system: "dark",
};

export default function ThemeLocaleToggle({
  className = "",
}: {
  className?: string;
}) {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="group"
      aria-label="Display preferences"
    >
      <button
        type="button"
        onClick={() => setTheme(nextTheme[theme])}
        className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/60 hover:bg-accent text-foreground"
        aria-label={t("theme.toggle")}
        title={t(
          theme === "dark"
            ? "theme.dark"
            : theme === "light"
              ? "theme.light"
              : "theme.system",
        )}
      >
        {themeIcon[theme]}
      </button>
      <button
        type="button"
        onClick={() => setLocale(locale === "en" ? "tl" : "en")}
        className="inline-flex items-center justify-center gap-1 px-2.5 h-9 rounded-full border border-border/60 hover:bg-accent text-foreground text-[11px] tracking-[0.15em] uppercase"
        aria-label={t("locale.toggle")}
        title={LOCALE_LABELS[locale as Locale]}
      >
        <Globe className="w-3.5 h-3.5" />
        {locale.toUpperCase()}
      </button>
    </div>
  );
}
