import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft } from "lucide-react";

const GOOGLE_CLIENT_ID =
  "973550464387-halsaqo2c8hgnertjhijr1l0n76921jb.apps.googleusercontent.com";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — Pintaterra" },
      {
        name: "description",
        content: "Sign in to your Pintaterra account with Google.",
      },
    ],
  }),
});

declare global {
  interface Window {
    handleGoogleCredential?: (response: { credential: string }) => void;
  }
}

function LoginPage() {
  const { googleLogin, loading, token } = useUserAuth();
  const navigate = useNavigate();
  const btnRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  const handleCredential = useCallback(
    async (response: { credential: string }) => {
      try {
        await googleLogin(response.credential);
        toast.success("Welcome to Pintaterra");
        void navigate({ to: "/", hash: "gallery" });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not sign in",
        );
      }
    },
    [googleLogin, navigate],
  );

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
      });
      g.accounts.id.renderButton(btnRef.current, {
        theme: "outline",
        size: "large",
        width: 360,
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
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <Toaster richColors position="top-right" />
      <div className="w-full max-w-md bg-card/40 border border-border/60 rounded-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Welcome to Pintaterra. Sign in with your Google account.
          </p>
        </div>

        <div className="flex justify-center">
          {loading ? (
            <p className="text-sm text-muted-foreground">Signing in…</p>
          ) : (
            <div ref={btnRef} />
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
