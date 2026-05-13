import { useEffect, useId, useRef, useState } from "react";

// Cloudflare Turnstile site key. Public-safe (it's embedded in the script
// served to every visitor by design). Set in the Cloudflare Pages dashboard
// as `VITE_TURNSTILE_SITE_KEY`. When unset the component renders nothing and
// `onToken` is never called — call sites should treat that as "verification
// disabled" and submit without a token.
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          "timeout-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible" | "invisible";
          appearance?: "always" | "execute" | "interaction-only";
          action?: string;
        },
      ) => string | undefined;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
const loadScript = () => {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("window unavailable"));
      return;
    }
    if (window.turnstile) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src^="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("turnstile script failed")),
        {
          once: true,
        },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("turnstile script failed")),
      {
        once: true,
      },
    );
    document.head.appendChild(script);
  });
  return scriptPromise;
};

interface TurnstileProps {
  onToken: (token: string) => void;
  // Called when a previously-issued token expires or fails — call sites
  // should clear any stored token so the next submit re-prompts.
  onExpire?: () => void;
  // Useful for disambiguating multiple challenges on the same page in the
  // Cloudflare dashboard (e.g. "newsletter" vs "admin-login").
  action?: string;
  // "interaction-only" hides the widget entirely until the visitor's
  // behaviour looks suspicious — best for auth/newsletter flows where we
  // don't want a permanent badge cluttering the form. "always" shows the
  // managed badge.
  appearance?: "always" | "execute" | "interaction-only";
  theme?: "light" | "dark" | "auto";
  className?: string;
  // Bump this number from the parent to force the widget to drop its
  // current token and ask Cloudflare for a fresh one. Turnstile tokens
  // are single-use; call sites that verify the same token at two
  // different server endpoints (e.g. /api/create-payment then
  // /api/orders) should bump this between the two so the second
  // siteverify call doesn't see a burnt token.
  resetSignal?: number;
}

const Turnstile = ({
  onToken,
  onExpire,
  action,
  appearance = "interaction-only",
  theme = "auto",
  className,
  resetSignal = 0,
}: TurnstileProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const [, setReady] = useState(false);
  const id = useId();

  // When the parent bumps `resetSignal`, ask Turnstile to issue a
  // fresh token via its registered callback. No-op until the widget
  // has rendered (resetSignal = 0 on first mount is also skipped).
  useEffect(() => {
    if (!resetSignal) return;
    const wid = widgetIdRef.current;
    if (!wid || !window.turnstile?.reset) return;
    try {
      window.turnstile.reset(wid);
    } catch {
      /* widget gone / not yet ready — next mount will issue a fresh token */
    }
  }, [resetSignal]);

  useEffect(() => {
    // No site key configured → render nothing. The form should treat the
    // missing call to onToken as "no challenge" and submit normally.
    if (!SITE_KEY) return;

    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled) return;
        if (!containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => {
            if (!cancelled) onToken(token);
          },
          "expired-callback": () => {
            if (!cancelled && onExpire) onExpire();
          },
          "error-callback": () => {
            if (!cancelled && onExpire) onExpire();
          },
          theme,
          appearance,
          action,
        });
        setReady(true);
      })
      .catch(() => {
        // Script failed to load (e.g. blocked by an extension). Don't
        // block the form — call sites that rely on this should still
        // allow submission; the server-side rate limit + WAF still gate
        // abuse. We just won't have an extra signal.
      });

    return () => {
      cancelled = true;
      const wid = widgetIdRef.current;
      if (wid && window.turnstile?.remove) {
        try {
          window.turnstile.remove(wid);
        } catch {
          /* widget already gone */
        }
      }
    };
  }, [onToken, onExpire, action, appearance, theme]);

  if (!SITE_KEY) return null;

  return (
    <div ref={containerRef} id={`turnstile-${id}`} className={className} />
  );
};

export const isTurnstileEnabled = () => Boolean(SITE_KEY);

export default Turnstile;
