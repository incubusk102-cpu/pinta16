import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { readStoredReferral } from "@/lib/referral";

// Legacy localStorage keys from the pre-Tier-3-#11 model. Purged on
// boot — the token is now derived from the HttpOnly `cv_user_session`
// cookie via the `?action=session` probe, and the user object is
// returned alongside it so we don't need to persist either client-side.
const LEGACY_TOKEN_KEY = "canvhub_user_token";
const LEGACY_USER_KEY = "canvhub_user";
const API = "/api/users";

export interface SavedAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  // PH cascading-picker fields. Optional so legacy addresses keep
  // round-tripping; new orders will fill these.
  region?: string;
  barangay?: string;
  landmark?: string;
  // Optional pin location set by the hybrid address picker
  // (MapTiler autocomplete / draggable map marker). Couriers can use
  // this when the human-readable address is ambiguous.
  latitude?: number | null;
  longitude?: number | null;
  formatted?: string;
  placeId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AddressInput = Omit<SavedAddress, "id" | "createdAt" | "updatedAt">;

export interface PublicUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  provider?: string;
  createdAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  addresses?: SavedAddress[];
  defaultAddressId?: string | null;
  birthday?: string;
  firstOrderAt?: string;
  referralCode?: string;
  referredBy?: string;
  vipEarlyAccess?: boolean;
}

export interface UserReward {
  kind: "birthday" | "anniversary" | "referral-give" | "referral-get";
  code: string;
  type: "fixed" | "flat" | "percent" | "free_shipping";
  value: number;
  description: string;
  expiresAt: string;
  usageLimit: number;
  usageCount: number;
}

interface UserAuthContextValue {
  token: string | null;
  user: PublicUser | null;
  rewards: UserReward[];
  loading: boolean;
  googleLogin: (credential: string) => Promise<void>;
  applySession: (token: string, user: PublicUser) => void;
  logout: () => void;
  refresh: () => Promise<void>;
  updateProfile: (patch: { name?: string; picture?: string }) => Promise<void>;
  updatePrefs: (patch: {
    birthday?: string;
    vipEarlyAccess?: boolean;
  }) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  addAddress: (address: AddressInput) => Promise<void>;
  updateAddress: (id: string, address: AddressInput) => Promise<void>;
  removeAddress: (id: string) => Promise<void>;
  setDefaultAddress: (id: string) => Promise<void>;
  disconnectGoogle: (confirm: string) => Promise<void>;
}

const UserAuthContext = createContext<UserAuthContextValue | undefined>(
  undefined,
);

// One-time cleanup of the legacy localStorage entries. Idempotent.
const purgeLegacyState = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* ignore */
  }
};

const parseError = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    return data?.error || fallback;
  } catch {
    return fallback;
  }
};

