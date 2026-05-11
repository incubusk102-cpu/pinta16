// Lightweight in-app live chat. Customers identify themselves with name +
// email (no account required); each browser holds onto a thread token in
// localStorage so they can return to the same conversation.
//
// Storage shape (Netlify Blobs `chat-threads/index`):
//   { threads: [{ id, name, email, createdAt, updatedAt, lastFromAdmin,
//                 lastReadByAdminAt, customerLastMessageAt, ip, browser,
//                 os, device, messageCount, closedAt, needsHumanAt }] }
// Per-thread blob (`chat-threads/<id>`):
//   { id, name, email, createdAt, closedAt?, closedBy?,
//     messages: [{ at, from: 'customer'|'admin'|'ai'|'system', body }] }
// Per-thread typing-indicator blob (`chat-threads/typing__<id>`):
//   { at, by: 'admin' }   // small, no CAS — latest write wins
//
// Public POSTs are rate-limited per IP. Admin reads/writes require a session
// token. Audit log gets `chat.message` events.
//
// AI auto-reply (optional): when `chat.ai.enabled` is true in
// storefront-config and `GROQ_TOKEN` (or `GROQ_API_KEY`) is set in the
// Pages env, customer
// messages that don't match an admin recently-active thread will trigger
// a Groq-backed reply, appended as `from: "ai"`. The path is best-effort
// — any failure or timeout silently degrades to "no auto-reply" and the
// thread waits in the admin Chat tab for the gallery owner to take over.

import { connectLambda, getStore } from "./_lib/kv-stores.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { appendAuditEvent } from "./_lib/audit-log.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { wrapHandler } from "./_lib/handler-wrapper.js";
import { getCloudflareEnv } from "./_lib/context.js";
import { generateAutoReply } from "./_lib/chat-ai.js";

const STORE_NAME = "chat-threads";
const INDEX_KEY = "index";
const CONFIG_KEY = "config";
const PRODUCTS_KEY = "all-products";
const MAX_THREADS = 200; // Older threads beyond this are pruned from the index.
const MAX_MESSAGES_PER_THREAD = 200;
const MAX_BODY_CHARS = 2000;
const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: withSecurityHeaders(extraHeaders),
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

const getChatStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

const trimString = (v, max) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

const nowISO = () => new Date().toISOString();

const sanitizeIndexEntry = (entry) => ({
  id: String(entry.id || ""),
  name: trimString(entry.name, 80),
  email: trimString(entry.email, 200).toLowerCase(),
  createdAt: String(entry.createdAt || nowISO()),
  updatedAt: String(entry.updatedAt || entry.createdAt || nowISO()),
  customerLastMessageAt: entry.customerLastMessageAt
    ? String(entry.customerLastMessageAt)
    : "",
  lastReadByAdminAt: entry.lastReadByAdminAt
    ? String(entry.lastReadByAdminAt)
    : "",
  lastFromAdmin: Boolean(entry.lastFromAdmin),
  messageCount: Number(entry.messageCount || 0),
  ip: trimString(entry.ip, 64),
  browser: trimString(entry.browser, 60),
  os: trimString(entry.os, 40),
  device: trimString(entry.device, 30),
  closedAt: entry.closedAt ? String(entry.closedAt) : "",
  // Set when an AI auto-reply path bailed out and explicitly asked for a
  // human (handoff keyword in the customer message OR the model emitted
  // the `<<<NEEDS_HUMAN>>>` token). Surfaced in the admin Chat list so
  // the gallery owner can prioritise threads the AI couldn't close.
  needsHumanAt: entry.needsHumanAt ? String(entry.needsHumanAt) : "",
});

const readIndexWithMeta = async (store) => {
  // Throws on read failure so the CAS retry loop can distinguish a transient
  // error from a genuinely empty index. Swallowing here would let an
  // unconditional write (etag === undefined) overwrite a populated index
  // with a single new entry on the retry path.
  const result = await store.getWithMetadata(INDEX_KEY, { type: "json" });
  const list = Array.isArray(result?.data?.threads) ? result.data.threads : [];
  return { etag: result?.etag, threads: list.map(sanitizeIndexEntry) };
};

