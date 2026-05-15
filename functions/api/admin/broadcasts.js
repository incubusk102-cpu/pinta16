// /api/admin/broadcasts — newsletter broadcast management.
//
// Admin-only. All actions require a valid admin session (cookie or
// Authorization: Bearer ...).
//
// GET  ?action=list                  → recent broadcasts (index) +
//                                       configured provider name.
// GET  ?action=get&id=<id>           → full broadcast doc + stats.
// GET  ?action=audience-counts       → recipient counts per audience
//                                       so the composer can show
//                                       "Send to N people" up-front.
// POST ?action=save                  → upsert draft. Body:
//                                       { id?, subject, heading?,
//                                         bodyText, ctaLabel?, ctaUrl?,
//                                         audience }
// POST ?action=delete                → { id }
// POST ?action=send-test             → { id?, broadcast?, to }
//                                       Sends one test email to `to`.
// POST ?action=send-now              → { id } send to the broadcast's
//                                       resolved audience. Caps at
//                                       MAX_RECIPIENTS to keep the
//                                       admin response time bounded.
//
// Storage: NEWSLETTER KV namespace, `broadcasts:*` keys. See
// `_lib/broadcasts.js` for the full layout.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { BodyTooLargeError, buildLambdaEvent } from "../_lib/lambda-event.js";
import { consumeRateLimit, rateLimitResponse } from "../_lib/rate-limit.js";
import { recordPiiAccess } from "../_lib/audit-log.js";
import {
  isEmailConfigured,
  resolveEmailEnv,
  sendEmail,
} from "../_lib/email.js";
import { buildUnsubToken } from "../_lib/unsub-token.js";
import {
  deleteBroadcast,
  newBroadcastId,
  readBroadcast,
  readIndex,
  readStats,
  recordSendResult,
  renderBroadcastHtml,
  renderBroadcastText,
  resolveAudience,
  upsertBroadcast,
} from "../_lib/broadcasts.js";

// Hard cap on a single send invocation. Cloudflare Pages Functions
// have a ~30s wall-clock budget; at ~150ms per outbound API call
// 300 emails comfortably fit while leaving headroom. Larger
// audiences should use the (out-of-scope-for-v1) scheduled send.
const MAX_RECIPIENTS_PER_SEND = 300;

// Max subject / body lengths. These mirror Resend's free-tier
// soft limits and keep KV entries small. Body is plain text so 64KB
// is plenty.
const MAX_SUBJECT_LENGTH = 200;
const MAX_HEADING_LENGTH = 200;
const MAX_BODY_LENGTH = 64_000;
const MAX_CTA_LABEL_LENGTH = 60;
const MAX_CTA_URL_LENGTH = 2048;

const ALLOWED_AUDIENCES = new Set([
  "all",
  "subscribers",
  "customers",
  "customers:vip",
  "customers:repeat",
  "customers:one_time",
  "customers:at_risk",
  "customers:lead",
]);

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const trimString = (v, max) => String(v == null ? "" : v).slice(0, max);

const validateAudience = (audience) => {
  const a = String(audience || "");
  return ALLOWED_AUDIENCES.has(a) ? a : null;
};

const normalizeDraft = (input, existing) => {
  const now = new Date().toISOString();
  const id = existing?.id || input?.id || newBroadcastId();
  const subject = trimString(input.subject, MAX_SUBJECT_LENGTH).trim();
  const heading = trimString(input.heading, MAX_HEADING_LENGTH).trim();
  const bodyText = trimString(input.bodyText, MAX_BODY_LENGTH);
  const ctaLabel = trimString(input.ctaLabel, MAX_CTA_LABEL_LENGTH).trim();
  const ctaUrl = trimString(input.ctaUrl, MAX_CTA_URL_LENGTH).trim();
  const audience = validateAudience(input.audience) || "subscribers";

  return {
    id,
    subject,
    heading,
    bodyText,
    ctaLabel,
    ctaUrl,
    audience,
    status: existing?.status === "sent" ? "sent" : "draft",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sentAt: existing?.sentAt || null,
    recipientCount: existing?.recipientCount || 0,
    sentCount: existing?.sentCount || 0,
    failedCount: existing?.failedCount || 0,
  };
};

// Compute a short opaque token that uniquely identifies a recipient
// within a single broadcast for open / click tracking. We don't want
// to put raw emails in URLs (PII leak in mail-client logs and any
// upstream proxy) so we HMAC the email through the existing unsub
// secret with a broadcast-specific salt.
const recipientHash = async (broadcastId, email) =>
  buildUnsubToken("bcast", broadcastId, email);

// Site origin used for unsub / open / click URLs in outgoing email.
// Falls back to the canonical production host if no PUBLIC_SITE_ORIGIN
// override is set.
const siteOrigin = (env) => {
  const raw =
    (env && typeof env.PUBLIC_SITE_ORIGIN === "string"
      ? env.PUBLIC_SITE_ORIGIN
      : "") || "https://canvhub.com";
  return raw.replace(/\/+$/, "");
};

