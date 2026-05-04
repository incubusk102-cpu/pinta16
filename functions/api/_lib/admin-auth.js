// Admin authentication helpers ported from netlify/lib/admin-auth.js.
//
// Storage: ADMIN_AUTH KV namespace, keyed by:
//   "credentials"     → { salt, hash, updatedAt }
//   "session-secret"  → string (rotated on password change)
//
// Crypto runs on the platform-native WebCrypto API (`globalThis.crypto`).
// On Cloudflare Workers / Pages Functions this is fast, hardware-accelerated,
// and always available — unlike Node's `crypto.pbkdf2Sync`, which throws under
// `nodejs_compat` and was the source of the admin-init "Internal error".
// Token format mirrors the original implementation so existing client tokens
// stay valid.

import { makeStore } from "./kv-store.js";
import { requireKvBinding } from "./context.js";
import { readCookie } from "./cookies.js";
import {
  argon2idHash,
  argon2idVerify,
  argon2idMatchesCurrentParams,
  ARGON2ID_ALGO,
} from "./argon2.js";

// HttpOnly cookie that carries the admin session JWT. Set on
// init / login / 2FA / passkey / rotate, cleared on logout. Browsers
// auto-attach it to same-origin requests, so handlers can authenticate
// the request without the legacy `Authorization: Bearer` header.
export const ADMIN_SESSION_COOKIE = "cv_admin_session";

export const STORE_NAME = "admin-auth";
export const CREDENTIALS_KEY = "credentials";
export const SECRET_KEY = "session-secret";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PBKDF2_ITERATIONS = 100_000;
export const PBKDF2_KEYLEN = 32;
export const PBKDF2_DIGEST = "SHA-256";
export const MIN_PASSWORD_LENGTH = 8;

export const getAuthStore = () => makeStore(requireKvBinding("ADMIN_AUTH"));

const utf8 = new TextEncoder();

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
};

const constantTimeEqualBytes = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

const pbkdf2Bytes = async (password, salt, iterations, keyLen, digest) => {
  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    utf8.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: utf8.encode(salt),
      iterations,
      hash: digest,
    },
    baseKey,
    keyLen * 8,
  );
  return new Uint8Array(bits);
};

const hmacSha256 = async (secret, data) => {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    typeof secret === "string" ? utf8.encode(secret) : secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    typeof data === "string" ? utf8.encode(data) : data,
  );
  return new Uint8Array(sig);
};

// All NEW passwords (initial admin set, password change, recovery
// rotation) are hashed with argon2id. Returns a credential record
// ready for `writeCredentials()`. The `updatedAt` field is added by
// the caller so it can mirror the server clock.
export const hashPassword = async (password) => argon2idHash(password);

// Backwards-compatible verify. Dispatches on `record.algo`:
//   - "argon2id" → argon2id RFC 9106 verify
//   - undefined (legacy) or "pbkdf2" → PBKDF2-SHA256 100k verify against
//                                       `record.salt` + `record.hash`
//
// Stored records before this change had shape `{ salt, hash, ... }`
// with no `algo` field, so the absence of `algo` is the signal that
// the record is PBKDF2. Any record written after this PR ships will
// have `algo: "argon2id"`.
//
// We keep the legacy `(password, salt, hash)` signature working for
// callers that haven't been updated yet — pass the third argument and
// the function flips into PBKDF2 mode unconditionally. New callers
// should pass the full credential record as the second argument.
export const verifyPassword = async (password, recordOrSalt, legacyHash) => {
  if (typeof legacyHash === "string") {
    // Legacy 3-arg call site. Treat as raw PBKDF2.
    return await pbkdf2Verify(password, recordOrSalt, legacyHash);
  }
  const record = recordOrSalt;
  if (!record || typeof record !== "object") return false;
  if (record.algo === ARGON2ID_ALGO) {
    return argon2idVerify(password, record);
  }
  // Legacy record shape: { salt, hash } with no `algo`.
  if (typeof record.salt === "string" && typeof record.hash === "string") {
    return await pbkdf2Verify(password, record.salt, record.hash);
  }
  return false;
};

