import { wrapHandler } from "./_lib/handler-wrapper.js";
import { logError } from "./_lib/redact.js";
import crypto from "node:crypto";
import {
  ensureSessionSecret,
  getUsersStore,
  isValidEmail,
  issueToken,
  normalizeEmail,
  publicUser,
  readUsers,
  TOKEN_TTL_SECONDS,
  USER_SESSION_COOKIE,
  writeUsers,
} from "./_lib/user-auth.js";
import { CSRF_COOKIE_NAME, generateCsrfToken } from "./_lib/csrf.js";
import { serializeCookie } from "./_lib/cookies.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { appendAuditEvent } from "./_lib/audit-log.js";
import { loadWelcomeEmailConfig, sendWelcomeEmail } from "./_lib/email.js";

// Google Identity Services in `ux_mode: "redirect"` form-POSTs the credential
// to this endpoint. We verify it server-side, create/update the user, issue a
// session token, and 302 the browser to /#auth=<base64-json> so the SPA can
// finalize sign-in and store the session in localStorage without bouncing
// through /login.
//
// This avoids the cross-origin postMessage that Brave / Safari / 3rd-party-
// cookie-blocked browsers drop on the ground in the popup flow.

const parseFormUrlEncoded = (body) => {
  const out = {};
  if (!body) return out;
  for (const pair of body.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    try {
      out[decodeURIComponent(k.replace(/\+/g, " "))] = decodeURIComponent(
        v.replace(/\+/g, " "),
      );
    } catch {
      /* ignore malformed pair */
    }
  }
  return out;
};

const redirect = (location, cookies) => ({
  statusCode: 302,
  headers: {
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  },
  ...(Array.isArray(cookies) && cookies.length > 0 ? { cookies } : {}),
  body: "",
});

// Match the Set-Cookie pair issued by /api/users?action=login (and its
// signup / google-login siblings) so a Google-redirect sign-in lands on
// the SPA already cookie-authenticated. Without this, the in-memory
// `#auth=…` token works on the first page but every subsequent
// state-changing API call (e.g. customer-return-request) reads no
// `cv_user_session` cookie and 401s.
const buildSessionCookies = (token, csrfToken) => [
  serializeCookie(USER_SESSION_COOKIE, token, {
    maxAgeSeconds: TOKEN_TTL_SECONDS,
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
  }),
  serializeCookie(CSRF_COOKIE_NAME, csrfToken, {
    maxAgeSeconds: TOKEN_TTL_SECONDS,
    httpOnly: false,
    secure: true,
    sameSite: "Strict",
    path: "/",
  }),
];

const errorRedirect = (event, message) => {
  const origin = resolveOrigin(event);
  // Land back on the homepage so visitors who signed in from the cart
  // (or anywhere else) don't get dropped on /login just to see an
  // error. The root-level GoogleAuthHashBridge reads `?error=` and
  // raises a toast on whatever route they end up on.
  const url = `${origin}/?error=${encodeURIComponent(message)}`;
  return redirect(url);
};

const ALLOWED_ORIGINS = [
  "canvhub.com",
  "www.canvhub.com",
  "localhost",
  "127.0.0.1",
];

const isAllowedHost = (host) => {
  const lower = (host || "").toLowerCase().split(":")[0];
  return ALLOWED_ORIGINS.some(
    (allowed) => lower === allowed || lower.endsWith(`.${allowed}`),
  );
};

const resolveOrigin = (event) => {
  const headers = event.headers || {};
  const proto =
    headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https";
  const host =
    headers["x-forwarded-host"] ||
    headers["X-Forwarded-Host"] ||
    headers.host ||
    headers.Host;
  if (!host) return "https://canvhub.com";
  if (!isAllowedHost(host)) return "https://canvhub.com";
  return `${proto}://${host}`;
};

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return errorRedirect(event, "Invalid request method");
    }

    const limit = await consumeRateLimit(event, {
      bucket: "user-google-login",
      windowMs: 15 * 60_000,
      max: 20,
    });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

    const body = parseFormUrlEncoded(event.body || "");
    const credential = String(body.credential || "");
    if (!credential) {
      return errorRedirect(event, "Missing Google credential");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      return errorRedirect(event, "Google login not configured");
    }

    let tokenRes;
    try {
      tokenRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      );
    } catch {
      return errorRedirect(event, "Could not verify Google token");
    }
    if (!tokenRes.ok) {
      return errorRedirect(event, "Invalid Google credential");
    }
    const googlePayload = await tokenRes.json();

    if (googlePayload.aud !== clientId) {
      return errorRedirect(event, "Token audience mismatch");
    }

    const email = normalizeEmail(googlePayload.email);
    if (!email || !isValidEmail(email)) {
      return errorRedirect(event, "Could not read email from Google account");
    }

    const store = getUsersStore(event);
    const now = new Date().toISOString();
    const users = await readUsers(store);
    let user = users[email];
    let isNewUser = false;

    if (user) {
      user.lastSeenAt = now;
      if (googlePayload.name && !user.name) {
        user.name = String(googlePayload.name).slice(0, 80);
      }
      if (googlePayload.picture) {
        user.picture = String(googlePayload.picture).slice(0, 2000);
      }
    } else {
      isNewUser = true;
      user = {
        id: crypto.randomUUID(),
        email,
        name: String(googlePayload.name || "").slice(0, 80),
        picture: String(googlePayload.picture || "").slice(0, 2000),
        provider: "google",
        createdAt: now,
        lastSeenAt: now,
      };
    }
    users[email] = user;
    await writeUsers(store, users);

    const secret = await ensureSessionSecret(store);
    const token = issueToken(user.id, secret);

    await appendAuditEvent(event, {
      type: "user.google-login",
      outcome: "success",
      subject: email,
      detail: "Google ID token verified (redirect flow)",
      ...captureRequestMeta(event),
    });

    if (isNewUser) {
      try {
        const welcome = await loadWelcomeEmailConfig();
        if (welcome && welcome.enabled !== false) {
          const result = await sendWelcomeEmail({ welcome, user });
          await appendAuditEvent(event, {
            type: "user.welcome-email",
            outcome: result?.delivered ? "success" : "skipped",
            subject: email,
            detail: result?.delivered
              ? `Welcome email sent via ${result.provider} (google-callback)`
              : `Welcome email skipped: ${result?.reason || result?.error || "unknown"} (google-callback)`,
            ...captureRequestMeta(event),
          });
        }
      } catch {
        /* never block sign-in on welcome-email failures */
      }
    }

    const payload = { token, user: publicUser(user) };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url",
    );
    const origin = resolveOrigin(event);
    const csrfToken = generateCsrfToken();
    // Land on the homepage. The root-level GoogleAuthHashBridge reads
    // `#auth=` and finalizes the session in place — no need to bounce
    // through /login just to parse the fragment. We also attach the
    // session + CSRF cookies so subsequent cookie-authed API calls
    // (returns, profile updates, etc.) and page reloads find a real
    // session, not just the in-memory React state.
    return redirect(
      `${origin}/#auth=${encoded}`,
      buildSessionCookies(token, csrfToken),
    );
  } catch (error) {
    logError("google-callback handler error:", error);
    return errorRedirect(event, "Internal error");
  }
};

export const onRequest = wrapHandler(handler);
