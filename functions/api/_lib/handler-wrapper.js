// Standard wrapper that adapts a Netlify-style `handler(event)` into a
// Cloudflare Pages Function `onRequest({ request, env })`. Sets the
// per-request env on the context module so helpers (admin-auth, audit-log,
// rate-limit, email, etc.) can find it without each handler having to thread
// `env` through every call site.

import { setCloudflareContext } from "./context.js";
import {
  BodyTooLargeError,
  buildLambdaEvent,
  toPagesResponse,
} from "./lambda-event.js";
import {
  isIpBlocked,
  writeSecurityConfig,
  getSecurityConfig,
} from "./security-config.js";
import { logSecurityEvent, shouldAutoban } from "./security-events.js";
import { readCookie } from "./cookies.js";
import { ADMIN_SESSION_COOKIE } from "./admin-auth.js";
import { USER_SESSION_COOKIE } from "./user-auth.js";
import { CSRF_COOKIE_NAME, verifyCsrf } from "./csrf.js";

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const extractClientIp = (request) => {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== "function") return "";
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0];
    if (first) return first.trim();
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "";
};

const extractClientCountry = (request) => {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== "function") return "";
  const cc = (headers.get("cf-ipcountry") || "").trim().toUpperCase();
  if (!cc || cc === "XX") return "";
  return cc.slice(0, 4);
};

// Mirror Cloudflare env onto `process.env` so legacy code that reads
// `process.env.X` (ported verbatim from the Netlify functions) keeps working
// under the nodejs_compat flag without rewriting every reference. Idempotent.
const mirrorEnvToProcess = (env) => {
  if (typeof globalThis.process === "undefined") {
    globalThis.process = { env: {} };
  } else if (!globalThis.process.env) {
    globalThis.process.env = {};
  }
  for (const key of Object.keys(env || {})) {
    const value = env[key];
    if (typeof value === "string") {
      globalThis.process.env[key] = value;
    }
  }
};

// Common vulnerability scanner paths. Requests for these are rejected
// immediately so the handler never runs. This catches Metasplitable-style
// automated scanners probing for common server-side vulnerabilities.
const SCANNER_PATH_PATTERN =
  /(?:\.(?:php|asp|aspx|cgi|jsp|env|git|svn|bak|old|sql|tar|gz|zip|log|ini|conf|config|yml|yaml|xml|swp|DS_Store|htaccess|htpasswd)|\/(?:wp-admin|wp-login|wp-content|phpMyAdmin|phpmyadmin|pma|myadmin|admin\.php|xmlrpc|cgi-bin|\.well-known\/debug|server-status|server-info|debug|console|shell|eval|exec|cmd|command|\.env|actuator|druid|solr|jenkins|jmx|manager\/html)(?:\/|$))/i;

const isScannerProbe = (pathname) => SCANNER_PATH_PATTERN.test(pathname);

// Enforce that mutating requests include a JSON Content-Type. This blocks
// cross-site form POSTs (CSRF via plain HTML forms) which browsers submit
// as application/x-www-form-urlencoded or multipart/form-data. The only
// exception is /api/google-callback which legitimately receives
// application/x-www-form-urlencoded from Google's redirect flow, and
// /api/uploads which receives raw image bytes.
const CSRF_EXEMPT_PATHS = new Set(["/api/google-callback", "/api/uploads"]);

// Endpoints that handle their own CSRF gate inline (because they need
// finer-grained per-action exemptions, e.g. login / signup / passkey
// challenge flows where no session cookie has been set yet) OR have an
// alternative CSRF protection model (signed third-party token verified
// inside the handler). These skip the wrapper-level CSRF check.
//
// `/api/google-callback` is in here because Google's redirect flow
// form-POSTs to us from accounts.google.com, so the browser never
// attaches our `cv_csrf` cookie/header. The protection is the signed
// Google ID token (`credential` field) — it's verified against the
// google tokeninfo endpoint and the `aud` claim is checked against our
// client_id, so a replay or forgery from a different site is rejected
// before any state changes.
const CSRF_INLINE_PATHS = new Set([
  "/api/admin-auth",
  "/api/users",
  "/api/google-callback",
]);

