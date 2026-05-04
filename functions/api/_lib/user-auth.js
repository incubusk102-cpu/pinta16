// User authentication helpers ported from netlify/lib/user-auth.js.
//
// Storage: USERS KV namespace, keyed by:
//   "users-by-email"      → { [email]: user }
//   "user-session-secret" → string

import crypto from "node:crypto";
import { makeStore } from "./kv-store.js";
import { requireKvBinding, getCloudflareEnv } from "./context.js";
import { readCookie } from "./cookies.js";

// HttpOnly cookie that carries the storefront-user session JWT. Set on
// signup / login, cleared on logout. Browsers auto-attach it to
// same-origin requests so authenticated `/api/users` and `/api/orders`
// calls don't need the legacy `Authorization: Bearer` header.
export const USER_SESSION_COOKIE = "cv_user_session";

export const STORE_NAME = "users";
export const USERS_KEY = "users-by-email";
export const SECRET_KEY = "user-session-secret";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const PBKDF2_ITERATIONS = 120_000;
export const PBKDF2_KEYLEN = 32;
export const PBKDF2_DIGEST = "sha256";
export const MIN_PASSWORD_LENGTH = 8;
export const INACTIVE_DAYS = 30;
export const INACTIVE_MS = INACTIVE_DAYS * 24 * 60 * 60 * 1000;

export const getUsersStore = () => makeStore(requireKvBinding("USERS"));

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  return { salt, hash };
};

export const verifyPassword = (password, salt, expectedHash) => {
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString("hex");
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
};

const base64UrlEncode = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlDecode = (input) => {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, "base64").toString("utf8");
};

const sign = (payload, secret) =>
  crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const issueToken = (userId, secret) => {
  const payload = JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
  const encoded = base64UrlEncode(payload);
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
};

export const verifyTokenWithSecret = (token, secret) => {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded, secret);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (
    expectedBuf.length !== signatureBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, signatureBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (
      typeof payload.exp !== "number" ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const ensureSessionSecret = async (store) => {
  const existing = await store.get(SECRET_KEY, { type: "text" });
  if (existing) return existing;
  const candidate = crypto.randomBytes(48).toString("hex");
  try {
    await store.set(SECRET_KEY, candidate, { onlyIfNew: true });
  } catch {
    /* race */
  }
  return (await store.get(SECRET_KEY, { type: "text" })) || candidate;
};

export const readUsers = async (store) => {
  const data = await store.get(USERS_KEY, { type: "json" });
  return data && typeof data === "object" ? data : {};
};

export const writeUsers = async (store, users) =>
  await store.setJSON(USERS_KEY, users);

export const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

export const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));

// Pull the storefront-user session token out of an inbound request.
// Mirrors the dual-source admin model: prefer the legacy
// `Authorization: Bearer` header when both are present (so explicit
// clients opt into the CSRF-exempt legacy path) and fall back to the
// HttpOnly `cv_user_session` cookie for cross-site requests.
export const extractTokenWithSource = (event) => {
  const auth =
    event.headers?.authorization || event.headers?.Authorization || "";
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const value = auth.slice(7).trim();
    // SPAs that build the header before their token state has
    // hydrated will send the literal strings "null" / "undefined"
    // here. Treat those as missing so we fall through to the
    // cookie path instead of failing the JWT verify with a
    // misleading 401.
    if (value && value !== "null" && value !== "undefined") {
      return { token: value, source: "header" };
    }
  }
  const cookie = readCookie(event, USER_SESSION_COOKIE);
  if (typeof cookie === "string" && cookie.length > 0) {
    return { token: cookie, source: "cookie" };
  }
  return { token: null, source: null };
};

export const extractToken = (event) => extractTokenWithSource(event).token;

export const publicUser = (user) => {
  if (!user) return null;
  const out = {
    id: user.id,
    email: user.email,
    name: user.name || "",
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    addresses: Array.isArray(user.addresses) ? user.addresses : [],
    defaultAddressId: user.defaultAddressId || null,
    updatedAt: user.updatedAt || user.createdAt,
    birthday: user.birthday || "",
    firstOrderAt: user.firstOrderAt || "",
    referralCode: user.referralCode || "",
    referredBy: user.referredBy || "",
    vipEarlyAccess: user.vipEarlyAccess === true,
  };
  if (user.picture) out.picture = user.picture;
  if (user.provider) out.provider = user.provider;
  return out;
};

