import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type AnnouncementSize = "compact" | "normal" | "large";

export interface AnnouncementConfig {
  enabled: boolean;
  message: string;
  link: string;
  backgroundColor: string;
  textColor: string;
  showFreeShipping: boolean;
  showPromoCodes: boolean;
  promoTemplate: string;
  rotateSeconds: number;
  size: AnnouncementSize;
  bold: boolean;
}

export interface FreeShippingConfig {
  enabled: boolean;
  threshold: number;
  shippingFee: number;
}

export interface PromoCodePublic {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSpend: number;
  expiresAt: string | null;
  description: string;
}

export interface HeroConfig {
  enabled: boolean;
  eyebrow: string;
  headline: string;
  subhead: string;
  ctaLabel: string;
  ctaHref: string;
  /** Up to 3 image URLs layered as the parallax background. Empty array
   *  falls back to the bundled default treatment in HeroSection. */
  backgroundImages: string[];
}

export interface CollectionConfig {
  id: string;
  title: string;
  description: string;
  /** Ordered product ids that belong to the collection. */
  productIds: string[];
  enabled: boolean;
}

export interface StorefrontConfig {
  announcement: AnnouncementConfig;
  freeShipping: FreeShippingConfig;
  promoCodes: PromoCodePublic[];
  hero: HeroConfig;
  collections: CollectionConfig[];
}

const DEFAULT_CONFIG: StorefrontConfig = {
  announcement: {
    enabled: false,
    message: "",
    link: "",
    backgroundColor: "#1f2937",
    textColor: "#ffffff",
    showFreeShipping: true,
    showPromoCodes: true,
    promoTemplate: "Use code {code} for {discount} off{minSpend}",
    rotateSeconds: 5,
    size: "normal",
    bold: true,
  },
  freeShipping: {
    enabled: true,
    threshold: 8000,
    shippingFee: 500,
  },
  promoCodes: [],
  hero: {
    enabled: true,
    eyebrow: "Affordable Art, Authentic Stories",
    headline: "Pintaterra",
    subhead:
      "Discover hand-crafted paintings that transform spaces. Each piece tells a story, crafted with passion and precision.",
    ctaLabel: "View Collection",
    ctaHref: "#gallery",
    backgroundImages: [],
  },
  collections: [],
};

interface ContextType {
  config: StorefrontConfig;
  loading: boolean;
  refresh: () => Promise<void>;
}

const StorefrontConfigContext = createContext<ContextType | undefined>(
  undefined,
);

export const StorefrontConfigProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [config, setConfig] = useState<StorefrontConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/storefront-config");
      if (!res.ok) return;
      const data = await res.json();
      if (data?.config) {
        setConfig({
          announcement: {
            ...DEFAULT_CONFIG.announcement,
            ...data.config.announcement,
          },
          freeShipping: {
            ...DEFAULT_CONFIG.freeShipping,
            ...data.config.freeShipping,
          },
          promoCodes: Array.isArray(data.config.promoCodes)
            ? data.config.promoCodes
            : [],
          hero: {
            ...DEFAULT_CONFIG.hero,
            ...(data.config.hero ?? {}),
            backgroundImages: Array.isArray(data.config.hero?.backgroundImages)
              ? data.config.hero.backgroundImages
              : [],
          },
          collections: Array.isArray(data.config.collections)
            ? data.config.collections
            : [],
        });
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <StorefrontConfigContext.Provider value={{ config, loading, refresh }}>
      {children}
    </StorefrontConfigContext.Provider>
  );
};

export const useStorefrontConfig = () => {
  const ctx = useContext(StorefrontConfigContext);
  if (!ctx) {
    throw new Error(
      "useStorefrontConfig must be used within StorefrontConfigProvider",
    );
  }
  return ctx;
};
