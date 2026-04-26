import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type HeroAlign = "left" | "center" | "right";
export type HeroTransition = "fade" | "slide" | "kenburns";

export interface HeroSlide {
  id: string;
  image: string;
  eyebrow: string;
  headline: string;
  subtext: string;
  ctaLabel: string;
  ctaHref: string;
  align: HeroAlign;
}

export interface HeroSettings {
  autoplay: boolean;
  intervalMs: number;
  transition: HeroTransition;
}

interface ContextType {
  slides: HeroSlide[];
  settings: HeroSettings;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_SETTINGS: HeroSettings = {
  autoplay: true,
  intervalMs: 6000,
  transition: "kenburns",
};

const HeroSlidesContext = createContext<ContextType | undefined>(undefined);

export const HeroSlidesProvider = ({ children }: { children: ReactNode }) => {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [settings, setSettings] = useState<HeroSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/hero-slides");
      if (!res.ok) return;
      const data = (await res.json()) as {
        slides?: HeroSlide[];
        settings?: Partial<HeroSettings>;
      };
      if (Array.isArray(data.slides)) setSlides(data.slides);
      if (data.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch {
      // keep current values
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <HeroSlidesContext.Provider value={{ slides, settings, loading, refresh }}>
      {children}
    </HeroSlidesContext.Provider>
  );
};

export const useHeroSlides = () => {
  const ctx = useContext(HeroSlidesContext);
  if (!ctx) {
    throw new Error("useHeroSlides must be used within HeroSlidesProvider");
  }
  return ctx;
};
