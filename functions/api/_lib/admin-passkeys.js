// Admin passkeys (WebAuthn) — registration + authentication state and
// storage helpers. The actual cryptographic verification is delegated
// to @simplewebauthn/server, which is the de-facto standard
// implementation (audited, covers all the COSE algorithm + attestation
// edge cases). Hand-rolling WebAuthn signature verification on the
// Workers runtime is not safe.
//
// Storage layout (all keys live in the ADMIN_AUTH KV namespace):
//   "passkeys"                         → array of stored credentials
//   "passkey-config"                   → { requirePasskey: boolean, updatedAt }
//   "webauthn-challenge:<nonce>"       → { challenge, purpose, expiresAt }
//
// Stored credential shape:
//   { id, publicKey, counter, transports, name, createdAt, lastUsedAt,
//     credentialDeviceType, backupEligible, backupState }
//
// `id` and `publicKey` are stored as base64url strings — the
// @simplewebauthn/server v11 API uses raw base64url throughout.
//
// `counter` is incremented on every successful authentication. We
// reject any attempt that would not increase the counter, except for
// authenticators that always report 0 (passkeys backed up to the
// platform's keychain typically do this).

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";

const PASSKEYS_KEY = "passkeys";
const CONFIG_KEY = "passkey-config";
const CHALLENGE_KEY_PREFIX = "webauthn-challenge:";
const CHALLENGE_TTL_SECONDS = 300;

const RP_NAME = "Canvas Hub";

// Allowlist of valid RPIDs derived from server-side configuration.
// Add entries here if WebAuthn ever needs to be served across multiple
// apex domains — never accept a value supplied by the client.
const RPID_ALLOWLIST = new Set(["canvhub.com", "www.canvhub.com"]);

// Resolve the relying party ID (RPID) and expected origin from the
// request. RPID is always the host without port — WebAuthn requires
// this — and origin is the full https://host (or http://localhost for
// dev). Both must match what the browser sees, otherwise verification
// fails.
//
// SECURITY: the RPID is derived exclusively from the request's Origin
// header (or the rawUrl as a same-origin fallback). The previous
// implementation honored an `x-webauthn-rpid` request header, which
// would have let a hostile client forge the relying party identity
// during registration / authentication. Header overrides have been
// removed; if multi-domain support is ever needed, extend
// `RPID_ALLOWLIST` above and the post-derivation gate will accept it.
const getRpid = (event) => {
  const headers = event?.headers || {};
  // Derive the host candidate from the Origin header first — that's
  // the value the browser will use to scope the credential, so it must
  // match exactly during verification.
  let host = "";
  const origin = headers.origin;
  if (origin) {
    try {
      host = new URL(String(origin)).hostname;
    } catch {
      host = "";
    }
  }
  // Same-origin fallback for environments where the Origin header is
  // stripped (some same-site fetches). Never trust client-supplied
  // headers like `x-forwarded-host` or `x-webauthn-rpid` here.
  if (!host) {
    try {
      host = new URL(event.rawUrl).hostname;
    } catch {
      host = "";
    }
  }
  if (!host) return "";
  // localhost / .local always pass through unchanged so the dev
  // experience keeps working without polluting the prod allowlist.
  if (host === "localhost" || host.endsWith(".local")) return host;
  // Production: gate the derived host against the allowlist. WebAuthn
  // allows an RP ID to be a registrable domain suffix of the caller's
  // origin (per the W3C spec) so silently falling back to the first
  // allowlist entry would let an unlisted subdomain authenticate
  // against the canonical RPID and widen the trust boundary.
  // Reject unknown hosts by returning an empty string so the caller
  // surfaces a WebAuthn error instead of issuing credentials.
  if (RPID_ALLOWLIST.has(host)) return host;
  return "";
};

const requireRpid = (event) => {
  const rpID = getRpid(event);
  if (!rpID) throw new Error("Untrusted origin");
  return rpID;
};

