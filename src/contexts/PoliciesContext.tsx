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
  applyPolicies: (raw: unknown) => void;
}

const PoliciesContext = createContext<ContextType | undefined>(undefined);

const mergeFromResponse = (raw: unknown): PoliciesMap | null => {
  if (!raw || typeof raw !== "object") return null;
  const incoming = (raw as { policies?: Partial<PoliciesMap> }).policies;
  if (!incoming || typeof incoming !== "object") return null;
  const merged = buildDefaults();
  for (const slug of POLICY_SLUGS) {
    const entry = incoming[slug];
    if (entry) {
      merged[slug] = {
        title:
          typeof entry.title === "string" && entry.title
            ? entry.title
            : DEFAULT_TITLES[slug],
        body: typeof entry.body === "string" ? entry.body : "",
        updatedAt:
          typeof entry.updatedAt === "string" ? entry.updatedAt : null,
      };
    }
  }
  return merged;
};

export const PoliciesProvider = ({ children }: { children: ReactNode }) => {
  const [policies, setPolicies] = useState<PoliciesMap>(buildDefaults);
  const [loading, setLoading] = useState(true);

  // Update local state from a parsed `{ policies }` payload. Use this when
  // the caller already has an authoritative response in hand (e.g. the body
  // of a successful admin POST) so we don't re-issue a GET that the CDN may
  // serve from a stale 5-minute cache.
  const applyPolicies = useCallback((raw: unknown) => {
    const merged = mergeFromResponse(raw);
    if (merged) setPolicies(merged);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/policies");
      if (!res.ok) return;
      const data = await res.json();
      applyPolicies(data);
    } catch {
      // keep current values
    } finally {
      setLoading(false);
    }
  }, [applyPolicies]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PoliciesContext.Provider
      value={{ policies, loading, refresh, applyPolicies }}
    >
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
