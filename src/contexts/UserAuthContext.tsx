import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "canvhub_user_token";
const USER_KEY = "canvhub_user";
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
  // Optional pin location set by the hybrid address picker
  // (Google Places / draggable map marker). Couriers can use this
  // when the human-readable address is ambiguous.
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
}

interface UserAuthContextValue {
  token: string | null;
  user: PublicUser | null;
  loading: boolean;
  googleLogin: (credential: string) => Promise<void>;
  applySession: (token: string, user: PublicUser) => void;
  logout: () => void;
  refresh: () => Promise<void>;
  updateProfile: (patch: { name?: string; picture?: string }) => Promise<void>;
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

const readStored = <T,>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const readToken = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const persist = (token: string | null, user: PublicUser | null) => {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
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
  const [token, setToken] = useState<string | null>(() => readToken());
  const [user, setUser] = useState<PublicUser | null>(() =>
    readStored<PublicUser>(USER_KEY),
  );
  const [loading, setLoading] = useState(false);

  const apply = useCallback(
    (nextToken: string | null, nextUser: PublicUser | null) => {
      setToken(nextToken);
      setUser(nextUser);
      persist(nextToken, nextUser);
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
      }
    } catch {
      /* network blip — keep existing */
    }
  }, [token, apply]);

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
          body: JSON.stringify({ action: "google-login", credential }),
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
      loading,
      googleLogin,
      applySession,
      logout,
      refresh,
      updateProfile,
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
      loading,
      googleLogin,
      applySession,
      logout,
      refresh,
      updateProfile,
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
