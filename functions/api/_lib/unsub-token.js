// HMAC-based unsubscribe tokens for marketing / cart-recovery emails.
//
// The previous implementation hashed the recipient's email with plain
// SHA-256 and used the resulting digest as an unsubscribe token. Because
// the hash had no server-side secret, anyone who knew (or guessed) a
// customer's email address could compute the token and silently opt
// them out of marketing / abandoned-cart emails. This module replaces
// that with HMAC-SHA-256 keyed by a server-side secret that is lazily
// generated and stored in the CUSTOMER_META KV namespace (mirroring
// the admin session-secret bootstrap pattern in `_lib/admin-auth.js`).
//
// The token shape (32 hex chars) and verification surface
// (`buildUnsubToken` + constant-time compare) stay the same so the
// rest of the email-rendering / unsubscribe-handling code only needs
// to swap which helper it imports.
//
// Tokens issued before this change cannot be verified after it ships:
// the secret didn't exist, so HMAC will not match. Old emails will
// surface an "Invalid link" page; affected customers can re-trigger
// an unsubscribe from the link in any newer email, from their
// account settings, or by replying to support@canvhub.com. Accepting
// the legacy hash would defeat the fix, so the cutover is deliberate.
//
// Storage: CUSTOMER_META KV, key `unsub-secret` → 96-char hex string.

import { getStore } from "./kv-stores.js";

const SECRET_KEY = "unsub-secret";
const TOKEN_HEX_CHARS = 32;
const utf8 = new TextEncoder();

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const hmacSha256Hex = async (secret, message) => {
  const key = await crypto.subtle.importKey(
    "raw",
    typeof secret === "string" ? utf8.encode(secret) : secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, utf8.encode(message));
  return toHex(new Uint8Array(sig));
};

// Lazy-init the shared unsubscribe HMAC secret. First invocation that
// finds the key empty writes a fresh 48-byte random hex string with
// `onlyIfNew`; concurrent writers fall through to the re-read so every
// invocation in the colo ends up with the same secret. Once written,
// the secret is stable for the lifetime of the deployment — rotating
// it would invalidate every outstanding unsubscribe link, which we do
// not want as a routine event.
export const ensureUnsubSecret = async () => {
  const store = getStore("customer-meta");
  const existing = await store.get(SECRET_KEY, { type: "text" });
  if (existing) return existing;
  const candidate = toHex(crypto.getRandomValues(new Uint8Array(48)));
  try {
    await store.set(SECRET_KEY, candidate, { onlyIfNew: true });
  } catch {
    // Another invocation won the race; fall through to the re-read.
  }
  return (await store.get(SECRET_KEY, { type: "text" })) || candidate;
};

// Build a 32-char hex unsubscribe token over an arbitrary list of
// string parts. Parts are joined with a `\x1f` (unit separator) byte
// so `("a", "b:c")` and `("a:b", "c")` cannot collide. Use the same
// shape on issue and verify so the HMAC matches.
export const buildUnsubToken = async (...parts) => {
  const secret = await ensureUnsubSecret();
  const message = parts.map((p) => String(p ?? "")).join("\x1f");
  const hex = await hmacSha256Hex(secret, message);
  return hex.slice(0, TOKEN_HEX_CHARS);
};

// Constant-time string compare. Both inputs are coerced to string and
// the loop runs over the longer of the two so the early-return path
// for "wrong length" doesn't leak via timing either.
export const constantTimeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const la = a.length;
  const lb = b.length;
  const len = Math.max(la, lb);
  let mismatch = la ^ lb;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i % la) || 0) ^ (b.charCodeAt(i % lb) || 0);
  }
  return mismatch === 0;
};
