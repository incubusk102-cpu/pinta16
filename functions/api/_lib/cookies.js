// Cookie helpers for Cloudflare Pages Functions.
//
// We hit two recurring needs across the auth surface:
//
//   1. Read an inbound cookie out of the Netlify-Lambda-shaped event so
//      handlers can fall back to cookie-based auth when the legacy
//      `Authorization: Bearer` header is absent.
//   2. Build a `Set-Cookie` header value with the right hardening flags
//      (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`) without any
//      hand-rolled string concatenation at every callsite.
//
// Multi-cookie responses are emitted by attaching a `cookies` array to
// the handler's return value; `toPagesResponse` (in `lambda-event.js`)
// is taught to `headers.append('Set-Cookie', …)` for each entry. The
// flat `headers` object that `withSecurityHeaders()` returns can only
// carry a single `Set-Cookie` value, so the array path is required
// whenever a request needs to set both the session cookie and the
// double-submit CSRF cookie.

const COOKIE_PAIR_RE = /\s*([^=;]+)=([^;]*)\s*/g;

// Parse the inbound `Cookie` header from a Lambda-shaped event.
// Returns a plain object mapping cookie name -> raw value (URI-decoded
// where possible). Header lookup is case-insensitive because Cloudflare
// lowercases headers in `buildLambdaEvent`, but we belt-and-braces with
// `Cookie` too in case a future helper bypasses that.
export const parseCookies = (event) => {
  const raw = event?.headers?.cookie ?? event?.headers?.Cookie ?? "";
  if (typeof raw !== "string" || raw.length === 0) return {};
  const out = {};
  let match;
  COOKIE_PAIR_RE.lastIndex = 0;
  while ((match = COOKIE_PAIR_RE.exec(raw))) {
    const name = match[1].trim();
    if (!name) continue;
    const value = match[2].trim();
    if (out[name] !== undefined) continue; // first occurrence wins
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
};

// Read a single cookie by name from an event.
export const readCookie = (event, name) => {
  const all = parseCookies(event);
  return Object.prototype.hasOwnProperty.call(all, name) ? all[name] : null;
};

const sameSiteToken = (sameSite) => {
  if (sameSite === false) return null;
  const s = String(sameSite || "Strict");
  // Normalise to capital-cased form (browsers accept any case).
  if (s.toLowerCase() === "lax") return "Lax";
  if (s.toLowerCase() === "none") return "None";
  return "Strict";
};

// Build a `Set-Cookie` header value with sane defaults baked in:
// `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`. Callers can
// override any of these via opts, and pass `httpOnly: false` for the
// CSRF cookie which JS *does* need to read.
//
// `maxAgeSeconds` writes both `Max-Age` and `Expires` to keep older
// clients (esp. Safari ≤ 16) happy. Passing 0 deletes the cookie.
export const serializeCookie = (name, value, opts = {}) => {
  if (!name || typeof name !== "string") {
    throw new Error("serializeCookie: name is required");
  }
  const {
    maxAgeSeconds,
    path = "/",
    domain,
    sameSite = "Strict",
    secure = true,
    httpOnly = true,
  } = opts;

  const segments = [`${name}=${encodeURIComponent(value ?? "")}`];
  if (path) segments.push(`Path=${path}`);
  if (domain) segments.push(`Domain=${domain}`);
  if (typeof maxAgeSeconds === "number" && Number.isFinite(maxAgeSeconds)) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
    const expires =
      maxAgeSeconds <= 0
        ? new Date(0)
        : new Date(Date.now() + maxAgeSeconds * 1000);
    segments.push(`Expires=${expires.toUTCString()}`);
  }
  if (httpOnly) segments.push("HttpOnly");
  if (secure) segments.push("Secure");
  const ss = sameSiteToken(sameSite);
  if (ss) segments.push(`SameSite=${ss}`);
  return segments.join("; ");
};

// Build a `Set-Cookie` value that deletes the named cookie. Browsers
// only honour deletion when the path / domain match the cookie that's
// being cleared, so any non-default `Path` or `Domain` used at write
// time must be repeated here.
export const clearCookieHeader = (name, opts = {}) =>
  serializeCookie(name, "", { ...opts, maxAgeSeconds: 0 });
