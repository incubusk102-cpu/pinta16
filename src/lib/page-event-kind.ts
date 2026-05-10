// Map a TanStack Router pathname to one of the allow-listed `path_kind`
// buckets that the server will accept. The buckets stay stable across
// route refactors so the analytics rollups (funnel, by-kind histograms)
// don't break when a route is renamed or split. Keep in sync with
// `PAGE_EVENT_KINDS` in `functions/api/_lib/d1.js`.

export type PageEventKind =
  | "home"
  | "gallery"
  | "collection"
  | "product"
  | "preview"
  | "checkout"
  | "checkout-success"
  | "account"
  | "track"
  | "policy"
  | "login"
  | "signup"
  | "other";

export const pathToPageEventKind = (pathname: string): PageEventKind => {
  if (!pathname || typeof pathname !== "string") return "other";
  const path = pathname.split("?")[0].split("#")[0];

  if (path === "/" || path === "") return "home";
  if (path === "/collection" || path.startsWith("/collection/"))
    return "collection";
  if (path === "/login") return "login";
  if (path === "/signup") return "signup";
  if (path === "/track" || path.startsWith("/track/")) return "track";
  if (path.startsWith("/account")) return "account";
  if (path.startsWith("/checkout/success")) return "checkout-success";
  if (path.startsWith("/checkout")) return "checkout";
  if (path.startsWith("/product/")) return "product";
  if (path.startsWith("/preview/")) return "preview";
  if (path.startsWith("/policy/")) return "policy";
  if (path === "/gallery" || path.startsWith("/gallery/")) return "gallery";

  return "other";
};

// Coarse device classification good enough for "mobile vs desktop"
// breakdowns in the admin panel. Matches the categories the admin UI
// renders; never reads the User-Agent string directly server-side, only
// the bucket label.
export const detectDevice = (): "mobile" | "tablet" | "desktop" | "unknown" => {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return "unknown";
  try {
    const ua = navigator.userAgent || "";
    if (/Tablet|iPad/i.test(ua)) return "tablet";
    if (
      /Mobi|Android|iPhone|iPod|Opera Mini|IEMobile/i.test(ua) ||
      window.matchMedia?.("(max-width: 640px)").matches
    ) {
      return "mobile";
    }
    return "desktop";
  } catch {
    return "unknown";
  }
};