// Pull a Lambda-style headers shim out of the inbound Pages request so
// the cookie / CSRF helpers can reuse the existing event shape without
// us having to thread a separate `Headers` reference through them.
const buildHeadersShim = (request) => {
  const out = {};
  if (request?.headers && typeof request.headers.entries === "function") {
    for (const [k, v] of request.headers.entries()) {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
};

const STATE_CHANGING_METHOD_RE = /^(POST|PUT|PATCH|DELETE)$/;

// Wrapper-level CSRF guard: any state-changing request that comes in
// with a session cookie (admin or user) MUST also include a matching
// `X-CSRF-Token` header. This catches every endpoint that relies on
// `wrapHandler` — finer-grained exemptions live in the per-endpoint
// handlers (see `CSRF_INLINE_PATHS`). Authorization-header auth is
// exempt because the browser doesn't auto-attach that header.
const isCsrfRejected = (request, pathname) => {
  if (!STATE_CHANGING_METHOD_RE.test(request.method)) return false;
  if (CSRF_INLINE_PATHS.has(pathname)) return false;
  const headersShim = buildHeadersShim(request);
  const eventLike = { headers: headersShim };
  const adminCookie = readCookie(eventLike, ADMIN_SESSION_COOKIE);
  const userCookie = readCookie(eventLike, USER_SESSION_COOKIE);
  if (!adminCookie && !userCookie) return false;
  // If the caller is also sending a Bearer header, we treat that as
  // the authoritative auth and skip CSRF. Cookie may be a stale leftover.
  const auth = headersShim.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) return false;
  return !verifyCsrf(eventLike, {
    method: request.method,
    usingCookieAuth: true,
  });
};

const isJsonContentType = (request) => {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  return ct.startsWith("application/json");
};

export const autobanIfNeeded = async (ip) => {
  if (!ip) return;
  try {
    // Short-circuit if the IP is already banned. getSecurityConfig() is
    // cached for ~30s, so this is essentially free; without this check
    // every additional probe from a banned IP would otherwise force
    // shouldAutoban() to sweep the hourly buckets again, turning
    // auto-ban into a KV-read amplifier during a scanner storm.
    const cfg = await getSecurityConfig();
    if (cfg.ipBlockList.includes(ip)) return;
    if (!(await shouldAutoban(ip))) return;
    // Re-check with the fresh cached value: if some other request beat
    // us to the ban, skip the redundant write.
    const fresh = await getSecurityConfig();
    if (fresh.ipBlockList.includes(ip)) return;
    await writeSecurityConfig({
      ipBlockList: [...fresh.ipBlockList, ip],
    });
  } catch {
    // Best effort — never block the response.
  }
};

// Shared preflight: sets per-request context, mirrors env onto process.env,
// then enforces the IP block list from the Admin → Security panel. Returns a
// Response when the request should be short-circuited (e.g. blocked IP), or
// `null` when the handler should continue.
//
// Endpoints that don't use `wrapHandler` (newsletter, products, hero-slides,
// storefront-config, uploads, visitors) call this helper at the top of their
// own onRequest so the IP block applies uniformly across the whole API.
export const initRequestContext = async ({ request, env }) => {
  setCloudflareContext(env);
  mirrorEnvToProcess(env);

  const url = new URL(request.url);

  const ip = extractClientIp(request);
  const country = extractClientCountry(request);
  const ua = request.headers?.get?.("user-agent") || "";

  if (isScannerProbe(url.pathname)) {
    void logSecurityEvent({
      type: "scanner",
      ip,
      country,
      path: url.pathname,
      detail: "Vulnerability scanner probe",
      userAgent: ua,
    });
    void autobanIfNeeded(ip);
    return jsonResponse(404, { error: "Not found" });
  }

  if (ip && (await isIpBlocked(ip))) {
    void logSecurityEvent({
      type: "ip-blocked",
      ip,
      country,
      path: url.pathname,
      detail: "Request from blocked IP",
      userAgent: ua,
    });
    return jsonResponse(403, { error: "Forbidden" });
  }
  return null;
};

export const wrapHandler =
  (handler) =>
  async ({ request, env }) => {
    const blocked = await initRequestContext({ request, env });
    if (blocked) return blocked;

    const url = new URL(request.url);
    const method = request.method;
    const ip = extractClientIp(request);
    const country = extractClientCountry(request);
    const ua = request.headers?.get?.("user-agent") || "";
    if (
      (method === "POST" || method === "PUT" || method === "PATCH") &&
      !CSRF_EXEMPT_PATHS.has(url.pathname) &&
      !isJsonContentType(request)
    ) {
      void logSecurityEvent({
        type: "csrf",
        ip,
        country,
        path: url.pathname,
        detail: `CSRF attempt: ${request.headers?.get?.("content-type") || "no content-type"}`,
        userAgent: ua,
      });
      void autobanIfNeeded(ip);
      return jsonResponse(415, {
        error: "Content-Type must be application/json",
      });
    }

    // Double-submit CSRF check for cookie-authenticated state-changing
    // requests. Endpoints under `CSRF_INLINE_PATHS` enforce their own
    // gate (because they need per-action carve-outs for pre-auth flows
    // like login). Endpoints with no session cookie don't need a CSRF
    // check — anonymous requests can't be CSRF'd into anything privileged.
    if (isCsrfRejected(request, url.pathname)) {
      void logSecurityEvent({
        type: "csrf",
        ip,
        country,
        path: url.pathname,
        detail: "Missing or mismatched X-CSRF-Token",
        userAgent: ua,
      });
      void autobanIfNeeded(ip);
      return jsonResponse(403, { error: "Invalid CSRF token" });
    }

    let event;
    try {
      event = await buildLambdaEvent(request);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        void logSecurityEvent({
          type: "body-too-large",
          ip,
          country,
          path: url.pathname,
          detail: "Request body exceeded size limit",
          userAgent: ua,
        });
        void autobanIfNeeded(ip);
        return jsonResponse(413, {
          error: "Request body too large",
        });
      }
      throw error;
    }
    const result = await handler(event);
    return toPagesResponse(result);
  };
