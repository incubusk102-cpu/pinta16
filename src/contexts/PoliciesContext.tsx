import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const POLICY_SLUGS = ["terms", "refund", "shipping", "privacy"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export interface Policy {
  title: string;
  body: string;
  updatedAt: string | null;
}

export type PoliciesMap = Record<PolicySlug, Policy>;

const DEFAULT_TITLES: Record<PolicySlug, string> = {
  terms: "Terms & Conditions",
  refund: "Refund & Return Policy",
  shipping: "Shipping Policy",
  privacy: "Privacy Policy",
};

const buildDefaults = (): PoliciesMap => {
  const out = {} as PoliciesMap;
  for (const slug of POLICY_SLUGS) {
    out[slug] = { title: DEFAULT_TITLES[slug], body: "", updatedAt: null };
  }
  return out;
};

interface ContextType {
  policies: PoliciesMap;
  loading: boolean;
  refresh: () => Promise<void>;
}

const PoliciesContext = createContext<ContextType | undefined>(undefined);

export const PoliciesProvider = ({ children }: { children: ReactNode }) => {
  const [policies, setPolicies] = useState<PoliciesMap>(buildDefaults);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/policies");
      if (!res.ok) return;
      const data = (await res.json()) as { policies?: Partial<PoliciesMap> };
      if (data.policies) {
        const merged = buildDefaults();
        for (const slug of POLICY_SLUGS) {
          const incoming = data.policies[slug];
          if (incoming) {
            merged[slug] = {
              title:
                typeof incoming.title === "string" && incoming.title
                  ? incoming.title
                  : DEFAULT_TITLES[slug],
              body: typeof incoming.body === "string" ? incoming.body : "",
              updatedAt:
                typeof incoming.updatedAt === "string"
                  ? incoming.updatedAt
                  : null,
            };
          }
        }
        setPolicies(merged);
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
    <PoliciesContext.Provider value={{ policies, loading, refresh }}>
      {children}
    </PoliciesContext.Provider>
  );
};

export const usePolicies = () => {
  const ctx = useContext(PoliciesContext);
  if (!ctx) {
    throw new Error("usePolicies must be used within PoliciesProvider");
  }
  return ctx;
};
