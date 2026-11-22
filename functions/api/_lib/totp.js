// RFC 6238 (TOTP) + RFC 4648 (base32) helpers, hand-rolled on top of the
// platform-native WebCrypto API so we avoid a Node-only `crypto` import on
// the Workers runtime. Used to gate the admin login behind a 6-digit code
// from a standard authenticator app (Google Authenticator, 1Password,
// Authy, Bitwarden, etc.).
//
// All functions are deliberately small and dependency-free.

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
// One step (=30s) of clock drift tolerated on either side. Anything wider
// is a security regression — TOTP is meant to be roughly real-time.
const TOTP_DRIFT_STEPS = 1;
// 20 random bytes ≈ 160 bits — RFC 4226 recommendation. Encoded base32 it
// becomes a 32-character secret which is the typical authenticator length.
const SECRET_BYTES = 20;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const utf8 = new TextEncoder();

const hmacSha1 = async (keyBytes, dataBytes) => {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(sig);
};

const counterBytes = (counter) => {
  // 8-byte big-endian. JS bitwise ops can't span 32 bits cleanly so split.
  const high = Math.floor(counter / 0x1_0000_0000);
  const low = counter >>> 0;
  const out = new Uint8Array(8);
  out[0] = (high >>> 24) & 0xff;
  out[1] = (high >>> 16) & 0xff;
  out[2] = (high >>> 8) & 0xff;
  out[3] = high & 0xff;
  out[4] = (low >>> 24) & 0xff;
  out[5] = (low >>> 16) & 0xff;
  out[6] = (low >>> 8) & 0xff;
  out[7] = low & 0xff;
  return out;
};

// RFC 4226 dynamic truncation + modular reduction.
const truncate = (mac, digits) => {
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return code % 10 ** digits;
};

const totpAt = async (secretBytes, counter, digits = TOTP_DIGITS) => {
  const mac = await hmacSha1(secretBytes, counterBytes(counter));
  return truncate(mac, digits).toString().padStart(digits, "0");
};

// Encode a Uint8Array as RFC 4648 base32 (no padding; matches what every
// authenticator app expects when you scan an otpauth:// URI with a
// `secret=` query string).
export const encodeBase32 = (bytes) => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
};

// Permissive base32 decoder. Tolerates lowercase, spaces, and `=` padding
// because authenticator apps often round-trip secrets through QR codes that
// add padding for byte-alignment.
export const decodeBase32 = (input) => {
  const cleaned = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  if (!cleaned) return new Uint8Array(0);
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
};

export const generateSecretBase32 = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
  return encodeBase32(bytes);
};

// Build the otpauth:// URI consumed by authenticator apps. `issuer` shows
// up as the account label; `account` distinguishes multiple admins on the
// same issuer if you ever add more.
export const buildOtpauthUri = ({ issuer, account, secret }) => {
  const safeIssuer = encodeURIComponent(String(issuer || "Canvas Hub"));
  const safeAccount = encodeURIComponent(String(account || "admin"));
  const params = new URLSearchParams({
    secret: String(secret || ""),
    issuer: String(issuer || "Canvas Hub"),
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${safeIssuer}:${safeAccount}?${params.toString()}`;
};

// Verify a 6-digit TOTP code against a base32 secret. Returns true if the
// code matches the current step or any step within ±TOTP_DRIFT_STEPS.
export const verifyTotpCode = async (secretBase32, code) => {
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length !== TOTP_DIGITS) return false;
  const secretBytes = decodeBase32(secretBase32);
  if (secretBytes.length === 0) return false;

  const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  for (let drift = -TOTP_DRIFT_STEPS; drift <= TOTP_DRIFT_STEPS; drift++) {
    const expected = await totpAt(secretBytes, step + drift);
    // Constant-time compare: both strings are 6 ASCII chars so a simple
    // XOR loop is enough.
    let diff = expected.length ^ digits.length;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ (digits.charCodeAt(i) || 0);
    }
    if (diff === 0) return true;
  }
  return false;
};

// One-shot TOTP value for the *current* step. Used by tests / debugging.
export const currentTotp = async (secretBase32) => {
  const secretBytes = decodeBase32(secretBase32);
  if (secretBytes.length === 0) return "";
  const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  return totpAt(secretBytes, step);
};

// Recovery-code helpers. Codes are 10 hex chars (~40 bits of entropy)
// rendered as `XXXXX-XXXXX` for legibility. They are stored *hashed* on the
// server so a SECURITY_EVENTS dump alone wouldn't compromise them.

const RECOVERY_CODE_BYTES = 5;
const RECOVERY_CODE_COUNT = 8;

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const generateRecoveryCodes = (count = RECOVERY_CODE_COUNT) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const bytes = globalThis.crypto.getRandomValues(
      new Uint8Array(RECOVERY_CODE_BYTES),
    );
    const hex = toHex(bytes).toUpperCase();
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return codes;
};

const sha256 = async (input) => {
  const bytes = await globalThis.crypto.subtle.digest(
    "SHA-256",
    utf8.encode(String(input || "")),
  );
  return toHex(new Uint8Array(bytes));
};

const normalizeRecoveryCode = (code) =>
  String(code || "")
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");

export const hashRecoveryCode = async (code) => {
  const norm = normalizeRecoveryCode(code);
  if (norm.length === 0) return "";
  return sha256(norm);
};

export const hashRecoveryCodes = async (codes) =>
  Promise.all(codes.map((code) => hashRecoveryCode(code)));

// Returns the index of the matching hash on success, -1 otherwise. The
// caller is responsible for splicing the matched hash out of storage so a
// recovery code is single-use (the whole point — they exist to bootstrap
// you back in if your authenticator is lost, not as a permanent backup).
export const findRecoveryCodeIndex = async (code, hashedCodes) => {
  const target = await hashRecoveryCode(code);
  if (!target) return -1;
  if (!Array.isArray(hashedCodes)) return -1;
  for (let i = 0; i < hashedCodes.length; i++) {
    if (
      typeof hashedCodes[i] === "string" &&
      hashedCodes[i].length === target.length
    ) {
      // Constant-time string compare so we don't leak which codes are
      // close-but-not-quite via timing.
      let diff = 0;
      for (let j = 0; j < target.length; j++) {
        diff |= target.charCodeAt(j) ^ hashedCodes[i].charCodeAt(j);
      }
      if (diff === 0) return i;
    }
  }
  return -1;
};

export const TOTP_CONFIG = {
  period: TOTP_PERIOD_SECONDS,
  digits: TOTP_DIGITS,
  driftSteps: TOTP_DRIFT_STEPS,
  recoveryCount: RECOVERY_CODE_COUNT,
};
