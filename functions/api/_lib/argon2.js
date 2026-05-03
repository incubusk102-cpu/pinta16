// Argon2id password hashing for the admin auth flow.
//
// We migrated from PBKDF2 (still verified for back-compat — see verifyPassword
// in admin-auth.js) to argon2id because PBKDF2 is GPU/ASIC-acceleratable.
// Argon2id, the OWASP-recommended algorithm, is memory-hard: a parallel
// attacker pays the same RAM cost we do per try.
//
// Parameters: t=2, m=4096 KiB (4 MB), p=1, 32-byte tag.
// This is OWASP's "minimum acceptable" profile (Cheat Sheet, 2024 — used when
// memory budget is tight, e.g. edge runtimes). Cost on Cloudflare Pages
// Functions is ~150 ms wall-time per hash, which is well within the per-
// request CPU budget on the paid plan and only happens on init / login /
// password-change / 2FA-recovery-code-issue.
//
// Storage format (in the ADMIN_AUTH KV "credentials" record):
//   { algo: "argon2id", v: 1, t: 2, m: 4096, p: 1, salt, hash, updatedAt }
// vs. the legacy:
//   { salt, hash, updatedAt }     // implicit pbkdf2-sha256, 100k iterations
//
// On a successful login with a legacy record we transparently re-hash to
// argon2id so the next login uses the stronger algorithm.

import { argon2idAsync } from "@noble/hashes/argon2.js";

export const ARGON2ID_T = 2;
export const ARGON2ID_M = 4096; // KiB
export const ARGON2ID_P = 1;
export const ARGON2ID_TAG_LEN = 32;
export const ARGON2ID_VERSION = 1;

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

/**
 * Hash a password with argon2id. Returns a credentials record ready to be
 * persisted to KV. Salt is 16 random bytes (hex-encoded).
 */
export const hashPasswordArgon2id = async (password) => {
  const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const salt = toHex(saltBytes);
  const hashBytes = await argon2idAsync(
    utf8.encode(String(password)),
    saltBytes,
    {
      t: ARGON2ID_T,
      m: ARGON2ID_M,
      p: ARGON2ID_P,
      dkLen: ARGON2ID_TAG_LEN,
    },
  );
  return {
    algo: "argon2id",
    v: ARGON2ID_VERSION,
    t: ARGON2ID_T,
    m: ARGON2ID_M,
    p: ARGON2ID_P,
    salt,
    hash: toHex(hashBytes),
  };
};

/**
 * Verify a password against an argon2id record. Constant-time on the hash
 * compare. Re-derives with the record's stored params (so older records with
 * lower t/m still verify after we bump defaults).
 */
export const verifyPasswordArgon2id = async (password, record) => {
  if (!record || record.algo !== "argon2id") return false;
  const t = Number(record.t) || ARGON2ID_T;
  const m = Number(record.m) || ARGON2ID_M;
  const p = Number(record.p) || ARGON2ID_P;
  const saltBytes = fromHex(String(record.salt || ""));
  const expected = fromHex(String(record.hash || ""));
  if (saltBytes.length === 0 || expected.length === 0) return false;
  const computed = await argon2idAsync(
    utf8.encode(String(password)),
    saltBytes,
    { t, m, p, dkLen: expected.length },
  );
  return constantTimeEqualBytes(computed, expected);
};

/**
 * True iff the record needs to be re-hashed to upgrade params/algorithm.
 * After a successful PBKDF2 verification or a successful argon2id verification
 * with weaker-than-current params we re-hash to current defaults.
 */
export const needsRehash = (record) => {
  if (!record) return false;
  if (record.algo !== "argon2id") return true; // legacy / unknown → upgrade
  return (
    Number(record.t) < ARGON2ID_T ||
    Number(record.m) < ARGON2ID_M ||
    Number(record.p) < ARGON2ID_P ||
    Number(record.v) < ARGON2ID_VERSION
  );
};