const writeIndex = async (store, threads, etag) => {
  const trimmed = [...threads]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_THREADS);
  return store.setJSON(INDEX_KEY, { threads: trimmed }, { onlyIfMatch: etag });
};

const readThread = async (store, id) => {
  if (!TOKEN_PATTERN.test(id)) return null;
  try {
    const data = await store.get(`thread__${id}`, { type: "json" });
    if (!data || typeof data !== "object") return null;
    if (!Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
};

const readThreadWithMeta = async (store, id) => {
  if (!TOKEN_PATTERN.test(id)) return { etag: undefined, data: null };
  try {
    const result = await store.getWithMetadata(`thread__${id}`, {
      type: "json",
    });
    const data =
      result?.data && Array.isArray(result.data.messages) ? result.data : null;
    return { etag: result?.etag, data };
  } catch {
    return { etag: undefined, data: null };
  }
};

const writeThread = async (store, id, thread, etag) => {
  return store.setJSON(`thread__${id}`, thread, { onlyIfMatch: etag });
};

const generateThreadId = () => {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
};

// Typing-indicator blob is intentionally tiny and writes are not CAS-guarded:
// "latest write wins" is fine for a UI hint, and CAS retries on every keypress
// would be wasteful. The blob is read whenever the customer fetches the thread.
const TYPING_TTL_MS = 6000;
const typingKey = (id) => `typing__${id}`;

const readAdminTyping = async (store, id) => {
  if (!TOKEN_PATTERN.test(id)) return "";
  try {
    const data = await store.get(typingKey(id), { type: "json" });
    if (!data || typeof data !== "object" || data.by !== "admin") return "";
    const at = String(data.at || "");
    if (!at) return "";
    const t = Date.parse(at);
    if (Number.isNaN(t)) return "";
    if (Date.now() - t > TYPING_TTL_MS) return "";
    return at;
  } catch {
    return "";
  }
};

const writeAdminTyping = async (store, id) => {
  try {
    await store.setJSON(typingKey(id), { at: nowISO(), by: "admin" });
  } catch {
    // ignore
  }
};

const upsertIndexEntry = async (store, entryUpdater) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    let etag;
    let threads;
    try {
      ({ etag, threads } = await readIndexWithMeta(store));
    } catch {
      // Read failure: bail rather than retrying with an empty list and
      // accidentally overwriting the existing index on the next write.
      return false;
    }
    const next = entryUpdater(threads);
    try {
      const wrote = await writeIndex(store, next, etag);
      if (wrote && wrote.modified === false) continue;
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

// Append a message under the per-thread CAS lock. Returns:
//   * the updated thread on success,
//   * `null` if the thread doesn't exist,
//   * the string `"closed"` if `rejectIfClosed` is true and `closedAt` is set
//     on the snapshot we read inside the CAS loop. Folding the closed-check
//     into the same read that drives the CAS write closes the TOCTOU window
//     where an admin's `admin-close` could land between a separate
//     pre-flight check and this function.
const appendMessage = async (
  store,
  id,
  message,
  { rejectIfClosed = false } = {},
) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { etag, data } = await readThreadWithMeta(store, id);
    if (!data) return null;
    if (rejectIfClosed && data.closedAt) return "closed";
    const next = {
      ...data,
      messages: [...data.messages, message].slice(-MAX_MESSAGES_PER_THREAD),
    };
    try {
      const wrote = await writeThread(store, id, next, etag);
      if (wrote && wrote.modified === false) continue;
      return next;
    } catch {
      return null;
    }
  }
  return null;
};

// Read storefront-config from KV without throwing on missing binding.
// Returns the raw config object or `null` if anything goes wrong; callers
// must handle the null case so a misconfigured `STOREFRONT_CONFIG` binding
// never breaks the customer's chat send.
const readStorefrontConfig = async () => {
  try {
    const env = getCloudflareEnv();
    if (!env?.STOREFRONT_CONFIG) return null;
    const value = await env.STOREFRONT_CONFIG.get(CONFIG_KEY, { type: "json" });
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const readProductsForAi = async () => {
  try {
    const env = getCloudflareEnv();
    if (!env?.PRODUCTS) return [];
    const value = await env.PRODUCTS.get(PRODUCTS_KEY, { type: "json" });
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

// Mark the thread index entry as awaiting human follow-up. Best-effort —
// a missed flag is preferable to retrying CAS aggressively and starving
// the customer's poll.
const markNeedsHuman = async (store, id) => {
  const at = nowISO();
  try {
    await upsertIndexEntry(store, (threads) => {
      const idx = threads.findIndex((t) => t.id === id);
      if (idx === -1) return threads;
      const prior = threads[idx];
      return [
        ...threads.slice(0, idx),
        sanitizeIndexEntry({ ...prior, needsHumanAt: at, updatedAt: at }),
        ...threads.slice(idx + 1),
      ];
    });
  } catch {
    // ignore
  }
};

// Try to post an AI auto-reply for a freshly-appended customer message.
// Always best-effort: errors, timeouts, missing config, missing API key,
// or a model that refuses to answer all collapse into "do nothing". The
// customer's response is not blocked on this — we wait long enough for
// Groq's typical latency (~0.7s) but the GROQ_TIMEOUT_MS inside the AI
// library bounds the worst case.
const maybePostAiReply = async ({
  store,
  threadAfterCustomer,
  customerMessage,
}) => {
  let chatConfig = null;
  let products = [];
  try {
    const config = await readStorefrontConfig();
    chatConfig = config?.chat || null;
    if (!chatConfig?.ai?.enabled) return; // fast-path skip
    products = await readProductsForAi();
  } catch {
    return;
  }

  let outcome;
  try {
    outcome = await generateAutoReply({
      env: getCloudflareEnv(),
      thread: threadAfterCustomer,
      customerMessage,
      chatConfig,
      products,
    });
  } catch {
    return;
  }
  if (!outcome || outcome.kind === "skip") return;

  if (outcome.kind === "handoff") {
    await markNeedsHuman(store, threadAfterCustomer.id);
    return;
  }

  if (outcome.kind !== "reply" || !outcome.body) return;

  const at = nowISO();
  const updated = await appendMessage(
    store,
    threadAfterCustomer.id,
    { at, from: "ai", body: outcome.body },
    { rejectIfClosed: true },
  );
  if (!updated || updated === "closed") return;

  try {
    await upsertIndexEntry(store, (threads) => {
      const idx = threads.findIndex((t) => t.id === threadAfterCustomer.id);
      if (idx === -1) return threads;
      const prior = threads[idx];
      return [
        ...threads.slice(0, idx),
        sanitizeIndexEntry({
          ...prior,
          updatedAt: at,
          // AI replies don't flip `lastFromAdmin` — the admin still owes
          // the customer a real read if the conversation continues.
          messageCount: (prior.messageCount || 0) + 1,
          // Auto-reply landed; clear any stale needs-human flag so the
          // thread doesn't sit pinned in the admin list forever.
          needsHumanAt: "",
        }),
        ...threads.slice(idx + 1),
      ];
    });
  } catch {
    // ignore index update failure — the message itself landed
  }
};

export const handler = async (event) => {
  try {
    const store = getChatStore(event);

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};

      // Customer reads their own thread by token (no auth — token is the secret)
      if (params.action === "thread") {
        const id = String(params.id || "");
        if (!TOKEN_PATTERN.test(id))
          return json(400, { error: "Bad thread id" });
        const thread = await readThread(store, id);
        if (!thread) return json(404, { error: "Thread not found" });
        const adminTypingAt = await readAdminTyping(store, id);
        return json(200, {
          thread: {
            id: thread.id,
            name: thread.name,
            email: thread.email,
            createdAt: thread.createdAt,
            messages: thread.messages,
            closedAt: thread.closedAt || "",
            closedBy: thread.closedBy || "",
            adminTypingAt,
          },
        });
      }

      // Admin lists all threads
      if (params.action === "list") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        try {
          const { threads } = await readIndexWithMeta(store);
          return json(200, { threads });
        } catch {
          // Surface as empty list rather than a 500; UI just shows
          // "no threads yet" instead of breaking.
          return json(200, { threads: [] });
        }
      }

      return json(400, { error: "Unknown action" });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = parseBody(event.body);
    const action = body.action;

    if (action === "start") {
      const limit = await consumeRateLimit(event, {
        bucket: "chat-start",
        windowMs: 60_000,
        max: 5,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

      const name = trimString(body.name, 80);
      const email = trimString(body.email, 200).toLowerCase();
      const initialMessage = trimString(body.message, MAX_BODY_CHARS);
      if (!name) return json(400, { error: "Name required" });
      if (!email || !EMAIL_RE.test(email)) {
        return json(400, { error: "Valid email required" });
      }
      if (initialMessage.length < 1) {
        return json(400, { error: "Please enter a message" });
      }

      const id = generateThreadId();
      const meta = captureRequestMeta(event);
      const createdAt = nowISO();
      const thread = {
        id,
        name,
        email,
        createdAt,
        ip: meta.ip || "",
        browser: meta.browser || "",
        os: meta.os || "",
        device: meta.device || "",
        userAgent: meta.userAgent || "",
        messages: [{ at: createdAt, from: "customer", body: initialMessage }],
      };
      try {
        await writeThread(store, id, thread);
      } catch {
        return json(500, { error: "Could not start chat" });
      }
      await upsertIndexEntry(store, (threads) => [
        ...threads.filter((t) => t.id !== id),
        sanitizeIndexEntry({
          id,
          name,
          email,
          createdAt,
          updatedAt: createdAt,
          customerLastMessageAt: createdAt,
          lastReadByAdminAt: "",
          lastFromAdmin: false,
          messageCount: 1,
          ip: meta.ip || "",
          browser: meta.browser || "",
          os: meta.os || "",
          device: meta.device || "",
        }),
      ]);
      try {
        await appendAuditEvent(event, {
          type: "chat.message",
          outcome: "success",
          subject: email,
          detail: `started thread ${id}`,
          ...meta,
        });
      } catch {
        // ignore
      }
      // Best-effort auto-reply on the very first message. Wrap in a
      // try/catch even though the helper swallows its own errors — the
      // customer's response must never depend on AI succeeding.
      try {
        await maybePostAiReply({
          store,
          threadAfterCustomer: thread,
          customerMessage: initialMessage,
        });
      } catch {
        // ignore
      }
      // Re-read the thread so the response includes the AI reply (if one
      // landed). Falls back to the original snapshot if the re-read fails
      // — the widget's 5s poll will pick up the AI reply on the next tick.
      const refreshed = await readThread(store, id);
      const finalThread = refreshed || thread;
      return json(200, {
        thread: {
          id,
          name,
          email,
          createdAt,
          messages: finalThread.messages,
        },
      });
    }

    if (action === "send") {
      const limit = await consumeRateLimit(event, {
        bucket: "chat-send",
        windowMs: 60_000,
        max: 20,
      });
      if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

      const id = String(body.id || "");
      if (!TOKEN_PATTERN.test(id)) return json(400, { error: "Bad thread id" });
      const message = trimString(body.message, MAX_BODY_CHARS);
      if (message.length < 1) return json(400, { error: "Message required" });

      // Reject sends on closed threads. The check has to happen inside the
      // same CAS loop that does the write so a concurrent admin-close
      // between a pre-flight check and the write can't slip a customer
      // message in after the closed system message.
      const at = nowISO();
      const updated = await appendMessage(
        store,
        id,
        { at, from: "customer", body: message },
        { rejectIfClosed: true },
      );
      if (updated === "closed") {
        return json(409, { error: "Conversation closed" });
      }
      if (!updated) return json(404, { error: "Thread not found" });

      await upsertIndexEntry(store, (threads) => {
        const idx = threads.findIndex((t) => t.id === id);
        if (idx === -1) return threads;
        const prior = threads[idx];
        return [
          ...threads.slice(0, idx),
          sanitizeIndexEntry({
            ...prior,
            updatedAt: at,
            customerLastMessageAt: at,
            lastFromAdmin: false,
            messageCount: prior.messageCount + 1,
          }),
          ...threads.slice(idx + 1),
        ];
      });
      try {
        await appendAuditEvent(event, {
          type: "chat.message",
          outcome: "success",
          subject: updated.email,
          detail: `customer reply on ${id}`,
          ...captureRequestMeta(event),
        });
      } catch {
        // ignore
      }
      try {
        await maybePostAiReply({
          store,
          threadAfterCustomer: updated,
          customerMessage: message,
        });
      } catch {
        // ignore
      }
      // Same pattern as `start` — re-read so the response can include any
      // AI reply that just landed; fall back to the pre-AI snapshot.
      const refreshed = await readThread(store, id);
      const finalThread = refreshed || updated;
      const adminTypingAt = await readAdminTyping(store, id);
      return json(200, {
        thread: {
          id,
          name: finalThread.name,
          email: finalThread.email,
          createdAt: finalThread.createdAt,
          messages: finalThread.messages,
          closedAt: finalThread.closedAt || "",
          closedBy: finalThread.closedBy || "",
          adminTypingAt,
        },
      });
    }

    if (action === "admin-reply") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const id = String(body.id || "");
      if (!TOKEN_PATTERN.test(id)) return json(400, { error: "Bad thread id" });
      const message = trimString(body.message, MAX_BODY_CHARS);
      if (message.length < 1) return json(400, { error: "Message required" });

      const at = nowISO();
      // Same TOCTOU rationale as `send`: the closed-check has to happen
      // inside the CAS loop so it sees the same snapshot we're writing
      // against.
      const updated = await appendMessage(
        store,
        id,
        { at, from: "admin", body: message },
        { rejectIfClosed: true },
      );
      if (updated === "closed") {
        return json(409, {
          error: "Conversation closed \u2014 reopen to reply",
        });
      }
      if (!updated) return json(404, { error: "Thread not found" });

      await upsertIndexEntry(store, (threads) => {
        const idx = threads.findIndex((t) => t.id === id);
        if (idx === -1) return threads;
        const prior = threads[idx];
        return [
          ...threads.slice(0, idx),
          sanitizeIndexEntry({
            ...prior,
            updatedAt: at,
            lastFromAdmin: true,
            lastReadByAdminAt: at,
            messageCount: prior.messageCount + 1,
            // Admin took over — clear the "needs human" badge.
            needsHumanAt: "",
          }),
          ...threads.slice(idx + 1),
        ];
      });
      // Sending clears the typing indicator so the customer doesn't see a
      // ghost "Support is typing…" right after the reply lands.
      try {
        await store.delete(typingKey(id));
      } catch {
        // ignore
      }
      try {
        await appendAuditEvent(event, {
          type: "chat.message",
          outcome: "success",
          subject: updated.email,
          detail: `admin reply on ${id}`,
          ...captureRequestMeta(event),
        });
      } catch {
        // ignore
      }
      return json(200, {
        thread: {
          id,
          name: updated.name,
          email: updated.email,
          createdAt: updated.createdAt,
          messages: updated.messages,
          closedAt: updated.closedAt || "",
          closedBy: updated.closedBy || "",
        },
      });
    }

    if (action === "admin-typing") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const id = String(body.id || "");
      if (!TOKEN_PATTERN.test(id)) return json(400, { error: "Bad thread id" });
      // Confirm the thread exists so we don't sprinkle typing blobs for
      // arbitrary ids.
      const existing = await readThread(store, id);
      if (!existing) return json(404, { error: "Thread not found" });
      if (existing.closedAt) {
        // Don't leak a typing indicator on a closed thread.
        return json(200, { ok: true, suppressed: true });
      }
      await writeAdminTyping(store, id);
      return json(200, { ok: true });
    }

    if (action === "admin-close" || action === "admin-reopen") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const id = String(body.id || "");
      if (!TOKEN_PATTERN.test(id)) return json(400, { error: "Bad thread id" });

      const closing = action === "admin-close";
      const at = nowISO();

      let final = null;
      // Distinguish a real state change from an idempotent no-op so that a
      // double-clicked Close/Reopen button doesn't drift messageCount /
      // lastFromAdmin / lastReadByAdminAt every press.
      let didChange = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const { etag, data } = await readThreadWithMeta(store, id);
        if (!data) return json(404, { error: "Thread not found" });
        if (closing && data.closedAt) {
          // Already closed \u2014 idempotent success, no side effects.
          final = data;
          break;
        }
        if (!closing && !data.closedAt) {
          // Already open \u2014 idempotent success, no side effects.
          final = data;
          break;
        }
        const sysMessage = closing
          ? {
              at,
              from: "system",
              body: "Conversation closed by support. Start a new chat anytime.",
            }
          : { at, from: "system", body: "Conversation reopened by support." };
        const next = {
          ...data,
          closedAt: closing ? at : "",
          closedBy: closing ? "admin" : "",
          messages: [...data.messages, sysMessage].slice(
            -MAX_MESSAGES_PER_THREAD,
          ),
        };
        try {
          const wrote = await writeThread(store, id, next, etag);
          if (wrote && wrote.modified === false) continue;
          final = next;
          didChange = true;
          break;
        } catch {
          return json(500, {
            error: closing ? "Could not close" : "Could not reopen",
          });
        }
      }
      if (!final) {
        return json(409, {
          error: closing
            ? "Could not close \u2014 try again"
            : "Could not reopen \u2014 try again",
        });
      }

      if (didChange) {
        await upsertIndexEntry(store, (threads) => {
          const idx = threads.findIndex((t) => t.id === id);
          if (idx === -1) return threads;
          const prior = threads[idx];
          return [
            ...threads.slice(0, idx),
            sanitizeIndexEntry({
              ...prior,
              updatedAt: at,
              closedAt: closing ? at : "",
              messageCount: (prior.messageCount || 0) + 1,
              lastFromAdmin: true,
              lastReadByAdminAt: at,
            }),
            ...threads.slice(idx + 1),
          ];
        });

        // Closing nukes the typing indicator so a stale "typing\u2026" hint
        // can't hover under the closed banner.
        try {
          await store.delete(typingKey(id));
        } catch {
          // ignore
        }

        try {
          await appendAuditEvent(event, {
            type: "chat.message",
            outcome: "success",
            subject: final.email,
            detail: `${closing ? "closed" : "reopened"} thread ${id}`,
            ...captureRequestMeta(event),
          });
        } catch {
          // ignore
        }
      }

      return json(200, {
        thread: {
          id,
          name: final.name,
          email: final.email,
          createdAt: final.createdAt,
          messages: final.messages,
          closedAt: final.closedAt || "",
          closedBy: final.closedBy || "",
        },
      });
    }

    if (action === "admin-mark-read") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const id = String(body.id || "");
      if (!TOKEN_PATTERN.test(id)) return json(400, { error: "Bad thread id" });
      const at = nowISO();
      await upsertIndexEntry(store, (threads) => {
        const idx = threads.findIndex((t) => t.id === id);
        if (idx === -1) return threads;
        const prior = threads[idx];
        return [
          ...threads.slice(0, idx),
          sanitizeIndexEntry({
            ...prior,
            lastReadByAdminAt: at,
            // Admin acknowledged the thread — clear the AI handoff badge
            // so the list doesn't pin it forever.
            needsHumanAt: "",
          }),
          ...threads.slice(idx + 1),
        ];
      });
      return json(200, { ok: true, at });
    }

    return json(400, { error: "Unknown action" });
  } catch {
    // Don't leak err.message — internal stack/driver text could expose
    // implementation details to unauthenticated callers. Match the pattern
    // used in admin-auth.js / orders.js.
    return json(500, { error: "Internal error" });
  }
};

export const onRequest = wrapHandler(handler);
