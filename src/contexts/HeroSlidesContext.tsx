import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type HeroAlign = "left" | "center" | "right";
export type HeroTransition = "fade" | "slide" | "kenburns";

export interface HeroSlide {
  id: string;
  image: string;
  /** Optional portrait-friendly crop served to viewports < 640px.
   *  When blank, the regular `image` is used at every breakpoint
   *  (the existing behaviour). Useful for landscape paintings that
   *  crop awkwardly on phones. */
  mobileImage: string;
  /** Descriptive alt text for the slide image. Used by screen readers
   *  and crawlers; falls back to headline / eyebrow when blank. Kept
   *  separate from headline because some slides have decorative or
   *  text-on-image art whose accessible description differs from the
   *  visible promo copy. */
  alt: string;
  eyebrow: string;
  headline: string;
  subtext: string;
  ctaLabel: string;
  ctaHref: string;
  align: HeroAlign;
  /** Optional schedule window — ISO 8601 UTC strings. An empty
   *  string means "no boundary". A slide is publicly visible only
   *  when the current UTC time is within [startsAt, endsAt]
   *  (both inclusive). The server filters before the slide ever
   *  reaches the public view, so unbounded slides always render. */
  startsAt: string;
  endsAt: string;
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
  /** Notify every other tab in this browser that hero slides have
   *  changed so they can refetch immediately instead of waiting for the
   *  visibilitychange / online fallbacks. Mirrors the pattern used by
   *  `ProductContext` for the customer-facing gallery. */
  broadcastChange: () => void;
}

const DEFAULT_SETTINGS: HeroSettings = {
  autoplay: true,
  intervalMs: 6000,
  transition: "kenburns",
};

const HERO_BROADCAST_CHANNEL = "canvhub_hero_slides";

const HeroSlidesContext = createContext<ContextType | undefined>(undefined);

export const HeroSlidesProvider = ({ children }: { children: ReactNode }) => {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [settings, setSettings] = useState<HeroSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<BroadcastChannel | null>(null);

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

  // Live-sync every open `/` tab (and the admin editor preview) with
  // hero edits made from another tab or another device. Strategy mirrors
  // ProductContext:
  //   1. Initial fetch on mount.
  //   2. Refetch on tab refocus (`visibilitychange` -> "visible") and
  //      on `online` so a phone that just regained signal picks up the
  //      latest promo banner without a reload.
  //   3. Cross-tab `BroadcastChannel` so an admin save in *this*
  //      browser immediately tells every customer tab to refetch.
  // Hero edits are infrequent enough that we don't background-poll —
  // visibilitychange + broadcast are enough.
  useEffect(() => {
    if (typeof window === "undefined") return;

    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => {
      void refresh();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(HERO_BROADCAST_CHANNEL);
      channelRef.current = channel;
      channel.addEventListener("message", (event: MessageEvent) => {
        if (event?.data?.type === "changed") void refresh();
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (channel) channel.close();
      channelRef.current = null;
    };
  }, [refresh]);

  // Called by the admin editor after a successful save so other tabs
  // refetch right away. Safe no-op if BroadcastChannel is unavailable
  // (older browsers, SSR) — those tabs still pick up the change via
  // the visibilitychange fallback on next focus.
  const broadcastChange = useCallback(() => {
    try {
      channelRef.current?.postMessage({ type: "changed", at: Date.now() });
    } catch {
      /* channel may already be closed; safe to ignore */
    }
  }, []);

  return (
    <HeroSlidesContext.Provider
      value={{ slides, settings, loading, refresh, broadcastChange }}
    >
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