const buildTrackingHelpers = async ({
  env,
  broadcast,
  recipient,
  unsubBaseUrl,
}) => {
  const origin = siteOrigin(env);
  const hash = await recipientHash(broadcast.id, recipient.email);
  const openPixelUrl = `${origin}/api/broadcasts/open?b=${encodeURIComponent(
    broadcast.id,
  )}&r=${encodeURIComponent(hash)}`;
  const rewriteLink = (url) =>
    `${origin}/api/broadcasts/click?b=${encodeURIComponent(
      broadcast.id,
    )}&r=${encodeURIComponent(hash)}&u=${encodeURIComponent(url)}`;
  return { openPixelUrl, rewriteLink, unsubUrl: unsubBaseUrl };
};

// Build a per-recipient unsub link. We thread the broadcast id in so
// any future "click unsubscribe in this broadcast" stat can be
// reconstructed; today the link just records the opt-out against the
// recipient's NEWSLETTER subscriber row.
const buildUnsubUrl = async ({ env, broadcastId, email }) => {
  const origin = siteOrigin(env);
  const token = await buildUnsubToken("newsletter", email);
  return `${origin}/api/newsletter?action=unsubscribe&email=${encodeURIComponent(
    email,
  )}&t=${token}&b=${encodeURIComponent(broadcastId)}`;
};

// Send a single broadcast to one recipient. Returns the sendEmail
// result envelope verbatim so the caller can tally delivered vs
// skipped vs errored counts.
const sendOne = async ({ env, broadcast, recipient }) => {
  const unsubUrl = await buildUnsubUrl({
    env,
    broadcastId: broadcast.id,
    email: recipient.email,
  });
  const tracking = await buildTrackingHelpers({
    env,
    broadcast,
    recipient,
    unsubBaseUrl: unsubUrl,
  });
  const html = renderBroadcastHtml({
    broadcast,
    unsubUrl,
    openPixelUrl: tracking.openPixelUrl,
    rewriteLink: tracking.rewriteLink,
    brandName: env?.BRAND_NAME || "Canvas Hub",
    brandTagline: env?.BRAND_TAGLINE || "Original Filipino paintings",
  });
  const text = renderBroadcastText({
    broadcast,
    unsubUrl,
    brandName: env?.BRAND_NAME || "Canvas Hub",
  });
  return await sendEmail({
    to: recipient.email,
    subject: broadcast.subject,
    html,
    text,
    purpose: "broadcast",
  });
};

// ── GET ──────────────────────────────────────────────────────────────

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const event = {
    headers: Object.fromEntries(request.headers.entries()),
  };
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  if (action === "list") {
    const items = await readIndex();
    const fromAddress =
      resolveEmailEnv("FROM", "broadcast") || resolveEmailEnv("FROM") || "";
    return json(200, {
      items,
      emailConfigured: isEmailConfigured("broadcast"),
      fromAddress,
    });
  }

  if (action === "get") {
    const id = url.searchParams.get("id") || "";
    const broadcast = await readBroadcast(id);
    if (!broadcast) return json(404, { error: "Not found" });
    const stats = (await readStats(id)) || {
      openTotal: 0,
      clickTotal: 0,
      uniqueOpens: 0,
      uniqueClicks: 0,
    };
    return json(200, {
      broadcast,
      stats: {
        openTotal: Number(stats.openTotal || 0),
        clickTotal: Number(stats.clickTotal || 0),
        uniqueOpens: Number(stats.uniqueOpens || 0),
        uniqueClicks: Number(stats.uniqueClicks || 0),
      },
    });
  }

  if (action === "audience-counts") {
    // Pre-compute counts for every supported audience so the composer
    // can show "Send to N people" without resolving the audience again
    // on every selection. This is one read per audience but most share
    // the same underlying KV keys so the cost is small.
    const audiences = [
      "all",
      "subscribers",
      "customers",
      "customers:vip",
      "customers:repeat",
      "customers:one_time",
      "customers:at_risk",
      "customers:lead",
    ];
    const entries = await Promise.all(
      audiences.map(async (a) => [a, (await resolveAudience(a)).length]),
    );
    return json(200, {
      counts: Object.fromEntries(entries),
      maxPerSend: MAX_RECIPIENTS_PER_SEND,
    });
  }

  return json(400, { error: `Unknown action: ${action}` });
};

