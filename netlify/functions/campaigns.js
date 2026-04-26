import { connectLambda, getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { isAuthenticated } from "../lib/admin-auth.js";
import { sendEmail, isEmailConfigured } from "../lib/email.js";
import { appendAuditEvent } from "../lib/audit-log.js";
import { captureRequestMeta } from "../lib/request-info.js";

const STORE_NAME = "campaigns";
const LIST_KEY = "all-campaigns";
const ORDERS_STORE_NAME = "orders";
const ORDERS_KEY = "all-orders";
const NEWSLETTER_STORE_NAME = "newsletter";
const NEWSLETTER_KEY = "subscribers";

const MAX_HISTORY = 100;
const MAX_PARALLEL_SENDS = 5;

const jsonHeaders = { "Content-Type": "application/json" };

const json = (statusCode, body) => ({
  statusCode,
  headers: jsonHeaders,
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

const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const readJSON = async (store, key, fallback) => {
  try {
    const data = await store.get(key, { type: "json" });
    return data ?? fallback;
  } catch {
    return fallback;
  }
};

/**
 * Resolves the email list for a given audience description.
 * audience.kind:
 *   - "all-customers": every unique customer email seen on an order
 *   - "recent-customers": customers whose latest order is within `days`
 *   - "newsletter": newsletter subscribers
 *   - "all": union of customers + newsletter
 *   - "custom": the explicit list of emails the admin pasted in
 */
const resolveRecipients = async (event, audience) => {
  connectLambda(event);
  const ordersStore = getStore(ORDERS_STORE_NAME);
  const newsletterStore = getStore(NEWSLETTER_STORE_NAME);

  const ordersList = (await readJSON(ordersStore, ORDERS_KEY, [])) || [];
  const subsList = (await readJSON(newsletterStore, NEWSLETTER_KEY, [])) || [];

  const seen = new Map(); // email -> { email, name, lastOrderAt }

  const cutoff =
    audience.kind === "recent-customers"
      ? Date.now() - Math.max(1, Number(audience.days) || 30) * 86400000
      : 0;

  for (const order of ordersList) {
    const email = String(order?.orderInfo?.email || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) continue;
    const placedAt = Date.parse(order?.placedAt || "") || 0;
    if (audience.kind === "recent-customers" && placedAt < cutoff) continue;
    const prior = seen.get(email);
    if (!prior || (placedAt && placedAt > (prior.lastOrderAt || 0))) {
      seen.set(email, {
        email,
        name: order?.orderInfo?.fullName || prior?.name || "",
        lastOrderAt: placedAt || prior?.lastOrderAt || 0,
        source: "customer",
      });
    }
  }

  const includeCustomers =
    audience.kind === "all-customers" ||
    audience.kind === "recent-customers" ||
    audience.kind === "all";
  const includeNewsletter =
    audience.kind === "newsletter" || audience.kind === "all";
  const includeCustom = audience.kind === "custom";

  const map = new Map();
  if (includeCustomers) {
    for (const r of seen.values()) map.set(r.email, r);
  }
  if (includeNewsletter) {
    for (const sub of subsList) {
      const email = String(sub?.email || "")
        .trim()
        .toLowerCase();
      if (!isValidEmail(email)) continue;
      if (!map.has(email)) {
        map.set(email, {
          email,
          name: sub?.name || "",
          source: "newsletter",
        });
      }
    }
  }
  if (includeCustom) {
    const list = Array.isArray(audience.emails) ? audience.emails : [];
    for (const raw of list) {
      const email = String(raw || "")
        .trim()
        .toLowerCase();
      if (!isValidEmail(email)) continue;
      if (!map.has(email)) {
        map.set(email, { email, name: "", source: "custom" });
      }
    }
  }

  return [...map.values()];
};

const renderTemplate = (template, vars) => {
  let out = String(template || "");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value ?? ""));
  }
  return out;
};

const summarizeAudience = (audience, count) => {
  if (audience.kind === "recent-customers")
    return `Customers in last ${Number(audience.days) || 30}d (${count})`;
  if (audience.kind === "all-customers") return `All past customers (${count})`;
  if (audience.kind === "newsletter")
    return `Newsletter subscribers (${count})`;
  if (audience.kind === "all") return `Customers + newsletter (${count})`;
  if (audience.kind === "custom") return `Custom list (${count})`;
  return `Audience (${count})`;
};