// "MM-DD" — visitor's birthday with no year (we don't need to know the
// age, only the calendar day). Empty string allowed = no birthday set.
export const sanitizeBirthday = (raw) => {
  if (raw == null) return "";
  const value = String(raw).trim();
  if (!value) return "";
  // Accept "YYYY-MM-DD" or "MM-DD"; normalize to "MM-DD".
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) {
    return `${isoMatch[2]}-${isoMatch[3]}`;
  }
  const shortMatch = /^(\d{2})-(\d{2})$/.exec(value);
  if (shortMatch) {
    const m = Number(shortMatch[1]);
    const d = Number(shortMatch[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return value;
  }
  return null; // invalid
};

// Stable, lowercase-friendly referral code. Avoids ambiguous chars.
const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const generateReferralCode = (name) => {
  const cleanName = String(name || "")
    .trim()
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const prefix = cleanName || "FRIEND";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += REFERRAL_ALPHABET.charAt(
      Math.floor(Math.random() * REFERRAL_ALPHABET.length),
    );
  }
  return `${prefix}-${suffix}`;
};

export const ensureReferralCode = (user) => {
  if (user.referralCode) return user.referralCode;
  const code = generateReferralCode(user.name || user.email);
  user.referralCode = code;
  return code;
};

export const findUserByReferralCode = (users, code) => {
  if (!code) return null;
  const upper = String(code).trim().toUpperCase();
  for (const value of Object.values(users)) {
    if (value && value.referralCode === upper) return value;
  }
  return null;
};

export const findUserById = (users, id) => {
  for (const value of Object.values(users)) {
    if (value && value.id === id) return value;
  }
  return null;
};

// Resolve the signed-in customer from the session bearer token. Used by
// every endpoint that needs to authenticate a regular (non-admin) user.
// Returns null when the token is missing, malformed, expired, or
// references a user that no longer exists.
//
// Pass either an existing `usersStore` (if the caller already opened
// one) or omit it and we'll open the default users store.
export const getCurrentUserFromSession = async (event, usersStore) => {
  const token = extractToken(event);
  if (!token) return null;
  const store = usersStore || getUsersStore();
  const secret = await ensureSessionSecret(store);
  const payload = verifyTokenWithSecret(token, secret);
  if (!payload?.sub) return null;
  const users = await readUsers(store);
  return findUserById(users, payload.sub);
};

const escapeHtml = (input) =>
  String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sendInactiveDeletionEmail = async (user) => {
  const env = getCloudflareEnv();
  const apiKey = env.RESEND_API_KEY || "";
  const from = env.RESEND_FROM || "Canvas Hub <onboarding@resend.dev>";
  const siteUrl = env.URL || "https://canvhub.com";
  if (!apiKey) {
    return { skipped: true, reason: "no-api-key" };
  }
  const subject = "Your Canvas Hub account was removed for inactivity";
  const safeName = escapeHtml(user.name || "there");
  const safeEmail = escapeHtml(user.email || "");
  const safeSignup = `${escapeHtml(siteUrl)}/signup`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
      <h2 style="margin:0 0 16px">Hi ${safeName},</h2>
      <p>Your Canvas Hub account (<strong>${safeEmail}</strong>) was removed
      because it has been inactive for ${INACTIVE_DAYS} days.</p>
      <p>If this was a mistake, you're welcome to sign up again any time at
      <a href="${safeSignup}">${safeSignup}</a>.</p>
      <p style="margin-top:24px;color:#666;font-size:12px">— Canvas Hub</p>
    </div>
  `.trim();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [user.email], subject, html }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, status: response.status, detail: data };
    }
    return { ok: true, id: data?.id };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
};

export const runInactiveUserCleanup = async (store) => {
  const users = await readUsers(store);
  const now = Date.now();
  const removed = [];
  const kept = {};
  for (const [email, user] of Object.entries(users)) {
    const last = Date.parse(user.lastSeenAt || user.createdAt || "");
    if (Number.isFinite(last) && now - last > INACTIVE_MS) {
      removed.push(user);
    } else {
      kept[email] = user;
    }
  }
  if (removed.length === 0) {
    return { removed: [], remaining: Object.keys(kept).length, emails: [] };
  }
  await writeUsers(store, kept);
  const emails = [];
  for (const user of removed) {
    const result = await sendInactiveDeletionEmail(user);
    emails.push({ email: user.email, ...result });
  }
  return {
    removed: removed.map(publicUser),
    remaining: Object.keys(kept).length,
    emails,
  };
};
