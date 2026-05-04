import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Legacy localStorage key from the pre-Tier-3-#11 model. We deliberately
// purge it on boot so any token left over from the old persistence path
// can't be picked up — the only source of truth is now the HttpOnly
// `cv_admin_session` cookie, rehydrated into in-memory React state via
// the `?action=session` boot probe.
const LEGACY_STORAGE_KEY = "canvhub_admin_token";
const AUTH_API = "/api/admin-auth";

// Module-level mirror of the in-memory React token so non-React
// callers (uploadImage, AbortController-driven fetches, ad-hoc
// utilities) can still read it via `getAdminToken()` without
// piping `useAdminAuth()` through every callsite. AdminAuthProvider
// keeps this in sync with React state via a `useEffect`. Stays
// `null` until login resolves and clears back to `null` on logout.
let inMemoryAdminToken: string | null = null;

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

// One-time cleanup of the legacy localStorage entry. Runs in module
// scope so it executes before any component reads the cookie value.
// Idempotent — `removeItem` on a missing key is a no-op.
const purgeLegacyToken = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
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
  // Token lives only in React state. On reload we re-derive it from
  // the HttpOnly session cookie via the `?action=session` boot probe.
  // No localStorage, no sessionStorage — XSS can't steal what isn't
  // persisted across the page lifetime.
  const [token, setToken] = useState<string | null>(null);
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

  // Boot probe: try the cookie-backed session endpoint. If the browser
  // still has a valid `cv_admin_session` cookie, the server echoes the
  // resolved JWT back so we can rehydrate React state. 401 → not
  // logged in (clean slate). Always run alongside the gate fetch.
  const probeSession = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`${AUTH_API}?action=session`, {
        method: "GET",
        credentials: "same-origin",
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { token?: string };
      return data.token || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    purgeLegacyToken();
    const boot = async () => {
      try {
        const [, sessionToken] = await Promise.all([
          fetchGate(),
          probeSession(),
        ]);
        if (cancelled) return;
        if (sessionToken) setToken(sessionToken);
      } catch {
        if (!cancelled) {
          setInitialized(null);
          setGate(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [fetchGate, probeSession]);

  const setAuthToken = useCallback((next: string | null) => {
    setToken(next);
  }, []);

  // Mirror the React token into the module-level ref so legacy
  // `getAdminToken()` callers see the live value. Without this
  // mirror every authed admin GET sends `Authorization: Bearer null`
  // and the backend rejects with 401.
  useEffect(() => {
    inMemoryAdminToken = token;
    return () => {
      // On unmount (only happens when the provider itself unmounts,
      // e.g. full SPA teardown) clear the ref so a future remount
      // doesn't see a stale token.
      inMemoryAdminToken = null;
    };
  }, [token]);

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
    // Best-effort: tell the server to clear the cookies. We don't await
    // network success — even if the request fails (offline, etc.) the
    // user is logged out client-side immediately.
    void fetch(AUTH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => {});
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

// Read the current admin token from the module-level mirror that
// AdminAuthProvider keeps in sync with React state. Returns null
// until login resolves (and after logout). Available to non-React
// callers — utility code, AbortController-driven fetches — that
// can't go through `useAdminAuth()`.
export const getAdminToken = (): string | null => inMemoryAdminToken;