const getExpectedOrigin = (event) => {
  // Some clients (Safari) send a synthetic origin for installed PWAs
  // (e.g. `https://canvhub.com` even for a `localhost` deploy). Prefer
  // the actual `origin` header the browser sent on the fetch.
  const origin = event?.headers?.origin;
  if (origin) return String(origin);
  try {
    const url = new URL(event.rawUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
};

const readJson = async (store, key) => {
  if (!store) return null;
  try {
    const raw = await store.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJson = async (store, key, value, ttlSeconds) => {
  if (!store) return;
  const opts = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await store.set(key, JSON.stringify(value), opts);
};

export const readPasskeys = async (store) => {
  const raw = await readJson(store, PASSKEYS_KEY);
  return Array.isArray(raw) ? raw : [];
};

export const writePasskeys = async (store, list) => {
  await writeJson(store, PASSKEYS_KEY, list);
};

export const readPasskeyConfig = async (store) => {
  const raw = await readJson(store, CONFIG_KEY);
  return {
    requirePasskey: Boolean(raw?.requirePasskey),
    updatedAt: raw?.updatedAt ?? null,
  };
};

export const writePasskeyConfig = async (store, partial) => {
  const current = await readPasskeyConfig(store);
  const next = {
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(store, CONFIG_KEY, next);
  return next;
};

const newNonce = () => {
  const buf = crypto.getRandomValues(new Uint8Array(18));
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const stashChallenge = async (store, payload) => {
  const nonce = newNonce();
  const challengeRecord = {
    ...payload,
    expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
  };
  await writeJson(
    store,
    `${CHALLENGE_KEY_PREFIX}${nonce}`,
    challengeRecord,
    CHALLENGE_TTL_SECONDS,
  );
  return nonce;
};

const consumeChallenge = async (store, nonce, expectedPurpose) => {
  if (!nonce || typeof nonce !== "string") return null;
  const key = `${CHALLENGE_KEY_PREFIX}${nonce}`;
  const record = await readJson(store, key);
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < Date.now()) {
    await store.delete(key).catch(() => {});
    return null;
  }
  if (expectedPurpose && record.purpose !== expectedPurpose) {
    return null;
  }
  // One-shot — delete on first read to prevent replay.
  await store.delete(key).catch(() => {});
  return record;
};

// Stable user handle for the admin. WebAuthn wants a `userID` per
// credential — we use a fixed handle since there's only one admin
// principal. Encoded as bytes for v11 of @simplewebauthn/server.
const ADMIN_USER_HANDLE = new TextEncoder().encode("canvhub-admin");

export const beginRegistration = async ({ store, event, existing }) => {
  const rpID = requireRpid(event);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: ADMIN_USER_HANDLE,
    userName: "admin",
    userDisplayName: "Canvas Hub admin",
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      // Don't pin to platform / cross-platform — let the user pick
      // (Touch ID, Windows Hello, YubiKey, phone).
    },
  });
  const nonce = await stashChallenge(store, {
    challenge: options.challenge,
    purpose: "register",
    rpID,
  });
  return { options, challengeId: nonce };
};

export const finishRegistration = async ({
  store,
  event,
  challengeId,
  response,
  name,
}) => {
  const rpID = requireRpid(event);
  const expectedOrigin = getExpectedOrigin(event);
  const challenge = await consumeChallenge(store, challengeId, "register");
  if (!challenge) {
    throw new Error("Challenge expired or invalid");
  }
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Registration verification failed");
  }
  const info = verification.registrationInfo;
  const cred = info.credential;
  const list = await readPasskeys(store);
  const stored = {
    id: cred.id,
    publicKey: btoa(String.fromCharCode(...cred.publicKey))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
    counter: cred.counter,
    transports: cred.transports || [],
    name: name || "Passkey",
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    credentialDeviceType: info.credentialDeviceType,
    backupEligible: Boolean(info.credentialBackedUp),
    backupState: info.credentialBackedUp ? "backed-up" : "single-device",
  };
  // Replace any prior credential with the same id (re-registration).
  const updated = [...list.filter((c) => c.id !== stored.id), stored];
  await writePasskeys(store, updated);
  return stored;
};

const decodeBase64Url = (b64u) => {
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4);
  const b64 = (b64u + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

export const beginAuthentication = async ({
  store,
  event,
  allowCredentials,
}) => {
  const rpID = requireRpid(event);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: (allowCredentials || []).map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    userVerification: "preferred",
  });
  const nonce = await stashChallenge(store, {
    challenge: options.challenge,
    purpose: "login",
    rpID,
  });
  return { options, challengeId: nonce };
};

export const finishAuthentication = async ({
  store,
  event,
  challengeId,
  response,
}) => {
  const rpID = requireRpid(event);
  const expectedOrigin = getExpectedOrigin(event);
  const challenge = await consumeChallenge(store, challengeId, "login");
  if (!challenge) {
    throw new Error("Challenge expired or invalid");
  }
  const list = await readPasskeys(store);
  const stored = list.find((c) => c.id === response.id);
  if (!stored) {
    throw new Error("Unknown passkey");
  }
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin,
    expectedRPID: rpID,
    credential: {
      id: stored.id,
      publicKey: decodeBase64Url(stored.publicKey),
      counter: stored.counter || 0,
      transports: stored.transports,
    },
    requireUserVerification: false,
  });
  if (!verification.verified) {
    throw new Error("Passkey verification failed");
  }
  const newCounter = verification.authenticationInfo?.newCounter ?? 0;
  // Update counter + lastUsedAt. Reject regression to prevent cloned
  // authenticator replay (with a 0-counter exemption for passkeys that
  // always report 0).
  if (newCounter !== 0 && newCounter <= (stored.counter || 0)) {
    throw new Error(
      "Passkey counter regression — possible cloned authenticator",
    );
  }
  const updated = list.map((c) =>
    c.id === stored.id
      ? {
          ...c,
          counter: newCounter,
          lastUsedAt: new Date().toISOString(),
        }
      : c,
  );
  await writePasskeys(store, updated);
  return stored;
};

export const removePasskey = async (store, id) => {
  const list = await readPasskeys(store);
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  await writePasskeys(store, next);
  return true;
};

export const renamePasskey = async (store, id, name) => {
  const list = await readPasskeys(store);
  const next = list.map((c) => (c.id === id ? { ...c, name } : c));
  if (JSON.stringify(next) === JSON.stringify(list)) return false;
  await writePasskeys(store, next);
  return true;
};

export const summarizePasskey = (c) => ({
  id: c.id,
  name: c.name,
  createdAt: c.createdAt,
  lastUsedAt: c.lastUsedAt,
  transports: c.transports,
  credentialDeviceType: c.credentialDeviceType,
  backupState: c.backupState,
});
