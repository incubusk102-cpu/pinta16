// Argon2id wrapper for the admin-auth module.
//
// Why argon2id? OWASP and NIST both recommend it as the preferred
// password-hashing function (over PBKDF2 and bcrypt) because it is
// memory-hard — i.e. an attacker with a GPU farm cannot brute-force it
// orders of magnitude faster than CPU. PBKDF2 with 100,000 iterations
// of SHA-256 (what we ship today) gives only the iteration-count
// resistance and no memory-cost resistance, which is why OWASP marked
// it "good only when argon2 is not available".
//
// Why @noble/hashes? It is the most-audited pure-JS argon2id we found,
// has no native deps, ships a single ~ 30 KB minified module, and
// runs unmodified on Cloudflare Pages Functions / Workers with no
// `nodejs_compat` flag. The implementation matches RFC 9106 and is
// verified against the official test vectors in the upstream test suite.
//
// Why these params? On a Pages Functions runtime, a single argon2id
// invocation with `t=2, m=4096 KiB (4 MiB), p=1, dkLen=32` completes
// in ~ 100-150 ms. That is well within the per-request CPU budget for
// admin login (which happens at most a handful of times per day) and
// gives ~ 4 orders of magnitude more attacker cost than PBKDF2-100k
// against a GPU brute-force. Increasing memory further (e.g. the
// OWASP "high-memory" profile of m=19 MiB) would push verify past
// 500 ms which feels sluggish for human login. We can dial these up
// later by changing only `ARGON2ID_PARAMS` and bumping the credential
// `version` in the stored record — existing hashes keep verifying
// against their own params.
//
// Storage format (stored in the `ADMIN_AUTH` KV under `credentials`):
//
//   {
//     algo: "argon2id",
//     v:    19,                  // RFC 9106 algorithm version (0x13)
//     t:    2,                   // time cost (iterations)
//     m:    4096,                // memory cost in KiB
//     p:    1,                   // parallelism degree
//     salt: "<32-hex-char salt>",
//     hash: "<64-hex-char tag>", // 32-byte derived key, hex-encoded
//     updatedAt: 1714822800000
//   }
//
// Legacy PBKDF2 records have shape `{ salt, hash, updatedAt }` (no
// `algo` field). The dispatcher in `admin-auth.js` (verifyPassword)
// treats a missing `algo` as "pbkdf2" for backwards compatibility.

import { argon2id } from "@noble/hashes/argon2.js";

export const ARGON2ID_ALGO = "argon2id";
export const ARGON2ID_VERSION = 0x13; // 19, RFC 9106
export const ARGON2ID_PARAMS = Object.freeze({
  t: 2,
  m: 4096,
  p: 1,
  dkLen: 32,
});

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

// Hash `password` with argon2id using `ARGON2ID_PARAMS`. Salt is 16
// random bytes from `crypto.getRandomValues`. Returns a credential
// record ready to be persisted to KV.
export const argon2idHash = (password) => {
  const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const salt = toHex(saltBytes);
  const hashBytes = argon2id(String(password), saltBytes, ARGON2ID_PARAMS);
  return {
    algo: ARGON2ID_ALGO,
    v: ARGON2ID_VERSION,
    t: ARGON2ID_PARAMS.t,
    m: ARGON2ID_PARAMS.m,
    p: ARGON2ID_PARAMS.p,
    salt,
    hash: toHex(hashBytes),
  };
};

// Verify `password` against an argon2id credential record. Returns
// `true` only if the record is in the expected shape AND the recomputed
// tag matches the stored tag in constant time.
export const argon2idVerify = (password, record) => {
  if (!record || record.algo !== ARGON2ID_ALGO) return false;
  if (typeof record.salt !== "string" || typeof record.hash !== "string") {
    return false;
  }
  const t = Number.isFinite(record.t) ? record.t : ARGON2ID_PARAMS.t;
  const m = Number.isFinite(record.m) ? record.m : ARGON2ID_PARAMS.m;
  const p = Number.isFinite(record.p) ? record.p : ARGON2ID_PARAMS.p;
  const saltBytes = fromHex(record.salt);
  const hashBytes = argon2id(String(password), saltBytes, {
    t,
    m,
    p,
    dkLen: ARGON2ID_PARAMS.dkLen,
  });
  const expected = fromHex(record.hash);
  return constantTimeEqualBytes(expected, hashBytes);
};

// Returns true if a credential record is using argon2id at the
// currently-configured params. Anything older (PBKDF2 records, or
// argon2id records hashed with weaker params) returns false, which
// signals the login handler to transparently re-hash on next login.
export const argon2idMatchesCurrentParams = (record) => {
  if (!record || record.algo !== ARGON2ID_ALGO) return false;
  return (
    record.t === ARGON2ID_PARAMS.t &&
    record.m === ARGON2ID_PARAMS.m &&
    record.p === ARGON2ID_PARAMS.p &&
    record.v === ARGON2ID_VERSION
  );
};