/** Sends emails in fixed-size parallel batches and returns the tally. */
const blastEmails = async ({ recipients, subject, html }) => {
  let delivered = 0;
  let failed = 0;
  const errors = [];
  for (let i = 0; i < recipients.length; i += MAX_PARALLEL_SENDS) {
    const batch = recipients.slice(i, i + MAX_PARALLEL_SENDS);
    const results = await Promise.allSettled(
      batch.map((r) =>
        sendEmail({
          to: r.email,
          subject: renderTemplate(subject, {
            name: r.name || "there",
            email: r.email,
          }),
          html: renderTemplate(html, {
            name: r.name || "there",
            email: r.email,
          }),
        }),
      ),
    );
    results.forEach((res, idx) => {
      const recipient = batch[idx];
      if (res.status === "fulfilled" && res.value?.delivered) {
        delivered += 1;
      } else {
        failed += 1;
        const reason =
          res.status === "rejected"
            ? String(res.reason?.message || res.reason)
            : res.value?.error || res.value?.reason || "unknown";
        if (errors.length < 25) {
          errors.push({ email: recipient.email, reason });
        }
      }
    });
  }
  return { delivered, failed, errors };
};

export const handler = async (event) => {
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }
  const method = event.httpMethod;
  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);

    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const list = (await readJSON(store, LIST_KEY, [])) || [];
      if (params.preview === "1") {
        const audience = parseBody(event.body) || {};
        // GET shouldn't carry a body; allow passing audience via query
        // string keys instead for the preview action.
        const previewAudience = {
          kind: params.kind || audience.kind || "all-customers",
          days: Number(params.days || audience.days) || 30,
        };
        const recipients = await resolveRecipients(event, previewAudience);
        return json(200, {
          count: recipients.length,
          summary: summarizeAudience(previewAudience, recipients.length),
        });
      }
      return json(200, {
        campaigns: list,
        count: list.length,
        emailConfigured: isEmailConfigured(),
      });
    }

    if (method === "POST") {
      const body = parseBody(event.body);
      const action = body.action;

      if (action === "preview") {
        const audience = body.audience || { kind: "all-customers" };
        const recipients = await resolveRecipients(event, audience);
        return json(200, {
          count: recipients.length,
          summary: summarizeAudience(audience, recipients.length),
        });
      }

      if (action === "send") {
        if (!isEmailConfigured()) {
          return json(400, {
            error:
              "Email provider not configured. Set RESEND_API_KEY or BREVO_API_KEY (and EMAIL_FROM).",
          });
        }
        const subject = String(body.subject || "").trim();
        const html = String(body.html || "").trim();
        const audience = body.audience || { kind: "all-customers" };
        if (!subject) return json(400, { error: "Subject required" });
        if (!html) return json(400, { error: "Body required" });

        const recipients = await resolveRecipients(event, audience);
        if (recipients.length === 0) {
          return json(400, { error: "Audience is empty" });
        }

        const startedAt = new Date().toISOString();
        const result = await blastEmails({ recipients, subject, html });
        const finishedAt = new Date().toISOString();

        const campaign = {
          id: crypto.randomUUID(),
          subject,
          html,
          audience,
          audienceSummary: summarizeAudience(audience, recipients.length),
          totalRecipients: recipients.length,
          delivered: result.delivered,
          failed: result.failed,
          errors: result.errors,
          startedAt,
          finishedAt,
        };

        const list = (await readJSON(store, LIST_KEY, [])) || [];
        const next = [campaign, ...list].slice(0, MAX_HISTORY);
        await store.setJSON(LIST_KEY, next);

        await appendAuditEvent(event, {
          type: "campaign.sent",
          outcome: result.failed === 0 ? "success" : "partial",
          subject: campaign.id,
          detail: `${campaign.audienceSummary} · delivered ${result.delivered}, failed ${result.failed}`,
          ...captureRequestMeta(event),
        });

        return json(200, { campaign });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("campaigns error:", err);
    return json(500, {
      error: err instanceof Error ? err.message : "campaigns_error",
    });
  }
};
