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

export interface LoginPasswordResult {
  // When 2FA is *off*, we already have a session token and `requires2fa`
  // is false. When 2FA is *on*, the server returns a short-lived
  // challenge token instead and the caller must finish login by calling
  // `loginWith2fa(challengeToken, code)`.
  requires2fa: boolean;
  challengeToken: string | null;
  recoveryAvailable: boolean;
}

export interface LoginGateInfo {
  initialized: boolean;
  passkeyCount: number;
  requirePasskey: boolean;
}

interface AdminAuthContextValue {
  token: string | null;
  initialized: boolean | null;
  loading: boolean;
  // Public probe info from GET /api/admin-auth — passkey count +
  // whether the deploy is in passkey-only mode. Used by the login
  // screen to decide which buttons / forms to show.
  gate: LoginGateInfo | null;
  refreshGate: () => Promise<void>;
  initPassword: (password: string, turnstileToken?: string) => Promise<void>;
  login: (
    password: string,
    turnstileToken?: string,
  ) => Promise<LoginPasswordResult>;
  loginWith2fa: (challengeToken: string, code: string) => Promise<void>;
  loginWithPasskey: () => Promise<void>;
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
  const [gate, setGate] = useState<LoginGateInfo | null>(null);

  const fetchGate = useCallback(async () => {
    const response = await fetch(AUTH_API);
    if (!response.ok) throw new Error("status check failed");
    const data = (await response.json()) as {
      initialized?: boolean;
      passkeyCount?: number;
      requirePasskey?: boolean;
    };
    const next: LoginGateInfo = {
      initialized: Boolean(data.initialized),
      passkeyCount: Number(data.passkeyCount ?? 0),
      requirePasskey: Boolean(data.requirePasskey),
    };
    setInitialized(next.initialized);
    setGate(next);
  }, []);

  const refreshGate = useCallback(async () => {
    try {
      await fetchGate();
    } catch {
      // Swallow — the form will show a banner.
    }
  }, [fetchGate]);

  useEffect(() => {
    let cancelled = false;
    const checkInitialized = async () => {
      try {
        await fetchGate();
        if (cancelled) return;
      } catch {
        if (!cancelled) {
          setInitialized(null);
          setGate(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void checkInitialized();
    return () => {
      cancelled = true;
    };
  }, [fetchGate]);

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
    async (
      password: string,
      turnstileToken?: string,
    ): Promise<LoginPasswordResult> => {
      const response = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          password,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(await parseError(response, "Could not log in"));
      }
      const data = (await response.json()) as {
        token?: string;
        requires2fa?: boolean;
        challengeToken?: string;
        recoveryAvailable?: boolean;
      };
      if (data.requires2fa) {
        // Stage 1 succeeded; caller must finish via loginWith2fa.
        return {
          requires2fa: true,
          challengeToken: data.challengeToken || "",
          recoveryAvailable: Boolean(data.recoveryAvailable),
        };
      }
      setAuthToken(data.token ?? null);
      setInitialized(true);
      return {
        requires2fa: false,
        challengeToken: null,
        recoveryAvailable: false,
      };
    },
    [setAuthToken],
  );

  const loginWith2fa = useCallback(
    async (challengeToken: string, code: string) => {
      const response = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login-2fa", challengeToken, code }),
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

  const loginWithPasskey = useCallback(async () => {
    // Lazy-load the browser helper so the SPA doesn't ship the
    // WebAuthn polyfill until someone actually clicks the button.
    const { startAuthentication } = await import("@simplewebauthn/browser");
    const beginRes = await fetch(AUTH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "passkey-login-begin" }),
    });
    if (!beginRes.ok) {
      throw new Error(await parseError(beginRes, "Passkey login failed"));
    }
    const beginData = (await beginRes.json()) as {
      options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
      challengeId: string;
    };
    const assertion = await startAuthentication({
      optionsJSON: beginData.options,
    });
    const finishRes = await fetch(AUTH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "passkey-login-finish",
        challengeId: beginData.challengeId,
        response: assertion,
      }),
    });
    if (!finishRes.ok) {
      throw new Error(await parseError(finishRes, "Passkey rejected"));
    }
    const finishData = (await finishRes.json()) as { token?: string };
    setAuthToken(finishData.token ?? null);
    setInitialized(true);
  }, [setAuthToken]);

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
      gate,
      refreshGate,
      initPassword,
      login,
      loginWith2fa,
      loginWithPasskey,
      logout,
      changePassword,
    }),
    [
      token,
      initialized,
      loading,
      gate,
      refreshGate,
      initPassword,
      login,
      loginWith2fa,
      loginWithPasskey,
      logout,
      changePassword,
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
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
};

export const getAdminToken = () => readStoredToken();
