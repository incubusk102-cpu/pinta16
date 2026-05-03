// Double-submit CSRF helpers.
//
// Threat model: an attacker tricks a logged-in admin / user into
// loading attacker.example, which fires a cross-origin POST at
// canvhub.com. The browser auto-attaches the `cv_admin_session` /
// `cv_user_session` cookie because cookies are ambient. Without CSRF
// the attacker can place orders, change passwords, etc. as the victim.
//
// Defence: pair every session cookie with a non-HttpOnly `cv_csrf`
// cookie. JS on canvhub.com reads it and echoes it back as the
// `X-CSRF-Token` header on every state-changing request. attacker.com
// can't read the cookie (different origin → SOP), so it can't forge
// the matching header. Server compares cookie value to header value in
// constant time and rejects on mismatch.
//
// Authorization-header auth (legacy / curl / CI) does NOT need CSRF —
// the browser doesn't auto-attach `Authorization`, the attacker would
// have to first steal the token, at which point CSRF is moot.

import { readCookie } from "./cookies.js";

export const CSRF_COOKIE_NAME = "cv_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

// Methods that can mutate state. GET / HEAD / OPTIONS are exempt by
// design (RFC 9110 says safe methods don't change state).
export const STATE_CHANGING_METHODS = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// 32 random bytes → 64 hex chars. Enough entropy that brute-forcing a
// single request would take longer than the cookie's lifetime even at
// 1 M req/s.
export const generateCsrfToken = () =>
  toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));

const utf8 = new TextEncoder();

const constantTimeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = utf8.encode(a);
  const bb = utf8.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
};

// Verify the CSRF double-submit. Returns true when the request is
// CSRF-safe (legacy header auth, safe method, or cookie auth with a
// matching header). Returns false when cookie auth is in use AND the
// header is missing / different from the cookie.
//
// The caller passes:
//   - method: HTTP method (case-insensitive)
//   - usingCookieAuth: true when the request was authed via cookie
//     (i.e. extractToken found a cookie and *not* an Authorization
//     header). When false, CSRF is skipped entirely.
//
// We don't require a CSRF cookie when usingCookieAuth=false because
// anonymous (un-authed) requests can't be CSRF'd into doing anything
// privileged anyway.
export const verifyCsrf = (event, { method, usingCookieAuth }) => {
  if (!usingCookieAuth) return true;
  const m = String(method || "").toUpperCase();
  if (!STATE_CHANGING_METHODS.has(m)) return true;
  const cookieValue = readCookie(event, CSRF_COOKIE_NAME);
  if (!cookieValue) return false;
  const headerValue =
    event?.headers?.[CSRF_HEADER_NAME] ??
    event?.headers?.["X-CSRF-Token"] ??
    "";
  if (typeof headerValue !== "string" || headerValue.length === 0) {
    return false;
  }
  return constantTimeEqual(cookieValue, headerValue);
};
