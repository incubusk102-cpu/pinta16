import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_POLICY_BODIES } from "@/data/defaultPolicies";

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

// Falls back to the bundled draft bodies in src/data/defaultPolicies.ts
// so the public /policy/$slug pages are never blank when the POLICIES
// KV namespace has no entry for a slug. Admin-saved bodies (delivered
// by /api/policies and merged in mergeFromResponse) always win — the
// defaults only render until the merchant edits the slug in
// /admin → Policies for the first time.
const buildDefaults = (): PoliciesMap => {
  const out = {} as PoliciesMap;
  for (const slug of POLICY_SLUGS) {
    out[slug] = {
      title: DEFAULT_TITLES[slug],
      body: DEFAULT_POLICY_BODIES[slug],
      updatedAt: null,
    };
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
      // Admin-saved values win, but a missing or empty body falls back
      // to the bundled draft so the public page never renders blank.
      const incomingBody =
        typeof entry.body === "string" ? entry.body.trim() : "";
      merged[slug] = {
        title:
          typeof entry.title === "string" && entry.title
            ? entry.title
            : DEFAULT_TITLES[slug],
        body:
          incomingBody.length > 0 ? entry.body! : DEFAULT_POLICY_BODIES[slug],
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : null,
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
