import crypto from "node:crypto";
import { isAuthenticated as isAdmin } from "../lib/admin-auth.js";
import {
  ensureSessionSecret,
  extractToken,
  findUserById,
  getUsersStore,
  hashPassword,
  INACTIVE_DAYS,
  isValidEmail,
  issueToken,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  publicUser,
  readUsers,
  runInactiveUserCleanup,
  verifyPassword,
  verifyTokenWithSecret,
  writeUsers,
} from "../lib/user-auth.js";
import { captureRequestMeta } from "../lib/request-info.js";
import { consumeRateLimit, rateLimitResponse } from "../lib/rate-limit.js";
import { appendAuditEvent } from "../lib/audit-log.js";
import { withSecurityHeaders } from "../lib/security-headers.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const ADDRESS_FIELDS = [
  "label",
  "fullName",
  "phone",
  "line1",
  "line2",
  "city",
  "province",
  "postalCode",
  "country",
];

const sanitizeAddress = (raw) => {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Address payload required" };
  }
  const out = {};
  for (const key of ADDRESS_FIELDS) {
    const v = raw[key];
    if (v == null) {
      out[key] = "";
    } else if (typeof v !== "string") {
      return { ok: false, error: `${key} must be a string` };
    } else {
      const trimmed = v.trim();
      if (trimmed.length > 200) {
        return { ok: false, error: `${key} too long` };
      }
      out[key] = trimmed;
    }
  }
  if (!out.fullName) return { ok: false, error: "Recipient name is required" };
  if (!out.line1) return { ok: false, error: "Street address is required" };
  if (!out.city) return { ok: false, error: "City is required" };
  if (!out.country) out.country = "Philippines";
  return { ok: true, value: out };
};

const getCurrentUser = async (event, store) => {
  const token = extractToken(event);
  if (!token) return null;
  const secret = await ensureSessionSecret(store);
  const payload = verifyTokenWithSecret(token, secret);
  if (!payload?.sub) return null;
  const users = await readUsers(store);
  return findUserById(users, payload.sub);
};

