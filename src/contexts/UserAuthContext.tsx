import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "pintaterra_user_token";
const USER_KEY = "pintaterra_user";
const API = "/api/users";

export interface PublicUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  provider?: string;
  createdAt?: string;
  lastSeenAt?: string;
}

interface UserAuthContextValue {
  token: string | null;
  user: PublicUser | null;
  loading: boolean;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
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

  const value = useMemo<UserAuthContextValue>(
    () => ({ token, user, loading, googleLogin, logout, refresh }),
    [token, user, loading, googleLogin, logout, refresh],
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
