// Minimal RFC 8291 / RFC 8188 Web Push implementation that runs natively
// inside Cloudflare Pages Functions / Workers via the Web Crypto API.
// No node-only `web-push` dependency needed.
//
// Two responsibilities:
//   1. Build a VAPID JWT (ES256) signed with the application server private key.
//   2. Encrypt the payload as aes128gcm and POST it to the subscription endpoint.
//
// Keys (configured as env vars):
//   VAPID_PRIVATE_KEY  base64url-encoded P-256 'd' scalar (32 bytes raw)
//   VAPID_PUBLIC_KEY   base64url-encoded uncompressed P-256 point (65 bytes
//                      raw, leading 0x04 || X(32) || Y(32))
//   VAPID_SUBJECT      "mailto:order@canvhub.com" or a URL
//
// Subscription (from PushManager.subscribe in the browser):
//   { endpoint, keys: { p256dh, auth } }
//
// Reference: https://datatracker.ietf.org/doc/html/rfc8291

import { getCloudflareEnv } from "./context.js";

const enc = new TextEncoder();

const b64urlDecode = (s) => {
  if (!s) return new Uint8Array(0);
  const padded = s + "===".slice((s.length + 3) % 4);
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const b64urlEncode = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const concat = (...arrs) => {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
};

const hmacSha256 = async (keyBytes, data) => {
  const k = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
};

// Build a JWK from raw 32-byte 'd' scalar plus 65-byte uncompressed public key.
const ecJwkFromRaw = (privateRaw, publicRaw, usage) => {
  // publicRaw[0] = 0x04, [1..33) = X, [33..65) = Y
  const x = publicRaw.subarray(1, 33);
  const y = publicRaw.subarray(33, 65);
  return {
    kty: "EC",
    crv: "P-256",
    d: b64urlEncode(privateRaw),
    x: b64urlEncode(x),
    y: b64urlEncode(y),
    ext: true,
    key_ops: usage,
  };
};

// Sign a VAPID JWT (ES256) for the given audience (push service origin).
export const signVapidJwt = async ({
  privateKeyB64u,
  publicKeyB64u,
  subject,
  audience,
  expiresInSec = 12 * 3600,
}) => {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
    sub: subject,
  };
  const headerB = b64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadB = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB}.${payloadB}`;

  const privateRaw = b64urlDecode(privateKeyB64u);
  const publicRaw = b64urlDecode(publicKeyB64u);
  const jwk = ecJwkFromRaw(privateRaw, publicRaw, ["sign"]);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      enc.encode(signingInput),
    ),
  );
  // Web Crypto returns r||s (64 bytes for P-256) — that's exactly the format
  // VAPID expects (raw concatenation, not DER).
  return `${signingInput}.${b64urlEncode(signature)}`;
};

// Encrypt a payload per RFC 8291 (aes128gcm Content-Encoding from RFC 8188).
// Returns { body } — the bytes that go in the POST request body to the
// push endpoint.
export const encryptPayload = async ({ payload, p256dhB64u, authB64u }) => {
  const userPublicRaw = b64urlDecode(p256dhB64u); // 65 bytes
  const authSecret = b64urlDecode(authB64u); // 16 bytes

  // 1) Ephemeral application server ECDH keypair (one-shot, per send).
  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const asPublicJwk = await crypto.subtle.exportKey("jwk", asKeyPair.publicKey);
  const asPublicRaw = concat(
    new Uint8Array([0x04]),
    b64urlDecode(asPublicJwk.x),
    b64urlDecode(asPublicJwk.y),
  );

  // 2) Import user agent public key, derive 32-byte ECDH shared secret.
  const userPublicKey = await crypto.subtle.importKey(
    "raw",
    userPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: userPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  // 3) IKM = HMAC(PRK_key, ikm_info || 0x01); PRK_key = HMAC(auth_secret, ecdh).
  const PRK_key = await hmacSha256(authSecret, ecdhSecret);
  const ikmInfo = concat(
    enc.encode("WebPush: info\0"),
    userPublicRaw,
    asPublicRaw,
  );
  const IKM = await hmacSha256(
    PRK_key,
    concat(ikmInfo, new Uint8Array([0x01])),
  );

  // 4) PRK = HMAC(salt, IKM); CEK = HMAC(PRK, cek_info||0x01)[0..16];
  //    NONCE = HMAC(PRK, nonce_info||0x01)[0..12].
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const PRK = await hmacSha256(salt, IKM);
  const cekInfo = concat(
    enc.encode("Content-Encoding: aes128gcm\0"),
    new Uint8Array([0x01]),
  );
  const CEK = (await hmacSha256(PRK, cekInfo)).slice(0, 16);
  const nonceInfo = concat(
    enc.encode("Content-Encoding: nonce\0"),
    new Uint8Array([0x01]),
  );
  const NONCE = (await hmacSha256(PRK, nonceInfo)).slice(0, 12);

  // 5) AES-128-GCM encrypt: plaintext || 0x02 (last-record padding marker).
  const plaintext = typeof payload === "string" ? enc.encode(payload) : payload;
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey(
    "raw",
    CEK,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: NONCE }, cekKey, padded),
  );

  // 6) aes128gcm header (RFC 8188): salt(16) | rs(4 BE u32) | idlen(1) | keyid.
  // rs=4096 leaves plenty of headroom for our short JSON payloads.
  // keyid is the as_public key (65 raw uncompressed bytes).
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  const idlen = new Uint8Array([asPublicRaw.length]); // 65
  const body = concat(salt, rs, idlen, asPublicRaw, ciphertext);
  return { body };
};

// Send a single push notification to one subscription.
// Returns { ok, status, statusText, expired, body }.
//   expired === true when the push service tells us the subscription is gone
//   (HTTP 404 / 410). Caller should remove the subscription from KV.
export const sendPush = async (subscription, payload, vapid, options = {}) => {
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh) {
    return {
      ok: false,
      status: 0,
      statusText: "invalid subscription",
      expired: false,
      body: "",
    };
  }
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  let jwt;
  try {
    jwt = await signVapidJwt({
      privateKeyB64u: vapid.privateKey,
      publicKeyB64u: vapid.publicKey,
      subject: vapid.subject || "mailto:order@canvhub.com",
      audience,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: `vapid sign failed: ${err instanceof Error ? err.message : String(err)}`,
      expired: false,
      body: "",
    };
  }
  let body;
  try {
    ({ body } = await encryptPayload({
      payload,
      p256dhB64u: subscription.keys.p256dh,
      authB64u: subscription.keys.auth,
    }));
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: `encrypt failed: ${err instanceof Error ? err.message : String(err)}`,
      expired: false,
      body: "",
    };
  }
  const headers = {
    Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    TTL: String(options.ttl ?? 86400),
    Urgency: options.urgency || "normal",
  };
  if (options.topic) headers.Topic = String(options.topic).slice(0, 32);
  let res;
  try {
    res = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
      body,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: err instanceof Error ? err.message : String(err),
      expired: false,
      body: "",
    };
  }
  const respText = await res.text().catch(() => "");
  // 404/410 == subscription is permanently gone; caller should evict.
  const expired = res.status === 404 || res.status === 410;
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    expired,
    body: respText.slice(0, 500),
  };
};

// Pull VAPID config out of env (set in Cloudflare Pages → Settings → Env vars).
// Reads from getCloudflareEnv() (canonical for Pages Functions), with
// process.env as a fallback for legacy callers since the handler wrapper
// also mirrors env onto process.env for compatibility.
export const getVapidEnv = () => {
  const cf = getCloudflareEnv() || {};
  const proc =
    (typeof globalThis !== "undefined" && globalThis.process?.env) || {};
  const publicKey = String(
    cf.VAPID_PUBLIC_KEY || proc.VAPID_PUBLIC_KEY || "",
  ).trim();
  const privateKey = String(
    cf.VAPID_PRIVATE_KEY || proc.VAPID_PRIVATE_KEY || "",
  ).trim();
  const subject =
    String(cf.VAPID_SUBJECT || proc.VAPID_SUBJECT || "").trim() ||
    "mailto:order@canvhub.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
};

export const isWebPushConfigured = () => getVapidEnv() !== null;
