import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_CHAT_FAQS,
  DEFAULT_CHAT_WELCOME,
  sanitizeChatFaqs,
  type ChatFaqItem,
} from "@/lib/chat-faqs";

export type AnnouncementSize = "compact" | "normal" | "large";
export type AnnouncementAnimation =
  | "fade"
  | "marquee"
  | "slide"
  | "typewriter"
  | "pulse";
export type AnnouncementMarqueeDirection = "left" | "right";

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
  animation: AnnouncementAnimation;
  marqueeSpeedSeconds: number;
  marqueeDirection: AnnouncementMarqueeDirection;
  gradientEnabled: boolean;
  gradientFrom: string;
  gradientTo: string;
  iconPrefix: string;
  dismissable: boolean;
}

export interface FreeShippingConfig {
  enabled: boolean;
  threshold: number;
  shippingFee: number;
}

export type PromoCodeType = "percent" | "fixed" | "flat" | "free_shipping";

export interface PromoCodePublic {
  code: string;
  type: PromoCodeType;
  value: number;
  freeShipping: boolean;
  minSpend: number;
  expiresAt: string | null;
  description: string;
}

export interface ChatConfig {
  enabled: boolean;
  welcome: string;
  agentHandoff: boolean;
  faqs: ChatFaqItem[];
}

// Section-level copy that the admin can override from /admin → Site copy.
// Default values match the strings hard-coded in the React components so
// the storefront falls back gracefully when the admin hasn't customised
// anything yet.
export interface SiteCopySectionTwo {
  eyebrow: string;
  title: string;
}

export interface SiteCopyAbout {
  eyebrow: string;
  title: string;
  body: string;
}

export interface SiteCopy {
  gallery: SiteCopySectionTwo;
  about: SiteCopyAbout;
  reviews: SiteCopySectionTwo;
  contact: SiteCopySectionTwo;
}

export const DEFAULT_SITE_COPY: SiteCopy = {
  gallery: {
    eyebrow: "The Collection",
    title: "Our Collection",
  },
  about: {
    eyebrow: "Our Story",
    title: "About Canvas Hub",
    body: "Every painting has a soul — a story waiting to be told. We bring affordable, hand-crafted art to homes and spaces that deserve beauty. Each piece is made to order, ensuring that what you receive is as unique as your vision.",
  },
  reviews: {
    eyebrow: "What customers say",
    title: "Reviews from our collectors",
  },
  contact: {
    eyebrow: "Get in touch",
    title: "Contact us",
  },
};

export interface StorefrontConfig {
  announcement: AnnouncementConfig;
  freeShipping: FreeShippingConfig;
  promoCodes: PromoCodePublic[];
  chat: ChatConfig;
  siteCopy: SiteCopy;
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
    animation: "fade",
    marqueeSpeedSeconds: 18,
    marqueeDirection: "left",
    gradientEnabled: false,
    gradientFrom: "#1f2937",
    gradientTo: "#0ea5e9",
    iconPrefix: "",
    dismissable: false,
  },
  freeShipping: {
    enabled: true,
    threshold: 8000,
    shippingFee: 500,
  },
  promoCodes: [],
  chat: {
    enabled: true,
    welcome: DEFAULT_CHAT_WELCOME,
    agentHandoff: true,
    faqs: DEFAULT_CHAT_FAQS,
  },
  siteCopy: DEFAULT_SITE_COPY,
};

const mergeSiteCopy = (raw: unknown): SiteCopy => {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<{
    gallery: Partial<SiteCopySectionTwo>;
    about: Partial<SiteCopyAbout>;
    reviews: Partial<SiteCopySectionTwo>;
    contact: Partial<SiteCopySectionTwo>;
  }>;
  return {
    gallery: { ...DEFAULT_SITE_COPY.gallery, ...(data.gallery ?? {}) },
    about: { ...DEFAULT_SITE_COPY.about, ...(data.about ?? {}) },
    reviews: { ...DEFAULT_SITE_COPY.reviews, ...(data.reviews ?? {}) },
    contact: { ...DEFAULT_SITE_COPY.contact, ...(data.contact ?? {}) },
  };
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
        const rawChat =
          data.config.chat && typeof data.config.chat === "object"
            ? data.config.chat
            : {};
        // Respect an explicitly-empty FAQ array; only re-seed defaults when
        // the server didn't return a `faqs` field at all.
        const faqsExplicit = Array.isArray(rawChat.faqs);
        const sanitizedFaqs = sanitizeChatFaqs(rawChat.faqs);
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
          chat: {
            enabled: rawChat.enabled !== false,
            welcome:
              typeof rawChat.welcome === "string" && rawChat.welcome.trim()
                ? rawChat.welcome
                : DEFAULT_CHAT_WELCOME,
            agentHandoff: rawChat.agentHandoff !== false,
            faqs: faqsExplicit ? sanitizedFaqs : DEFAULT_CHAT_FAQS,
          },
          siteCopy: mergeSiteCopy(data.config.siteCopy),
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
