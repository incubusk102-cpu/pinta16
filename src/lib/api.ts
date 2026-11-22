// Frontend helpers for the post-Tier-3-#11 cookie-based auth model.
//
// Browsers auto-attach the HttpOnly `cv_admin_session` / `cv_user_session`
// cookies to same-origin fetches, so most authed requests don't need an
// `Authorization` header at all. State-changing requests (POST / PUT /
// PATCH / DELETE) additionally need a double-submit CSRF token: the
// server set a non-HttpOnly `cv_csrf` cookie alongside the session
// cookie, JS reads it, echoes it back in `X-CSRF-Token`. The server
// compares the two values in constant time and rejects on mismatch.

const CSRF_COOKIE = "cv_csrf";

const readCookieFromDocument = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie || "";
  if (!cookies) return null;
  for (const segment of cookies.split(";")) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const k = segment.slice(0, eq).trim();
    if (k !== name) continue;
    const raw = segment.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
};

// Public: read the CSRF token from the `cv_csrf` cookie. Returns null
// when the cookie is missing (logged out, or the SPA hasn't booted yet).
export const readCsrfToken = (): string | null =>
  readCookieFromDocument(CSRF_COOKIE);

// Public: build the headers object for an authenticated, state-changing
// fetch. Spreadable into a `headers` literal:
//
//   fetch("/api/...", {
//     method: "POST",
//     headers: { "Content-Type": "application/json", ...authHeaders() },
//     body: JSON.stringify(payload),
//   });
//
// For GET requests the cookie alone is enough — no headers are needed
// from this helper, the browser attaches the session cookie itself.
export const authHeaders = (): Record<string, string> => {
  const csrf = readCsrfToken();
  return csrf ? { "X-CSRF-Token": csrf } : {};
};

// Public: helper for building a typical JSON POST headers object.
// Combines `Content-Type: application/json` with the CSRF token.
//
// IMPORTANT: use this for *every* state-changing same-origin fetch, even
// ones that look anonymous (newsletter signup, push subscribe, chat
// start, "notify me when in stock"). The Pages Functions wrapper
// (`functions/api/_lib/handler-wrapper.js → isCsrfRejected`) auto-rejects
// 403 the moment a session cookie is present without a matching
// `X-CSRF-Token` header — and any logged-in shopper has that cookie. A
// hardcoded `Content-Type: application/json` works fine for guests but
// silently breaks for logged-in users, which is hard to spot in QA.
export const jsonAuthHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  ...authHeaders(),
});

/**
 * Fetch wrapper that aborts if the request exceeds `timeoutMs`.
 * The AbortController is cleaned up on both success and failure.
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal ?? controller.signal,
    });
    return res;
  } finally {
    window.clearTimeout(timer);
  }
};
