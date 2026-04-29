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

export const STORE_NAME = "admin-auth";
export const CREDENTIALS_KEY = "credentials";
export const SECRET_KEY = "session-secret";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PBKDF2_ITERATIONS = 120_000;
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

export const hashPassword = async (password) => {
  const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const salt = toHex(saltBytes);
  const hashBytes = await pbkdf2Bytes(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  return { salt, hash: toHex(hashBytes) };
};

export const verifyPassword = async (password, salt, expectedHash) => {
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

export const extractToken = (event) => {
  const auth =
    event.headers?.authorization || event.headers?.Authorization || "";
  if (typeof auth !== "string") return null;
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
};

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
