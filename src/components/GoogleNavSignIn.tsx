import { useEffect, useRef } from "react";
import {
  GOOGLE_CALLBACK_PATH,
  cancelGoogleOneTap,
  renderGoogleButton,
} from "@/lib/google-signin";

// Inline Google "Continue with Google" button for the hamburger menu
// (and any other nav surface that wants the same near-zero-tap Google
// sign-in the cart uses). Same semantics as CheckoutForm's Google
// slot: autoSelect for returning visitors, One Tap for first-time
// visitors, top-level redirect to Google's real page otherwise.
export default function GoogleNavSignIn() {
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = btnRef.current;
    if (!target) return;
    target.innerHTML = "";

    const width = Math.max(240, Math.min(400, target.clientWidth || 320));
    // Abort lets the cleanup stop renderGoogleButton if the async GSI
    // script is still loading when the drawer closes — otherwise a
    // late auto_select / One Tap could force-redirect the visitor
    // after they've moved on (same protection as the cart slot).
    const abortController = new AbortController();
    renderGoogleButton({
      target,
      width,
      text: "continue_with",
      theme: "outline",
      shape: "rectangular",
      loginUri: `${window.location.origin}${GOOGLE_CALLBACK_PATH}`,
      autoSelect: true,
      showOneTap: true,
      signal: abortController.signal,
    }).catch(() => {
      /* GSI script failed to load — leave the empty slot */
    });

    return () => {
      abortController.abort();
      cancelGoogleOneTap();
    };
  }, []);

  return (
    <div
      ref={btnRef}
      className="flex items-center justify-center"
      aria-label="Sign in with Google"
    />
  );
}
