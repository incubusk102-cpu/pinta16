import { useEffect } from "react";

// Lock <body> scrolling while a modal / drawer is open. Keeps the page
// underneath from drifting when the visitor scrolls inside the overlay
// on mobile, while still preserving their previous scroll position when
// the overlay closes (most browsers reset scroll-position when toggling
// `overflow: hidden` on <body> mid-scroll).
//
// Multiple drawers can stack — the body scroll only re-enables once the
// last lock is released. We track that with a counter on the body.
export const useBodyScrollLock = (locked: boolean) => {
  useEffect(() => {
    if (!locked) return;
    if (typeof document === "undefined") return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const previousCount = Number(body.dataset.scrollLockCount || "0");
    const nextCount = previousCount + 1;
    body.dataset.scrollLockCount = String(nextCount);
    if (previousCount === 0) {
      // Account for the scrollbar disappearing on desktop so the layout
      // doesn't shift sideways when we hide overflow.
      const scrollbarWidth = window.innerWidth - body.clientWidth;
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
      body.style.overflow = "hidden";
    }
    return () => {
      const remaining = Number(body.dataset.scrollLockCount || "1") - 1;
      if (remaining <= 0) {
        delete body.dataset.scrollLockCount;
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPaddingRight;
      } else {
        body.dataset.scrollLockCount = String(remaining);
      }
    };
  }, [locked]);
};
