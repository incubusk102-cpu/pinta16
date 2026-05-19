import { useEffect } from "react";

// Hides the main page content from assistive technology and keyboard
// users while a drawer or modal is open. Setting `inert` on
// `#main-content` (the storefront's primary `<main>` slot on every
// public route) means screen readers stop announcing the static page
// underneath an overlay, and Tab focus can no longer escape the
// drawer back into the page — both expected behaviours for a modal
// dialog.
//
// Multiple drawers can stack (e.g. PaymentModal opens on top of
// CheckoutForm) — we ref-count the lock on the element itself so the
// `inert` attribute only lifts when the last overlay closes.
//
// The hook is intentionally targeted at `#main-content` rather than
// `<body>` so it doesn't accidentally inert the drawer / modal
// itself, which is rendered as a sibling of `<main>`.
export const useInertBackground = (locked: boolean): void => {
  useEffect(() => {
    if (!locked) return;
    if (typeof document === "undefined") return;
    const main = document.getElementById("main-content");
    if (!main) return;
    const previousCount = Number(main.dataset.inertCount || "0");
    const nextCount = previousCount + 1;
    main.dataset.inertCount = String(nextCount);
    if (previousCount === 0) {
      main.setAttribute("inert", "");
    }
    return () => {
      const remaining = Number(main.dataset.inertCount || "1") - 1;
      if (remaining <= 0) {
        delete main.dataset.inertCount;
        main.removeAttribute("inert");
      } else {
        main.dataset.inertCount = String(remaining);
      }
    };
  }, [locked]);
};
