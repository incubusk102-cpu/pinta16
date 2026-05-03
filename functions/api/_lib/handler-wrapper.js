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
import { isIpBlocked } from "./security-config.js";

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

const isJsonContentType = (request) => {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  return ct.startsWith("application/json");
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

  if (isScannerProbe(url.pathname)) {
    return jsonResponse(404, { error: "Not found" });
  }

  const ip = extractClientIp(request);
  if (ip && (await isIpBlocked(ip))) {
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
    if (
      (method === "POST" || method === "PUT" || method === "PATCH") &&
      !CSRF_EXEMPT_PATHS.has(url.pathname) &&
      !isJsonContentType(request)
    ) {
      return jsonResponse(415, {
        error: "Content-Type must be application/json",
      });
    }

    let event;
    try {
      event = await buildLambdaEvent(request);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return jsonResponse(413, {
          error: "Request body too large",
        });
      }
      throw error;
    }
    const result = await handler(event);
    return toPagesResponse(result);
  };
