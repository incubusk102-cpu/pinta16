// Slim admin-auth helpers used by every Pages Function that needs to gate
// admin-only routes. Token verification is the only piece needed for the
// read-only / cache-friendly endpoints in the first migration PR; full
// admin login + credential management lives in the dedicated /api/admin-auth
// endpoint converted in the next PR.
//
// IMPORTANT: the session secret lives in the `ADMIN_SESSION_SECRET` env var
// on Cloudflare Pages, NOT in KV. This is more secure (KV browsing can't
// leak it) and removes the CAS race that the old Netlify implementation
// needed when generating the secret on first request. Set the env var to a
// long random hex string in the Pages dashboard before going live.

import { makeStore } from "./kv-store.js";

export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const base64UrlEncode = (input) => {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlDecode = (input) => {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

const importHmacKey = (secret) =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

const sign = async (payload, secret) => {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64UrlEncode(new Uint8Array(sig));
};

const constantTimeStringEquals = (a, b) => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
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
  if (!constantTimeStringEquals(expected, signature)) return false;

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

export const extractToken = (event) => {
  const auth =
    event.headers?.authorization || event.headers?.Authorization || "";
  if (typeof auth !== "string") return null;
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
};

// Pages-Functions-shaped: takes the synthesized event AND the env so we can
// read ADMIN_SESSION_SECRET. The returned boolean follows the same contract
// as the old Netlify isAuthenticated helper.
export const isAuthenticated = async (event, env) => {
  const token = extractToken(event);
  if (!token) return false;
  const secret = env?.ADMIN_SESSION_SECRET;
  if (!secret || typeof secret !== "string" || secret.length < 32) {
    // Fail closed if the env var is missing — never accept tokens against
    // an empty / short / unset secret, which would be trivially forgeable.
    return false;
  }
  return verifyTokenWithSecret(token, secret);
};

// Convenience used by the future admin-auth endpoint. Pulls the credentials
// blob out of the ADMIN_AUTH KV namespace, mirroring the Netlify shape.
export const getAuthStoreFromEnv = (env) => {
  if (!env?.ADMIN_AUTH) {
    throw new Error("ADMIN_AUTH KV namespace binding is missing");
  }
  return makeStore(env.ADMIN_AUTH);
};
