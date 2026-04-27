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

export interface PromoCodePublic {
  code: string;
  type: "percent" | "fixed";
  value: number;
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

export interface StorefrontConfig {
  announcement: AnnouncementConfig;
  freeShipping: FreeShippingConfig;
  promoCodes: PromoCodePublic[];
  chat: ChatConfig;
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
