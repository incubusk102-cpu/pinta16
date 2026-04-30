import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useUserAuth, type PublicUser } from "@/contexts/UserAuthContext";

// Finalize a Google sign-in that `/api/google-callback` handed back to
// the SPA via `#auth=<base64url JSON>` on success, or `?error=<msg>` on
// failure. Mount this hook at the app root so the visitor lands on the
// page they care about (usually `/`) instead of bouncing through
// `/login` just to parse the fragment. The in-cart and /login entry
// points both benefit from this — Google's redirect lands on `/` and
// the session is finalized in-place.

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

export const useGoogleAuthHash = (): void => {
  const { applySession } = useUserAuth();
  const consumed = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (consumed.current) return;

    const search = new URLSearchParams(window.location.search);
    const err = search.get("error");
    if (err) {
      consumed.current = true;
      toast.error(err);
      search.delete("error");
      const queryStr = search.toString();
      const clean =
        window.location.pathname +
        (queryStr ? `?${queryStr}` : "") +
        window.location.hash;
      window.history.replaceState(null, "", clean);
      return;
    }

    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!rawHash) return;
    const hashParams = new URLSearchParams(rawHash);
    const authValue = hashParams.get("auth");
    if (!authValue) return;

    consumed.current = true;
    const decoded = decodeBase64Url(authValue);

    // Strip just the `auth` fragment; keep any other hash parts (e.g.
    // `#gallery`) intact so in-page anchors still resolve.
    hashParams.delete("auth");
    const remainingHash = hashParams.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname +
        window.location.search +
        (remainingHash ? `#${remainingHash}` : ""),
    );

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
      toast.success("Signed in");
    } catch {
      toast.error("Could not read Google sign-in response");
    }
  }, [applySession]);
};
