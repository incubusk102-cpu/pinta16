// TOTP (RFC 6238, HOTP RFC 4226) implementation for admin 2FA.
//
// Compatible with Google Authenticator / 1Password / Authy / Microsoft
// Authenticator / Aegis / FreeOTP — all of which default to HMAC-SHA1, 30 s
// step, 6 digits, which is what we use here.
//
// We accept a one-step skew window in either direction so a code typed at the
// edge of its validity window still verifies (RFC 6238 §5.2 — "The validation
// system should compare the received OTP with the OTP it generates with two
// adjacent time-step values [...]").
//
// Recovery codes: 10 single-use codes generated at enable time, displayed
// once, stored as argon2id hashes. The plaintext only ever leaves the server
// in the response to the "enable 2FA" / "regenerate codes" call.

import { hashPasswordArgon2id, verifyPasswordArgon2id } from "./argon2.js";

export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
export const TOTP_SKEW_STEPS = 1; // accept ±1 step (±30s) for clock drift
export const TOTP_ISSUER = "Canvas Hub";
export const TOTP_ACCOUNT = "admin";

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_BYTES = 5; // 5 bytes → 8 chars base32 → "XXXX-XXXX"

const utf8 = new TextEncoder();

// RFC 4648 base32 (no padding). Authenticator apps require this exact alphabet.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const bytesToBase32 = (bytes) => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
};

const base32ToBytes = (input) => {
  // Accept lower/upper-case, ignore spaces and dashes (so users can paste a
  // formatted-for-eyes string).
  const cleaned = String(input || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
};

/**
 * Generate a fresh 20-byte TOTP secret (RFC 4226 §4 minimum, RFC 6238 §5.1
 * recommends 160-bit shared secrets) and return the base32 encoding.
 */
export const generateTotpSecret = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(20));
  return bytesToBase32(bytes);
};

/**
 * Build the otpauth:// URI that authenticator apps consume.
 */
export const buildOtpAuthUrl = ({
  secret,
  issuer = TOTP_ISSUER,
  account = TOTP_ACCOUNT,
  digits = TOTP_DIGITS,
  period = TOTP_STEP_SECONDS,
}) => {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
};

const counterToBuffer = (counter) => {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // counter is < 2^53 — fits in two 32-bit halves.
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);
  return buf;
};

const hmacSha1 = async (keyBytes, dataBuf) => {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, dataBuf);
  return new Uint8Array(sig);
};

/**
 * Compute the HOTP value for a counter (RFC 4226 §5.3).
 */
export const hotp = async (secretBase32, counter, digits = TOTP_DIGITS) => {
  const keyBytes = base32ToBytes(secretBase32);
  if (keyBytes.length === 0) return "";
  const mac = await hmacSha1(keyBytes, counterToBuffer(counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const truncated =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  const code = truncated % 10 ** digits;
  return code.toString().padStart(digits, "0");
};

/**
 * Compute the current TOTP value (used for testing only — verification uses
 * verifyTotp which sweeps a small skew window).
 */
export const totp = async (
  secretBase32,
  { now = Date.now(), step = TOTP_STEP_SECONDS, digits = TOTP_DIGITS } = {},
) => {
  const counter = Math.floor(now / 1000 / step);
  return hotp(secretBase32, counter, digits);
};

/**
 * Verify a 6-digit code against a base32 secret. Returns true if the code
 * matches the current step or ±TOTP_SKEW_STEPS adjacent steps. Constant-time
 * compare.
 */
export const verifyTotp = async (
  secretBase32,
  code,
  {
    now = Date.now(),
    step = TOTP_STEP_SECONDS,
    digits = TOTP_DIGITS,
    skew = TOTP_SKEW_STEPS,
  } = {},
) => {
  const trimmed = String(code || "").replace(/\D/g, "");
  if (trimmed.length !== digits) return false;
  const counter = Math.floor(now / 1000 / step);
  let matched = false;
  // Iterate the full range every time so timing doesn't leak which step
  // matched (subtle, but free).
  for (let delta = -skew; delta <= skew; delta++) {
    const candidate = await hotp(secretBase32, counter + delta, digits);
    let diff = candidate.length ^ trimmed.length;
    for (let i = 0; i < candidate.length && i < trimmed.length; i++) {
      diff |= candidate.charCodeAt(i) ^ trimmed.charCodeAt(i);
    }
    if (diff === 0) matched = true;
  }
  return matched;
};

/**
 * Generate `count` recovery codes. Each is 8 base32 characters formatted as
 * "XXXX-XXXX" for readability. Returns the plaintext codes (to display once)
 * AND argon2id hashes (to store).
 */
export const generateRecoveryCodes = async (count = RECOVERY_CODE_COUNT) => {
  const plaintext = [];
  const hashes = [];
  for (let i = 0; i < count; i++) {
    const bytes = globalThis.crypto.getRandomValues(
      new Uint8Array(RECOVERY_CODE_BYTES),
    );
    const raw = bytesToBase32(bytes).slice(0, 8);
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plaintext.push(formatted);
    // argon2id is intentionally serial — running 10 in parallel would peak
    // memory at 10× the per-hash budget on a memory-constrained edge runtime.
    hashes.push(await hashPasswordArgon2id(formatted));
  }
  return { plaintext, hashes };
};

/**
 * Verify a candidate recovery code against the stored hash array. Returns
 * the index of the matching hash (so the caller can mark it consumed) or -1
 * if no match. Iterates ALL hashes regardless of early match to keep timing
 * roughly constant.
 */
export const verifyRecoveryCode = async (candidate, hashes) => {
  if (!Array.isArray(hashes) || hashes.length === 0) return -1;
  const normalized = String(candidate || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  // Accept "ABCD-EFGH" or "ABCDEFGH" (paste with or without separator).
  const formatted =
    normalized.length === 8
      ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
      : normalized;
  let foundIndex = -1;
  for (let i = 0; i < hashes.length; i++) {
    // serial loop iterates ALL hashes regardless of early match to keep
    // total wall-clock time roughly constant across "match", "no match"
    // and "match-at-position-N" inputs.
    const ok = await verifyPasswordArgon2id(formatted, hashes[i]);
    if (ok && foundIndex === -1) foundIndex = i;
  }
  return foundIndex;
};

// Exposed for test vectors only; not part of the public KV schema.
export const __internal = { bytesToBase32, base32ToBytes, hotp };