export const handler = async (event) => {
  try {
    const store = getUsersStore(event);
    const action =
      (event.queryStringParameters && event.queryStringParameters.action) ||
      parseBody(event.body).action ||
      "";

    if (event.httpMethod === "POST" && action === "google-login") {
      const limit = await consumeRateLimit(event, {
        bucket: "user-google-login",
        windowMs: 15 * 60_000,
        max: 20,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
      const body = parseBody(event.body);
      const credential = String(body.credential || "");
      if (!credential) {
        return json(400, { error: "Missing Google credential" });
      }

      const clientId = process.env.GOOGLE_CLIENT_ID || "";
      if (!clientId) {
        return json(500, { error: "Google login not configured" });
      }

      // Verify the Google ID token
      let tokenRes;
      try {
        tokenRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
        );
      } catch {
        return json(502, { error: "Could not verify Google token" });
      }
      if (!tokenRes.ok) {
        return json(401, { error: "Invalid Google credential" });
      }
      const googlePayload = await tokenRes.json();

      if (googlePayload.aud !== clientId) {
        return json(401, { error: "Token audience mismatch" });
      }

      const email = normalizeEmail(googlePayload.email);
      if (!email || !isValidEmail(email)) {
        return json(400, { error: "Could not read email from Google account" });
      }

      const now = new Date().toISOString();
      const users = await readUsers(store);
      let user = users[email];

      if (user) {
        user.lastSeenAt = now;
        if (googlePayload.name && !user.name) {
          user.name = String(googlePayload.name).slice(0, 80);
        }
        if (googlePayload.picture) {
          user.picture = String(googlePayload.picture).slice(0, 2000);
        }
      } else {
        user = {
          id: crypto.randomUUID(),
          email,
          name: String(googlePayload.name || "").slice(0, 80),
          picture: String(googlePayload.picture || "").slice(0, 2000),
          provider: "google",
          createdAt: now,
          lastSeenAt: now,
        };
      }
      users[email] = user;
      await writeUsers(store, users);

      const secret = await ensureSessionSecret(store);
      await appendAuditEvent(event, {
        type: "user.google-login",
        outcome: "success",
        subject: email,
        detail: "Google ID token verified",
        ...captureRequestMeta(event),
      });
      return json(200, {
        token: issueToken(user.id, secret),
        user: publicUser(user),
      });
    }

    if (event.httpMethod === "POST" && action === "signup") {
      const limit = await consumeRateLimit(event, {
        bucket: "user-signup",
        windowMs: 60 * 60_000,
        max: 10,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
      const body = parseBody(event.body);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const name = String(body.name || "")
        .trim()
        .slice(0, 80);

      if (!isValidEmail(email)) {
        return json(400, { error: "Enter a valid email address" });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json(400, {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }

      const users = await readUsers(store);
      if (users[email]) {
        return json(409, {
          error: "An account with that email already exists",
        });
      }

      const { salt, hash } = hashPassword(password);
      const now = new Date().toISOString();
      const user = {
        id: crypto.randomUUID(),
        email,
        name,
        salt,
        hash,
        createdAt: now,
        lastSeenAt: now,
      };
      users[email] = user;
      await writeUsers(store, users);

      const secret = await ensureSessionSecret(store);
      await appendAuditEvent(event, {
        type: "user.signup",
        outcome: "success",
        subject: email,
        detail: "Account created",
        ...captureRequestMeta(event),
      });
      return json(200, {
        token: issueToken(user.id, secret),
        user: publicUser(user),
      });
    }

    if (event.httpMethod === "POST" && action === "login") {
      const limit = await consumeRateLimit(event, {
        bucket: "user-login",
        windowMs: 15 * 60_000,
        max: 10,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
      const body = parseBody(event.body);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const users = await readUsers(store);
      const user = users[email];
      const meta = captureRequestMeta(event);
      if (!user || !verifyPassword(password, user.salt, user.hash)) {
        await appendAuditEvent(event, {
          type: "user.login",
          outcome: "failure",
          subject: email || "unknown",
          detail: "Incorrect email or password",
          ...meta,
        });
        return json(401, { error: "Incorrect email or password" });
      }
      user.lastSeenAt = new Date().toISOString();
      users[email] = user;
      await writeUsers(store, users);

      const secret = await ensureSessionSecret(store);
      await appendAuditEvent(event, {
        type: "user.login",
        outcome: "success",
        subject: email,
        detail: "Password OK",
        ...meta,
      });
      return json(200, {
        token: issueToken(user.id, secret),
        user: publicUser(user),
      });
    }

    if (event.httpMethod === "POST" && action === "heartbeat") {
      const token = extractToken(event);
      if (!token) return json(401, { error: "Not authenticated" });
      const secret = await ensureSessionSecret(store);
      const payload = verifyTokenWithSecret(token, secret);
      if (!payload?.sub) return json(401, { error: "Not authenticated" });
      const users = await readUsers(store);
      const user = findUserById(users, payload.sub);
      if (!user) return json(401, { error: "Not authenticated" });
      user.lastSeenAt = new Date().toISOString();
      await writeUsers(store, users);
      return json(200, { ok: true });
    }

    if (event.httpMethod === "GET" && action === "me") {
      const user = await getCurrentUser(event, store);
      if (!user) return json(401, { error: "Not authenticated" });
      return json(200, { user: publicUser(user) });
    }

    if (event.httpMethod === "POST" && action === "update-profile") {
      const user = await getCurrentUser(event, store);
      if (!user) return json(401, { error: "Not authenticated" });
      const body = parseBody(event.body);
      const users = await readUsers(store);
      const stored = users[normalizeEmail(user.email)];
      if (!stored) return json(404, { error: "User not found" });
      if (typeof body.name === "string") {
        const trimmed = body.name.trim();
        if (trimmed.length > 80) {
          return json(400, { error: "Name too long" });
        }
        stored.name = trimmed;
      }
      if (typeof body.picture === "string") {
        const value = body.picture.trim();
        if (value && value.length > 200_000) {
          return json(400, { error: "Picture data too large (max 200KB)" });
        }
        if (!value) {
          delete stored.picture;
        } else if (
          value.startsWith("data:image/") ||
          value.startsWith("https://") ||
          value.startsWith("http://")
        ) {
          stored.picture = value;
        } else {
          return json(400, { error: "Invalid picture URL" });
        }
      }
      stored.updatedAt = new Date().toISOString();
      await writeUsers(store, users);
      return json(200, { user: publicUser(stored) });
    }

    if (event.httpMethod === "POST" && action === "change-password") {
      const user = await getCurrentUser(event, store);
      if (!user) return json(401, { error: "Not authenticated" });
      const limit = await consumeRateLimit(event, {
        bucket: `user-change-password:${user.id}`,
        windowMs: 15 * 60_000,
        max: 8,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
      const body = parseBody(event.body);
      const oldPassword = String(body.oldPassword || "");
      const newPassword = String(body.newPassword || "");
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return json(400, {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }
      const users = await readUsers(store);
      const stored = users[normalizeEmail(user.email)];
      if (!stored) return json(404, { error: "User not found" });
      if (!stored.passwordHash || !stored.passwordSalt) {
        return json(400, {
          error:
            "This account uses a social provider — password change is not supported.",
        });
      }
      const ok = verifyPassword(
        oldPassword,
        stored.passwordSalt,
        stored.passwordHash,
      );
      if (!ok) {
        const meta = captureRequestMeta(event);
        await appendAuditEvent({
          actor: user.email,
          action: "user-password-change-failed",
          detail: "Bad current password",
          ...meta,
        });
        return json(400, { error: "Current password is incorrect" });
      }
      const { hash, salt } = hashPassword(newPassword);
      stored.passwordHash = hash;
      stored.passwordSalt = salt;
      stored.passwordChangedAt = new Date().toISOString();
      stored.updatedAt = stored.passwordChangedAt;
      await writeUsers(store, users);
      const meta = captureRequestMeta(event);
      await appendAuditEvent({
        actor: user.email,
        action: "user-password-changed",
        detail: "Password updated via /account",
        ...meta,
      });
      return json(200, { ok: true });
    }

    if (event.httpMethod === "POST" && action === "addresses-add") {
      const user = await getCurrentUser(event, store);
      if (!user) return json(401, { error: "Not authenticated" });
      const body = parseBody(event.body);
      const addr = sanitizeAddress(body.address);
      if (!addr.ok) return json(400, { error: addr.error });
      const users = await readUsers(store);
      const stored = users[normalizeEmail(user.email)];
      if (!stored) return json(404, { error: "User not found" });
      stored.addresses = Array.isArray(stored.addresses)
        ? stored.addresses
        : [];
      if (stored.addresses.length >= 8) {
        return json(400, { error: "Address limit reached (max 8)" });
      }
      const id = crypto.randomUUID();
      const entry = {
        id,
        ...addr.value,
        createdAt: new Date().toISOString(),
      };
      stored.addresses.push(entry);
      if (!stored.defaultAddressId || stored.addresses.length === 1) {
        stored.defaultAddressId = id;
      }
      stored.updatedAt = new Date().toISOString();
      await writeUsers(store, users);
      return json(200, { user: publicUser(stored), address: entry });
    }

    if (event.httpMethod === "POST" && action === "addresses-update") {
      const user = await getCurrentUser(event, store);
      if (!user) return json(401, { error: "Not authenticated" });
      const body = parseBody(event.body);
      const id = String(body.id || "");
      if (!id) return json(400, { error: "id is required" });
      const addr = sanitizeAddress(body.address);
      if (!addr.ok) return json(400, { error: addr.error });
      const users = await readUsers(store);
      const stored = users[normalizeEmail(user.email)];
      if (!stored || !Array.isArray(stored.addresses)) {
        return json(404, { error: "Address not found" });
      }
      const idx = stored.addresses.findIndex((a) => a.id === id);
      if (idx === -1) return json(404, { error: "Address not found" });
      stored.addresses[idx] = {
        ...stored.addresses[idx],
        ...addr.value,
        id,
        updatedAt: new Date().toISOString(),
      };
      stored.updatedAt = new Date().toISOString();
      await writeUsers(store, users);
      return json(200, {
        user: publicUser(stored),
        address: stored.addresses[idx],
      });
    }

    if (event.httpMethod === "POST" && action === "addresses-remove") {
      const user = await getCurrentUser(event, store);
      if (!user) return json(401, { error: "Not authenticated" });
      const body = parseBody(event.body);
      const id = String(body.id || "");
      if (!id) return json(400, { error: "id is required" });
      const users = await readUsers(store);
      const stored = users[normalizeEmail(user.email)];
      if (!stored || !Array.isArray(stored.addresses)) {
        return json(404, { error: "Address not found" });
      }
      const next = stored.addresses.filter((a) => a.id !== id);
      if (next.length === stored.addresses.length) {
        return json(404, { error: "Address not found" });
      }
      stored.addresses = next;
      if (stored.defaultAddressId === id) {
        stored.defaultAddressId = next[0]?.id || null;
      }
      stored.updatedAt = new Date().toISOString();
      await writeUsers(store, users);
      return json(200, { user: publicUser(stored) });
    }

    if (event.httpMethod === "POST" && action === "addresses-set-default") {
      const user = await getCurrentUser(event, store);
      if (!user) return json(401, { error: "Not authenticated" });
      const body = parseBody(event.body);
      const id = String(body.id || "");
      if (!id) return json(400, { error: "id is required" });
      const users = await readUsers(store);
      const stored = users[normalizeEmail(user.email)];
      if (!stored || !Array.isArray(stored.addresses)) {
        return json(404, { error: "Address not found" });
      }
      const found = stored.addresses.some((a) => a.id === id);
      if (!found) return json(404, { error: "Address not found" });
      stored.defaultAddressId = id;
      stored.updatedAt = new Date().toISOString();
      await writeUsers(store, users);
      return json(200, { user: publicUser(stored) });
    }

    // Admin-only operations: list / delete
    if (event.httpMethod === "GET" && action === "list") {
      if (!(await isAdmin(event))) {
        return json(401, { error: "Admin authentication required" });
      }
      const users = await readUsers(store);
      const list = Object.values(users)
        .map(publicUser)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json(200, {
        users: list,
        total: list.length,
        inactiveDays: INACTIVE_DAYS,
      });
    }

    if (event.httpMethod === "POST" && action === "cleanup-now") {
      if (!(await isAdmin(event))) {
        return json(401, { error: "Admin authentication required" });
      }
      const result = await runInactiveUserCleanup(store);
      return json(200, result);
    }

    if (event.httpMethod === "DELETE") {
      if (!(await isAdmin(event))) {
        return json(401, { error: "Admin authentication required" });
      }
      const id = event.queryStringParameters?.id || "";
      if (!id) return json(400, { error: "id is required" });
      const users = await readUsers(store);
      const found = Object.entries(users).find(([, u]) => u.id === id);
      if (!found) return json(404, { error: "User not found" });
      delete users[found[0]];
      await writeUsers(store, users);
      return json(200, { ok: true, deletedEmail: found[0] });
    }

    return json(400, { error: "Unknown action" });
  } catch (error) {
    console.error("users handler error:", error);
    return json(500, { error: "Internal error" });
  }
};