// ── POST ─────────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  let event;
  try {
    event = await buildLambdaEvent(request);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return json(413, { error: "Request body too large" });
    }
    throw err;
  }
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  const url = new URL(request.url);
  const action =
    url.searchParams.get("action") || parseBody(event.body).action || "save";
  const body = parseBody(event.body);

  if (action === "save") {
    if (!body.subject || !String(body.subject).trim()) {
      return json(400, { error: "Subject is required" });
    }
    if (!body.bodyText || !String(body.bodyText).trim()) {
      return json(400, { error: "Body is required" });
    }
    if (!validateAudience(body.audience)) {
      return json(400, { error: "Invalid audience" });
    }
    const existing = body.id ? await readBroadcast(body.id) : null;
    if (existing && existing.status === "sent") {
      // Edits after send would invalidate the historical record;
      // require duplicating into a new draft instead.
      return json(409, { error: "Cannot edit a sent broadcast" });
    }
    const next = normalizeDraft(body, existing);
    await upsertBroadcast(next);
    return json(200, { broadcast: next });
  }

  if (action === "delete") {
    const id = String(body.id || "");
    if (!id) return json(400, { error: "Missing id" });
    await deleteBroadcast(id);
    return json(200, { ok: true });
  }

  if (action === "send-test") {
    if (!isEmailConfigured("broadcast") && !isEmailConfigured()) {
      return json(503, {
        error:
          "Email provider not configured (RESEND_API_KEY / BREVO_API_KEY).",
      });
    }
    const to = String(body.to || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(to)) {
      return json(400, { error: "Invalid 'to' email" });
    }
    // Rate-limit test sends — a noisy admin can otherwise drain the
    // provider quota by repeatedly clicking "Send test".
    const limit = await consumeRateLimit(event, {
      bucket: "broadcast-send-test",
      windowMs: 60_000,
      max: 10,
    });
    if (!limit.allowed) {
      const r = rateLimitResponse(limit.retryAfter);
      return new Response(r.body, { status: r.statusCode, headers: r.headers });
    }
    const draft =
      body.broadcast && typeof body.broadcast === "object"
        ? body.broadcast
        : await readBroadcast(String(body.id || ""));
    if (!draft) return json(404, { error: "Broadcast not found" });
    if (!draft.subject || !draft.bodyText) {
      return json(400, { error: "Subject and body are required" });
    }
    const broadcastForTest = {
      ...draft,
      id: draft.id || `test-${newBroadcastId()}`,
      // Mark the subject so the admin can tell at a glance which
      // copy in their inbox is a test vs the live broadcast.
      subject: `[TEST] ${draft.subject}`,
    };
    const result = await sendOne({
      env,
      broadcast: broadcastForTest,
      recipient: { email: to, name: "" },
    });
    return json(200, { delivered: !!result.delivered, result });
  }

  if (action === "send-now") {
    if (!isEmailConfigured("broadcast") && !isEmailConfigured()) {
      return json(503, {
        error:
          "Email provider not configured (RESEND_API_KEY / BREVO_API_KEY).",
      });
    }
    const id = String(body.id || "");
    if (!id) return json(400, { error: "Missing id" });
    const broadcast = await readBroadcast(id);
    if (!broadcast) return json(404, { error: "Broadcast not found" });
    if (broadcast.status === "sent") {
      return json(409, { error: "Broadcast already sent" });
    }
    if (!broadcast.subject || !broadcast.bodyText) {
      return json(400, { error: "Subject and body are required" });
    }
    // Soft per-broadcast send lock so a double-click on "Send now"
    // doesn't kick off two parallel deliveries to the same audience.
    if (broadcast.status === "sending") {
      return json(409, { error: "Broadcast is already sending" });
    }
    await upsertBroadcast({
      ...broadcast,
      status: "sending",
      updatedAt: new Date().toISOString(),
    });

    const recipients = await resolveAudience(broadcast.audience);
    if (recipients.length === 0) {
      await upsertBroadcast({ ...broadcast, status: "draft" });
      return json(400, {
        error: "Audience is empty — no recipients to send to.",
      });
    }
    if (recipients.length > MAX_RECIPIENTS_PER_SEND) {
      await upsertBroadcast({ ...broadcast, status: "draft" });
      return json(400, {
        error: `Audience has ${recipients.length} recipients but only ${MAX_RECIPIENTS_PER_SEND} can be sent per request. Use a narrower segment, or split the audience.`,
      });
    }

    let sent = 0;
    let failed = 0;
    const errors = [];
    for (const recipient of recipients) {
      try {
        const result = await sendOne({ env, broadcast, recipient });
        if (result?.delivered) {
          sent += 1;
        } else {
          failed += 1;
          if (errors.length < 5) {
            errors.push({
              email: recipient.email,
              reason: result?.reason || result?.error || "send failed",
            });
          }
        }
      } catch (err) {
        failed += 1;
        if (errors.length < 5) {
          errors.push({
            email: recipient.email,
            reason: err instanceof Error ? err.message : "exception",
          });
        }
      }
    }

    const updated = await recordSendResult(id, {
      sent,
      failed,
      recipients: recipients.length,
    });

    try {
      await recordPiiAccess(event, {
        resource: "broadcasts",
        action: "send",
        detail: `Sent broadcast ${id} to ${recipients.length} recipients (${sent} delivered, ${failed} failed)`,
      });
    } catch {
      /* audit log failures must not affect the response */
    }

    return json(200, {
      broadcast: updated,
      sent,
      failed,
      recipients: recipients.length,
      errors,
    });
  }

  return json(400, { error: `Unknown action: ${action}` });
};
