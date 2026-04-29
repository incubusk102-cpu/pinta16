import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { useUserAuth, type PublicUser } from "@/contexts/UserAuthContext";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const GOOGLE_CLIENT_ID =
  "899774942474-kbdt3c4tvpr6tltcggmtnr07aqvg4eb2.apps.googleusercontent.com";

const GOOGLE_CALLBACK_PATH = "/api/google-callback";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — Canvas Hub" },
      {
        name: "description",
        content: "Sign in to your Canvas Hub account with Google.",
      },
    ],
  }),
});

declare global {
  interface Window {
    handleGoogleCredential?: (response: { credential: string }) => void;
  }
}

const decodeBase64Url = (value: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding =
      padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return atob(padded + padding);
  } catch {
    return null;
  }
};

function LoginPage() {
  const { googleLogin, applySession, loading, token } = useUserAuth();
  const navigate = useNavigate();
  const btnRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const consumedRedirect = useRef(false);

  const handleCredential = useCallback(
    async (response: { credential: string }) => {
      try {
        await googleLogin(response.credential);
        toast.success("Welcome to Canvas Hub");
        void navigate({ to: "/", hash: "gallery" });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not sign in",
        );
      }
    },
    [googleLogin, navigate],
  );

  // Handle server-side redirect flow (ux_mode: "redirect"):
  // google-callback.js sends us back with #auth=<base64url JSON> on success,
  // or ?error=<message> on failure.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (consumedRedirect.current) return;

    const search = new URLSearchParams(window.location.search);
    const err = search.get("error");
    if (err) {
      consumedRedirect.current = true;
      toast.error(err);
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", clean);
      return;
    }

    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash) return;
    const hashParams = new URLSearchParams(hash);
    const authValue = hashParams.get("auth");
    if (!authValue) return;

    consumedRedirect.current = true;
    const decoded = decodeBase64Url(authValue);
    window.history.replaceState(null, "", window.location.pathname);

    if (!decoded) {
      toast.error("Could not read Google sign-in response");
      return;
    }
    try {
      const parsed = JSON.parse(decoded) as {
        token?: string;
        user?: PublicUser;
      };
      if (!parsed.token || !parsed.user) {
        toast.error("Incomplete sign-in response");
        return;
      }
      applySession(parsed.token, parsed.user);
      toast.success("Welcome to Canvas Hub");
      void navigate({ to: "/", hash: "gallery" });
    } catch {
      toast.error("Could not read Google sign-in response");
    }
  }, [applySession, navigate]);

  useEffect(() => {
    if (token) {
      void navigate({ to: "/", hash: "gallery" });
      return;
    }

    window.handleGoogleCredential = (resp: { credential: string }) => {
      void handleCredential(resp);
    };

    const initGoogle = () => {
      if (initialized.current) return;
      const g = (window as unknown as Record<string, unknown>).google as
        | {
            accounts: {
              id: {
                initialize: (config: Record<string, unknown>) => void;
                renderButton: (
                  el: HTMLElement,
                  config: Record<string, unknown>,
                ) => void;
              };
            };
          }
        | undefined;
      if (!g?.accounts?.id || !btnRef.current) return;
      initialized.current = true;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: window.handleGoogleCredential,
        // Use the server-side redirect flow so the sign-in works in browsers
        // that block the popup's postMessage (Brave, Safari ITP, Chrome with
        // 3rd-party cookies disabled, etc.).
        ux_mode: "redirect",
        login_uri: `${window.location.origin}${GOOGLE_CALLBACK_PATH}`,
        itp_support: true,
        use_fedcm_for_button: true,
        use_fedcm_for_prompt: true,
      });
      const btnWidth = Math.max(
        240,
        Math.min(360, btnRef.current.clientWidth || 360),
      );
      g.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        width: btnWidth,
        text: "signin_with",
        shape: "rectangular",
      });
    };

    if ((window as unknown as Record<string, unknown>).google) {
      initGoogle();
    }

    if (!document.getElementById("google-gsi-script")) {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    } else {
      const timer = setInterval(() => {
        if ((window as unknown as Record<string, unknown>).google) {
          initGoogle();
          clearInterval(timer);
        }
      }, 100);
      return () => clearInterval(timer);
    }
  }, [token, navigate, handleCredential]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 sm:px-6 py-10">
      <div className="w-full max-w-md bg-card/40 border border-border/60 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Welcome to Canvas Hub. Sign in with your Google account.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            ref={btnRef}
            className={`w-full flex justify-center ${loading ? "opacity-50 pointer-events-none" : ""}`}
          />
          {loading && (
            <p className="text-sm text-muted-foreground">Signing in…</p>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground">
          <Link
            to="/"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}