export const UserAuthProvider = ({ children }: { children: ReactNode }) => {
  // Token + user live only in React state; we re-derive both from the
  // HttpOnly `cv_user_session` cookie via the `?action=session` boot
  // probe. localStorage is no longer authoritative.
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [rewards, setRewards] = useState<UserReward[]>([]);
  const [loading, setLoading] = useState(false);

  const apply = useCallback(
    (nextToken: string | null, nextUser: PublicUser | null) => {
      setToken(nextToken);
      setUser(nextUser);
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API}?action=me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        apply(null, null);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        if (data?.user) {
          apply(token, data.user as PublicUser);
        }
        if (Array.isArray(data?.rewards)) {
          setRewards(data.rewards as UserReward[]);
        } else {
          setRewards([]);
        }
      }
    } catch {
      /* network blip — keep existing */
    }
  }, [token, apply]);

  // Boot probe: restore the in-memory session from the HttpOnly cookie
  // if the browser still has one. Runs once on mount; `refresh()` then
  // pulls a fresh user record once token is set. Hold `loading` high
  // until the probe resolves so logged-in users don't flicker through
  // a guest state on page reload.
  useEffect(() => {
    let cancelled = false;
    purgeLegacyState();
    setLoading(true);
    const boot = async () => {
      try {
        const response = await fetch(`${API}?action=session`, {
          method: "GET",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          token?: string;
          user?: PublicUser;
        };
        if (cancelled) return;
        if (data.token && data.user) {
          apply(data.token, data.user);
        }
      } catch {
        /* ignore — user simply isn't logged in */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const googleLogin = useCallback(
    async (credential: string) => {
      setLoading(true);
      try {
        const response = await fetch(`${API}?action=google-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "google-login",
            credential,
            referredBy: readStoredReferral(),
          }),
        });
        if (!response.ok) {
          throw new Error(
            await parseError(response, "Could not sign in with Google"),
          );
        }
        const data = await response.json();
        apply(data.token, data.user as PublicUser);
      } finally {
        setLoading(false);
      }
    },
    [apply],
  );

  const logout = useCallback(() => {
    // Best-effort: tell the server to clear the cookies. Don't await
    // network success — user is logged out in-memory immediately even
    // if the request fails.
    void fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => {});
    apply(null, null);
  }, [apply]);

  const applySession = useCallback(
    (nextToken: string, nextUser: PublicUser) => {
      apply(nextToken, nextUser);
    },
    [apply],
  );

  const callAction = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>,
      defaultError: string,
    ): Promise<{ user?: PublicUser } | { ok?: boolean }> => {
      if (!token) throw new Error("Not signed in");
      const response = await fetch(`${API}?action=${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ...payload }),
      });
      if (response.status === 401) {
        apply(null, null);
        throw new Error("Session expired — please sign in again");
      }
      if (!response.ok) {
        throw new Error(await parseError(response, defaultError));
      }
      return response.json();
    },
    [token, apply],
  );

  const updateProfile = useCallback(
    async (patch: { name?: string; picture?: string }) => {
      const data = (await callAction(
        "update-profile",
        patch,
        "Could not update profile",
      )) as { user: PublicUser };
      if (data?.user) apply(token, data.user);
    },
    [callAction, apply, token],
  );

  const updatePrefs = useCallback(
    async (patch: { birthday?: string; vipEarlyAccess?: boolean }) => {
      const data = (await callAction(
        "update-prefs",
        patch,
        "Could not update preferences",
      )) as { user: PublicUser };
      if (data?.user) {
        apply(token, data.user);
        // Re-pull /me so any newly-eligible reward (e.g. setting a
        // birthday that's today) gets surfaced immediately.
        void refresh();
      }
    },
    [callAction, apply, token, refresh],
  );

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      await callAction(
        "change-password",
        { oldPassword, newPassword },
        "Could not change password",
      );
    },
    [callAction],
  );

  const addAddress = useCallback(
    async (address: AddressInput) => {
      const data = (await callAction(
        "addresses-add",
        { address },
        "Could not save address",
      )) as { user: PublicUser };
      if (data?.user) apply(token, data.user);
    },
    [callAction, apply, token],
  );

  const updateAddress = useCallback(
    async (id: string, address: AddressInput) => {
      const data = (await callAction(
        "addresses-update",
        { id, address },
        "Could not update address",
      )) as { user: PublicUser };
      if (data?.user) apply(token, data.user);
    },
    [callAction, apply, token],
  );

  const removeAddress = useCallback(
    async (id: string) => {
      const data = (await callAction(
        "addresses-remove",
        { id },
        "Could not remove address",
      )) as { user: PublicUser };
      if (data?.user) apply(token, data.user);
    },
    [callAction, apply, token],
  );

  const setDefaultAddress = useCallback(
    async (id: string) => {
      const data = (await callAction(
        "addresses-set-default",
        { id },
        "Could not set default address",
      )) as { user: PublicUser };
      if (data?.user) apply(token, data.user);
    },
    [callAction, apply, token],
  );

  const disconnectGoogle = useCallback(
    async (confirm: string) => {
      // Server enforces confirm === "CONFIRM". Once it succeeds the user
      // record is deleted, so log out locally so any stale token stops
      // bouncing 401s.
      await callAction(
        "disconnect-google",
        { confirm },
        "Could not disconnect Google",
      );
      apply(null, null);
    },
    [callAction, apply],
  );

  const value = useMemo<UserAuthContextValue>(
    () => ({
      token,
      user,
      rewards,
      loading,
      googleLogin,
      applySession,
      logout,
      refresh,
      updateProfile,
      updatePrefs,
      changePassword,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      disconnectGoogle,
    }),
    [
      token,
      user,
      rewards,
      loading,
      googleLogin,
      applySession,
      logout,
      refresh,
      updateProfile,
      updatePrefs,
      changePassword,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      disconnectGoogle,
    ],
  );

  return (
    <UserAuthContext.Provider value={value}>
      {children}
    </UserAuthContext.Provider>
  );
};

export const useUserAuth = () => {
  const ctx = useContext(UserAuthContext);
  if (!ctx) {
    throw new Error("useUserAuth must be used within UserAuthProvider");
  }
  return ctx;
};
