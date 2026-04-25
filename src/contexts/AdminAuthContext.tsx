import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "pintaterra_admin_token";
const AUTH_API = "/api/admin-auth";

interface AdminAuthContextValue {
  token: string | null;
  initialized: boolean | null;
  loading: boolean;
  initPassword: (password: string) => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => void;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(
  undefined,
);

const readStoredToken = () => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const persistToken = (token: string | null) => {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
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

export const AdminAuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const checkInitialized = async () => {
      try {
        const response = await fetch(AUTH_API);
        if (!response.ok) throw new Error("status check failed");
        const data = await response.json();
        if (cancelled) return;
        setInitialized(Boolean(data.initialized));
      } catch {
        if (!cancelled) setInitialized(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void checkInitialized();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAuthToken = useCallback((next: string | null) => {
    setToken(next);
    persistToken(next);
  }, []);

  const initPassword = useCallback(
    async (password: string) => {
      const response = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", password }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response, "Could not set password"));
      }
      const data = await response.json();
      setAuthToken(data.token);
      setInitialized(true);
    },
    [setAuthToken],
  );

  const login = useCallback(
    async (password: string) => {
      const response = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", password }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response, "Could not log in"));
      }
      const data = await response.json();
      setAuthToken(data.token);
      setInitialized(true);
    },
    [setAuthToken],
  );

  const logout = useCallback(() => {
    setAuthToken(null);
  }, [setAuthToken]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!token) throw new Error("Not authenticated");
      const response = await fetch(AUTH_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "change",
          currentPassword,
          newPassword,
        }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          // Could be invalid token — log out so user re-authenticates.
          if (
            (
              await response
                .clone()
                .json()
                .catch(() => ({ error: "" }))
            )?.error === "Not authenticated"
          ) {
            setAuthToken(null);
          }
        }
        throw new Error(
          await parseError(response, "Could not change password"),
        );
      }
      const data = await response.json();
      setAuthToken(data.token);
    },
    [setAuthToken, token],
  );

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      token,
      initialized,
      loading,
      initPassword,
      login,
      logout,
      changePassword,
    }),
    [token, initialized, loading, initPassword, login, logout, changePassword],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
};

export const getAdminToken = () => readStoredToken();
