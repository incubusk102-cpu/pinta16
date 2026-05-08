// When a new build is deployed, the user's already-loaded `index.html`
// references chunks whose hashed filenames no longer exist on the CDN.
// As soon as React Router tries to lazy-load a route or component it hits
// a "Failed to fetch dynamically imported module" error and the global
// ErrorBoundary renders the red "Something went wrong" page.
//
// This handler swaps that for a one-shot full reload, which re-fetches
// `index.html` and picks up the fresh chunk hashes. We use sessionStorage
// to guarantee we only reload once per tab session — if the error still
// fires after a reload (i.e. it's a real failure, not a stale-chunk one),
// we let the ErrorBoundary surface it instead of looping.

const RELOAD_FLAG = "cv:chunkReloadAttempted";

const isStaleChunkError = (error: unknown): boolean => {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return false;
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Loading chunk") ||
    message.includes("Loading CSS chunk")
  );
};

const reloadOnce = (): void => {
  let alreadyAttempted = false;
  try {
    alreadyAttempted = sessionStorage.getItem(RELOAD_FLAG) === "1";
    if (!alreadyAttempted) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
    }
  } catch {
    // sessionStorage can throw in private mode / if storage is full. Fall
    // back to a single reload anyway — better than a permanent error page.
  }
  if (alreadyAttempted) return;
  window.location.reload();
};

interface VitePreloadErrorEvent extends Event {
  payload?: unknown;
}

export const installChunkReloadHandler = (): void => {
  if (typeof window === "undefined") return;

  // Vite emits this event for every failed `import()` of a chunk it
  // generated, before the rejection bubbles up to React/TanStack Router.
  window.addEventListener("vite:preloadError", (event: Event) => {
    const preloadEvent = event as VitePreloadErrorEvent;
    if (isStaleChunkError(preloadEvent.payload)) {
      reloadOnce();
    } else {
      // The event always implies a chunk failure, so reload even if the
      // payload shape is unfamiliar.
      reloadOnce();
    }
  });

  // Belt-and-braces: catch unhandled rejections from `import()` calls
  // that bypass the Vite event (e.g. CSS chunks, third-party imports).
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) {
      reloadOnce();
    }
  });

  // Clear the reload flag on a successful page load so the next stale-
  // chunk error in this tab gets a fresh chance to recover.
  window.addEventListener("load", () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
  });
};
