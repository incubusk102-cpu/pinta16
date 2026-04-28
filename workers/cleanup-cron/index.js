// Cloudflare Cron Trigger Worker — runs daily at 02:00 UTC and removes
// customer accounts that have been inactive for INACTIVE_DAYS (30) days.
//
// Storage: USERS KV namespace (the same one used by /api/users on the
// Pages site). Bind it on this worker too so we can rewrite the
// "users-by-email" key after pruning.
//
// Deployed as a separate worker because Cloudflare Pages Functions don't
// support `[triggers]` cron schedules. See workers/cleanup-cron/wrangler.toml.

import crypto from "node:crypto";

const USERS_KEY = "users-by-email";
const INACTIVE_DAYS = 30;
const INACTIVE_MS = INACTIVE_DAYS * 24 * 60 * 60 * 1000;

const escapeHtml = (input) =>
  String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const publicUser = (user) => {
  if (!user) return null;
  const out = {
    id: user.id,
    email: user.email,
    name: user.name || "",
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
  if (user.provider) out.provider = user.provider;
  return out;
};

const sendInactiveDeletionEmail = async (user, env) => {
  const apiKey = env.RESEND_API_KEY || "";
  const from = env.RESEND_FROM || "Canvas Hub <onboarding@resend.dev>";
  const siteUrl = env.URL || "https://canvhub.com";
  if (!apiKey) return { skipped: true, reason: "no-api-key" };
  const subject = "Your Canvas Hub account was removed for inactivity";
  const safeName = escapeHtml(user.name || "there");
  const safeEmail = escapeHtml(user.email || "");
  const safeSignup = `${escapeHtml(siteUrl)}/signup`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
      <h2 style="margin:0 0 16px">Hi ${safeName},</h2>
      <p>Your Canvas Hub account (<strong>${safeEmail}</strong>) was removed
      because it has been inactive for ${INACTIVE_DAYS} days.</p>
      <p>If this was a mistake, you're welcome to sign up again any time at
      <a href="${safeSignup}">${safeSignup}</a>.</p>
      <p style="margin-top:24px;color:#666;font-size:12px">— Canvas Hub</p>
    </div>
  `.trim();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [user.email], subject, html }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      return { ok: false, status: response.status, detail: data };
    return { ok: true, id: data?.id };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
};

const runCleanup = async (env) => {
  const raw = await env.USERS.get(USERS_KEY, "text");
  const users = raw ? JSON.parse(raw) : {};
  const now = Date.now();
  const removed = [];
  const kept = {};
  for (const [email, user] of Object.entries(users)) {
    const last = Date.parse(user.lastSeenAt || user.createdAt || "");
    if (Number.isFinite(last) && now - last > INACTIVE_MS) {
      removed.push(user);
    } else {
      kept[email] = user;
    }
  }
  if (removed.length === 0) {
    return { removed: [], remaining: Object.keys(kept).length, emails: [] };
  }
  await env.USERS.put(USERS_KEY, JSON.stringify(kept));
  const emails = [];
  for (const user of removed) {
    const result = await sendInactiveDeletionEmail(user, env);
    emails.push({ email: user.email, ...result });
  }
  return {
    removed: removed.map(publicUser),
    remaining: Object.keys(kept).length,
    emails,
  };
};

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runCleanup(env)
        .then((result) => {
          console.log(
            `[cleanup] cutoff=${INACTIVE_DAYS}d removed=${result.removed.length} remaining=${result.remaining}`,
          );
        })
        .catch((err) => {
          console.error("[cleanup] failed:", err);
        }),
    );
  },

  async fetch(request, env) {
    // Allow manual trigger via HTTP (with shared-secret header) for testing
    // and as a fallback if cron firing fails. Falls through to 404 if the
    // header isn't valid so the route can't be probed by random scanners.
    const url = new URL(request.url);
    if (url.pathname !== "/run")
      return new Response("Not found", { status: 404 });
    const provided = request.headers.get("x-cleanup-secret") || "";
    const expected = env.CLEANUP_SECRET || "";
    const match =
      expected.length > 0 &&
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!match) return new Response("Forbidden", { status: 403 });
    try {
      const result = await runCleanup(env);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