const pbkdf2Verify = async (password, salt, expectedHash) => {
  const hashBytes = await pbkdf2Bytes(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  const expected = fromHex(expectedHash);
  return constantTimeEqualBytes(expected, hashBytes);
};

// Should the caller transparently re-hash this credential after a
// successful verify? Returns true for any record that is not already
// argon2id at the current params (so legacy PBKDF2 records, and
// argon2id records hashed with older `t/m/p` if we ever bump them,
// silently roll forward on next login).
export const passwordNeedsRehash = (record) =>
  !argon2idMatchesCurrentParams(record);

export const constantTimeEquals = async (a, b) => {
  const ha = await hmacSha256("constant-time-cmp", String(a));
  const hb = await hmacSha256("constant-time-cmp", String(b));
  return constantTimeEqualBytes(ha, hb);
};

const bytesToBase64 = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return globalThis.btoa(bin);
};

const base64UrlEncodeBytes = (bytes) =>
  bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlEncode = (str) => base64UrlEncodeBytes(utf8.encode(str));

const base64UrlDecode = (input) => {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = globalThis.atob(padded + padding);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const sign = async (payload, secret) => {
  const sig = await hmacSha256(secret, payload);
  return base64UrlEncodeBytes(sig);
};

export const issueToken = async (secret) => {
  const payload = JSON.stringify({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
  const encoded = base64UrlEncode(payload);
  const signature = await sign(encoded, secret);
  return `${encoded}.${signature}`;
};

export const verifyTokenWithSecret = async (token, secret) => {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const expected = await sign(encoded, secret);
  const expectedBytes = utf8.encode(expected);
  const signatureBytes = utf8.encode(signature);
  if (!constantTimeEqualBytes(expectedBytes, signatureBytes)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (
      typeof payload.exp !== "number" ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const ensureSessionSecret = async (store) => {
  const existing = await store.get(SECRET_KEY, { type: "text" });
  if (existing) return existing;
  const candidate = toHex(
    globalThis.crypto.getRandomValues(new Uint8Array(48)),
  );
  try {
    await store.set(SECRET_KEY, candidate, { onlyIfNew: true });
  } catch {
    /* another invocation won the race; fall through to re-read */
  }
  return (await store.get(SECRET_KEY, { type: "text" })) || candidate;
};

export const readCredentials = async (store) =>
  await store.get(CREDENTIALS_KEY, { type: "json" });

export const writeCredentials = async (store, credentials) =>
  await store.setJSON(CREDENTIALS_KEY, credentials);

export const writeCredentialsIfNew = async (store, credentials) => {
  const result = await store.setJSON(CREDENTIALS_KEY, credentials, {
    onlyIfNew: true,
  });
  return result?.modified !== false;
};

export const rotateSessionSecret = async (store) => {
  const secret = toHex(globalThis.crypto.getRandomValues(new Uint8Array(48)));
  await store.set(SECRET_KEY, secret);
  return secret;
};

// Pull the admin session token out of an inbound request. Accepts both
// the legacy `Authorization: Bearer` header (used by curl / CI / the
// in-memory React-state flow) and the HttpOnly `cv_admin_session`
// cookie (set on login and auto-attached by the browser on every
// same-origin request).
//
// We prefer the header when both are present so that explicit clients
// — tests, scripts, the SPA's own authed fetches — opt into the legacy
// path which is exempt from the CSRF double-submit check (they can't
// be victims of a cross-site request forgery: the browser doesn't
// auto-attach the `Authorization` header from a different origin).
// Cross-site attacks land in the cookie path, where CSRF is enforced.
//
// Returns `{ token, source }` where source is "header" | "cookie" |
// null. Callers that don't care about source can use `extractToken`.
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
  const cookie = readCookie(event, ADMIN_SESSION_COOKIE);
  if (typeof cookie === "string" && cookie.length > 0) {
    return { token: cookie, source: "cookie" };
  }
  return { token: null, source: null };
};

export const extractToken = (event) => extractTokenWithSource(event).token;

export const isAuthenticated = async (event) => {
  const token = extractToken(event);
  if (!token) return false;
  let store;
  try {
    store = getAuthStore();
  } catch {
    return false;
  }
  const secret = await ensureSessionSecret(store);
  return await verifyTokenWithSecret(token, secret);
};
