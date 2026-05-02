import { useEffect } from "react";

// Warn the visitor before they accidentally throw away unsaved admin
// edits. Wires into:
//   1. `beforeunload` — covers tab close, refresh, and external nav.
//   2. The browser back / forward buttons via `popstate` (best-effort —
//      the browser only lets us cancel synchronously, so we fall back
//      to a `confirm()` prompt).
//
// Hook intentionally does NOT touch the React Router state — admin
// sections are rendered inside a single tab, so internal nav between
// admin sections is generally safe. The two failure modes above are
// the painful ones (typing for 5 minutes then hitting refresh).
export const useUnsavedChangesGuard = (
  dirty: boolean,
  message = "You have unsaved changes. Leave anyway?",
): void => {
  useEffect(() => {
    if (!dirty) return;
    if (typeof window === "undefined") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Modern browsers ignore the custom message and show their own
      // generic "Leave site?" prompt — but `preventDefault` + setting
      // `returnValue` is still required to actually trigger it.
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    const handlePopState = (e: PopStateEvent) => {
      // popstate has already fired by the time we run, but we can
      // re-push the previous URL if the visitor cancels the prompt so
      // the page they were editing stays in view.
      const ok = window.confirm(message);
      if (!ok) {
        // Best-effort: re-push the current URL so the back navigation
        // is undone. This works in most cases but is not guaranteed
        // by the spec.
        window.history.pushState(
          null,
          "",
          window.location.pathname +
            window.location.search +
            window.location.hash,
        );
        e.preventDefault?.();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [dirty, message]);
};
