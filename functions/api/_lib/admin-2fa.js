// Admin 2FA storage + challenge helpers.
//
// State lives in the existing ADMIN_AUTH KV namespace under a single key:
//
//   "totp" → {
//     enabled: boolean,        // true once setup is verified
//     secret: string,          // base32, only present after setup-2fa
//     recoveryHashes: string[],// SHA-256 of normalised recovery codes
//     enabledAt: string|null,  // ISO timestamp
//     updatedAt: string|null,
//   }
//
// We also expose a small "challenge token" helper for the two-stage login
// flow: stage 1 verifies the password and (if 2FA is on) hands back a
// short-lived signed token; stage 2 trades that token + a TOTP code for a
// session token. The challenge token is HMAC-SHA-256 over the session
// secret so it can't be forged client-side, and it expires after
// CHALLENGE_TTL_SECONDS so a leaked token can't be replayed indefinitely.

import {
  buildOtpauthUri,
  generateRecoveryCodes,
  generateSecretBase32,
  hashRecoveryCodes,
} from "./totp.js";

export const TOTP_KEY = "totp";
export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const TOTP_ISSUER = "Canvas Hub";
export const TOTP_ACCOUNT = "admin";

const utf8 = new TextEncoder();

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

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
  return toHex(new Uint8Array(sig));
};

export const readTotpRecord = async (store) => {
  const raw = await store.get(TOTP_KEY, { type: "json" });
  if (!raw || typeof raw !== "object") return null;
  return {
    enabled: Boolean(raw.enabled),
    secret: typeof raw.secret === "string" ? raw.secret : "",
    recoveryHashes: Array.isArray(raw.recoveryHashes)
      ? raw.recoveryHashes.filter((h) => typeof h === "string")
      : [],
    enabledAt: typeof raw.enabledAt === "string" ? raw.enabledAt : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
};

export const writeTotpRecord = async (store, record) => {
  const now = new Date().toISOString();
  await store.setJSON(TOTP_KEY, { ...record, updatedAt: now });
};

export const deleteTotpRecord = async (store) => {
  // Workers KV doesn't expose a `delete` on our wrapper, so writing an
  // explicit "disabled" record is fine — `requires2FA()` keys off the
  // boolean so the secret is functionally inaccessible.
  await store.setJSON(TOTP_KEY, {
    enabled: false,
    secret: "",
    recoveryHashes: [],
    enabledAt: null,
    updatedAt: new Date().toISOString(),
  });
};

export const requires2FA = (record) =>
  Boolean(record && record.enabled && record.secret);

// Stage-1 → Stage-2 handoff. The challenge token is a base64url payload of
// `{nonce, exp}` plus an HMAC tag using the live session secret so it can
// only be minted server-side and only verified while the secret hasn't
// rotated. Using the session secret means a password change (which rotates
// the secret) also invalidates any in-flight 2FA challenges, which is the
// behaviour we want.

const base64UrlEncode = (str) => {
  const bin = utf8.encode(str);
  let out = "";
  for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin[i]);
  return globalThis
    .btoa(out)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlDecode = (input) => {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = globalThis.atob(padded + padding);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

export const issueChallengeToken = async (sessionSecret) => {
  const nonce = toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const payload = JSON.stringify({
    nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS,
  });
  const encoded = base64UrlEncode(payload);
  const sig = await hmacSha256(`2fa:${sessionSecret}`, encoded);
  return `${encoded}.${sig}`;
};

export const verifyChallengeToken = async (token, sessionSecret) => {
  if (typeof token !== "string" || !token.includes(".")) return false;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return false;
  const expected = await hmacSha256(`2fa:${sessionSecret}`, encoded);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return false;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded));
    if (typeof parsed.exp !== "number") return false;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
};

export const startTotpSetup = async (store) => {
  const secret = generateSecretBase32();
  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await hashRecoveryCodes(recoveryCodes);
  // We persist immediately as `enabled:false` so the secret is bound to the
  // session that started setup. A subsequent verify-2fa call flips the
  // boolean to true.
  await writeTotpRecord(store, {
    enabled: false,
    secret,
    recoveryHashes,
    enabledAt: null,
  });
  return {
    secret,
    recoveryCodes,
    uri: buildOtpauthUri({
      issuer: TOTP_ISSUER,
      account: TOTP_ACCOUNT,
      secret,
    }),
  };
};
