import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "canvhub_admin_token";
const AUTH_API = "/api/admin-auth";

/**
 * Surfaced by `login()` when the server reports `requires2FA: true`. The UI
 * catches it specifically and switches the form into "enter your 6-digit
 * code" mode rather than showing a generic auth error.
 */
export class TwoFactorRequiredError extends Error {
  constructor(message = "Two-factor authentication is required") {
    super(message);
    this.name = "TwoFactorRequiredError";
  }
}

export interface LoginExtras {
  /** Bot-protection token from Turnstile (when configured). */
  turnstileToken?: string;
  /** 6-digit TOTP code from the admin's authenticator app. */
  code?: string;
  /** "XXXX-XXXX" recovery code, used when the device is lost. */
  recoveryCode?: string;
}

interface AdminAuthContextValue {
  token: string | null;
  initialized: boolean | null;
  twoFactorEnabled: boolean;
  loading: boolean;
  initPassword: (password: string, turnstileToken?: string) => Promise<void>;
  login: (password: string, extras?: LoginExtras) => Promise<void>;
  logout: () => void;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  refreshAuthMeta: () => Promise<void>;
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
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAuthMeta = useCallback(async () => {
    const response = await fetch(AUTH_API);
    if (!response.ok) throw new Error("status check failed");
    const data = await response.json();
    return {
      initialized: Boolean(data.initialized),
      twoFactorEnabled: Boolean(data.twoFactorEnabled),
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkInitialized = async () => {
      try {
        const meta = await fetchAuthMeta();
        if (cancelled) return;
        setInitialized(meta.initialized);
        setTwoFactorEnabled(meta.twoFactorEnabled);
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
  }, [fetchAuthMeta]);

  const refreshAuthMeta = useCallback(async () => {
    try {
      const meta = await fetchAuthMeta();
      setInitialized(meta.initialized);
      setTwoFactorEnabled(meta.twoFactorEnabled);
    } catch {
      /* ignore */
    }
  }, [fetchAuthMeta]);

  const setAuthToken = useCallback((next: string | null) => {
    setToken(next);
    persistToken(next);
  }, []);

  const initPassword = useCallback(
    async (password: string, turnstileToken?: string) => {
      const response = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init",
          password,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
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
    async (password: string, extras?: LoginExtras) => {
      const response = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          password,
          ...(extras?.turnstileToken
            ? { turnstileToken: extras.turnstileToken }
            : {}),
          ...(extras?.code ? { code: extras.code } : {}),
          ...(extras?.recoveryCode
            ? { recoveryCode: extras.recoveryCode }
            : {}),
        }),
      });

      if (response.status === 401) {
        let payload: { error?: string; requires2FA?: boolean } = {};
        try {
          payload = await response.clone().json();
        } catch {
          /* ignore */
        }
        if (payload.requires2FA) {
          setTwoFactorEnabled(true);
          throw new TwoFactorRequiredError(
            payload.error || "Two-factor authentication is required",
          );
        }
      }

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
      twoFactorEnabled,
      loading,
      initPassword,
      login,
      logout,
      changePassword,
      refreshAuthMeta,
    }),
    [
      token,
      initialized,
      twoFactorEnabled,
      loading,
      initPassword,
      login,
      logout,
      changePassword,
      refreshAuthMeta,
    ],
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
    throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  }
  return ctx;
};

/**
 * Imperative accessor for the admin token. Used by code outside of the
 * AdminAuthProvider tree (e.g. the `getAdminToken` shim used by individual
 * fetch helpers in admin sections).
 */
export const getAdminToken = () => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
