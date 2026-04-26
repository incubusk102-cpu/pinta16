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
