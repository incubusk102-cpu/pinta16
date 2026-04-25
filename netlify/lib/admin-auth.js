import { connectLambda, getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const STORE_NAME = "admin-auth";
export const CREDENTIALS_KEY = "credentials";
export const SECRET_KEY = "session-secret";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PBKDF2_ITERATIONS = 120_000;
export const PBKDF2_KEYLEN = 32;
export const PBKDF2_DIGEST = "sha256";
export const MIN_PASSWORD_LENGTH = 8;

export const getAuthStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

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

export const issueToken = (secret) => {
  const payload = JSON.stringify({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
  const encoded = base64UrlEncode(payload);
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
};

export const verifyTokenWithSecret = (token, secret) => {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;

  const expected = sign(encoded, secret);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (
    expectedBuf.length !== signatureBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, signatureBuf)
  ) {
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
  const candidate = crypto.randomBytes(48).toString("hex");
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
  const secret = crypto.randomBytes(48).toString("hex");
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
  const store = getAuthStore(event);
  const secret = await ensureSessionSecret(store);
  return verifyTokenWithSecret(token, secret);
};
