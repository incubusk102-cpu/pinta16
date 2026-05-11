// Groq AI auto-reply for the customer chat widget.
//
// When a customer message lands and the admin hasn't replied recently,
// we try a deterministic FAQ keyword match first, then fall back to a
// Groq Llama completion grounded in the gallery's FAQs and (optionally)
// the product catalogue. The reply is appended to the thread as
// `from: "ai"`. If the AI is uncertain or the customer asks for a human,
// no auto-reply is posted — the thread sits in the admin Chat tab as
// usual, so the gallery owner can take over.
//
// Free tier: Groq's Llama 3.3 70B model is ~14,400 requests/day at zero
// cost — orders of magnitude more than canvhub will use. Anything beyond
// the free tier silently degrades to "no AI reply" (admin handles it
// manually), so we never raise an error path that's visible to buyers.
//
// `GROQ_API_KEY` (or `GROQ_TOKEN` — both names are accepted, since the
// canvhub Cloudflare Pages env happens to be named `GROQ_TOKEN`) is
// read from the Pages env. Missing key → AI is off, no errors thrown.

import { logError } from "./redact.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// The token the model is instructed to emit when it can't answer the
// customer's question confidently. Picked to be unique enough that it
// would never appear in a real reply.
const NEEDS_HUMAN_TOKEN = "<<<NEEDS_HUMAN>>>";

// Keep AI replies short — chat is a quick-question medium. Anything
// over ~120 words and customers stop reading.
const MAX_REPLY_CHARS = 800;

// Hard upper bound on how long we wait for Groq before giving up and
// leaving the message for the admin to handle. Groq's typical p50 for
// 70B is ~600ms; 6s covers a very generous p99.
const GROQ_TIMEOUT_MS = 6000;

// Skip auto-reply if the admin sent something within this window. The
// human is clearly handling this thread; piling an AI message on top
// would feel like the bot is interrupting.
const ADMIN_COOLDOWN_MS = 5 * 60 * 1000;

// Hard cap on how much of the product list we ship into the system
// prompt. The full catalogue can be 100+ items; the AI doesn't need
// the long descriptions, just enough to point a customer at a SKU.
const MAX_PRODUCT_CONTEXT = 30;
const MAX_FAQ_CONTEXT = 12;

// Words that signal the customer wants a real person, not a bot. The
// match is case-insensitive whole-word against the message body and
// these are merged with any admin-configured handoff keywords on top.
const DEFAULT_HANDOFF_KEYWORDS = [
  "human",
  "agent",
  "live agent",
  "real person",
  "manager",
  "owner",
  "talk to someone",
  "speak to someone",
  "speak with someone",
  "not a bot",
  "stop bot",
  "stop ai",
];

const truthy = (v) => v !== undefined && v !== null && v !== "";

const trimToChars = (raw, max) => {
  const str = String(raw ?? "").trim();
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trimEnd()}…`;
};

const isAiEnabled = (chatConfig) =>
  Boolean(chatConfig?.ai && chatConfig.ai.enabled === true);

const lastAdminAt = (messages = []) => {
  let latest = 0;
  for (const m of messages) {
    if (m && m.from === "admin") {
      const t = Date.parse(m.at);
      if (Number.isFinite(t) && t > latest) latest = t;
    }
  }
  return latest;
};

const containsHandoffPhrase = (message, keywords) => {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  const list = [...DEFAULT_HANDOFF_KEYWORDS, ...(keywords || [])]
    .map((k) =>
      String(k || "")
        .toLowerCase()
        .trim(),
    )
    .filter((k) => k.length >= 3);
  for (const kw of list) {
    // Single-word keywords use word-boundary match so "humanitarian"
    // doesn't trigger "human". Multi-word phrases fall back to plain
    // substring match because word boundaries don't play well with
    // spaces in some Unicode locales.
    if (/\s/.test(kw)) {
      if (text.includes(kw)) return true;
    } else {
      const re = new RegExp(
        `\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      );
      if (re.test(text)) return true;
    }
  }
  return false;
};

// Lightweight FAQ keyword matcher — counts how many tokens from the
// customer's message overlap with the FAQ's question text. If the best
// FAQ has at least two distinct hits AND is meaningfully ahead of the
// runner-up, we return its answer. This is good enough for "shipping?",
// "returns", "how do I pay", and other short questions, and is free
// (no API call).
const findFaqMatch = (message, faqs) => {
  if (!Array.isArray(faqs) || faqs.length === 0) return null;
  const tokens = String(message || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  const tokenSet = new Set(tokens);

  let best = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const faq of faqs) {
    if (!faq || typeof faq !== "object") continue;
    const haystack = `${faq.question || ""} ${faq.id || ""}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ");
    let score = 0;
    const seen = new Set();
    for (const tok of tokenSet) {
      if (seen.has(tok)) continue;
      if (haystack.includes(tok)) {
        score += 1;
        seen.add(tok);
      }
    }
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = faq;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  if (!best) return null;
  // Require at least 2 distinct keyword hits AND a 1-point margin over
  // the runner-up so we don't fire "Shipping & delivery" on a generic
  // "how much" question that hit nothing else.
  if (bestScore < 2) return null;
  if (bestScore - runnerUp < 1) return null;
  return best;
};

const formatProductsForPrompt = (products) => {
  if (!Array.isArray(products) || products.length === 0) return "";
  const slice = products.slice(0, MAX_PRODUCT_CONTEXT);
  const lines = slice
    .map((p) => {
      if (!p || typeof p !== "object") return "";
      const title = String(p.title || p.name || "").trim();
      if (!title) return "";
      const price = Number(p.price);
      const priceStr =
        Number.isFinite(price) && price > 0 ? ` — PHP ${price}` : "";
      const stock = Number(p.stock);
      const stockStr = Number.isFinite(stock)
        ? stock > 0
          ? " (available)"
          : " (sold out)"
        : "";
      const size = String(p.size || "").trim();
      const sizeStr = size ? ` ${size}` : "";
      return `- ${title}${sizeStr}${priceStr}${stockStr}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `Active artworks:\n${lines.join("\n")}`;
};

const formatFaqsForPrompt = (faqs) => {
  if (!Array.isArray(faqs) || faqs.length === 0) return "";
  const slice = faqs.slice(0, MAX_FAQ_CONTEXT);
  const lines = slice
    .map((f) => {
      if (!f || typeof f !== "object") return "";
      const q = trimToChars(f.question, 100);
      const a = trimToChars(f.answer, 600);
      if (!q || !a) return "";
      return `Q: ${q}\nA: ${a}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `Shop FAQ:\n${lines.join("\n\n")}`;
};

const buildSystemPrompt = ({ chatConfig, products, brandName }) => {
  const customPreamble = String(chatConfig?.ai?.systemPrompt || "").trim();

  const defaultPreamble = `You are the friendly customer-service assistant for ${
    brandName || "Canvas Hub"
  }, a Philippine gallery selling original hand-painted artwork. Reply to customers in their language (Tagalog, Taglish, or English — match the customer). Be warm, concise (1–3 sentences), and accurate.`;

  const guardrails = [
    "Ground every answer in the Shop FAQ and the active artworks list below.",
    "If the customer asks about pricing, shipping, payment, returns, sizing, custom commissions, or stock, answer using the data provided — never invent numbers.",
    "If the customer asks something you cannot answer from the data (e.g. order status, refund timing for a specific order, complaints, urgent issues, anything legal or medical), reply with exactly the token " +
      NEEDS_HUMAN_TOKEN +
      " and nothing else, so a human takes over.",
    "If the customer asks to talk to a human / live agent / owner, reply with exactly the token " +
      NEEDS_HUMAN_TOKEN +
      ".",
    "Never invent product titles, prices, promo codes, or shipping fees not present in the data. If unsure, return " +
      NEEDS_HUMAN_TOKEN +
      ".",
    "Never collect or echo back credit-card numbers, passwords, or OTPs. If a customer pastes one, return " +
      NEEDS_HUMAN_TOKEN +
      ".",
    "Currency is Philippine Peso (PHP). Format numbers as PHP 1,234.",
    "Keep responses under 120 words.",
  ];

  const sections = [
    customPreamble || defaultPreamble,
    guardrails.map((g) => `• ${g}`).join("\n"),
    formatFaqsForPrompt(chatConfig?.faqs),
    formatProductsForPrompt(products),
  ].filter(Boolean);

  return sections.join("\n\n");
};

const buildConversation = (thread) => {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  // Most recent N messages, filtered to customer / admin / ai (skip
  // system status lines like "Conversation closed"). System lines are
  // pure UI hints — including them confuses the model.
  const SHOW_LAST = 12;
  const trimmed = messages
    .filter(
      (m) =>
        m && (m.from === "customer" || m.from === "admin" || m.from === "ai"),
    )
    .slice(-SHOW_LAST);
  return trimmed.map((m) => ({
    role:
      m.from === "customer"
        ? "user"
        : m.from === "ai"
          ? "assistant"
          : // admin
            "assistant",
    content: trimToChars(m.body, 1500),
  }));
};

const callGroq = async ({
  apiKey,
  model,
  systemPrompt,
  conversation,
  signal,
}) => {
  const resp = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      temperature: 0.3,
      max_tokens: 400,
      messages: [{ role: "system", content: systemPrompt }, ...conversation],
    }),
    signal,
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.text()).slice(0, 200);
    } catch {
      // ignore
    }
    throw new Error(`Groq HTTP ${resp.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Groq response missing message content");
  }
  return content;
};

const cleanReply = (raw) => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes(NEEDS_HUMAN_TOKEN)) return "";
  // Strip any role-play prefixes the model sometimes leaks ("Assistant:",
  // "AI:", etc.) and over-long replies.
  const stripped = trimmed
    .replace(/^\s*(assistant|ai|bot|support|agent)\s*:\s*/i, "")
    .trim();
  return trimToChars(stripped, MAX_REPLY_CHARS);
};

/**
 * Decide whether to attempt an AI reply for a freshly-appended customer
 * message, and produce the reply body if so. Returns one of:
 *
 *   { kind: "skip", reason: string }
 *       — Nothing was tried; admin handles the thread.
 *   { kind: "handoff", reason: string }
 *       — Customer asked for a human (or AI returned the handoff token);
 *         flag the thread but post no reply.
 *   { kind: "reply", body: string, source: "faq" | "groq" }
 *       — A reply was generated and should be appended as `from: "ai"`.
 *
 * Inputs:
 *   - env: Pages env (must contain GROQ_API_KEY or GROQ_TOKEN for the
 *          groq path)
 *   - thread: full thread object including the just-appended customer
 *             message
 *   - customerMessage: the body string of that latest message
 *   - chatConfig: the `chat` block of storefront-config
 *   - products: optional list to ground the response (best-effort)
 *   - brandName: optional override (defaults to "Canvas Hub")
 */
export const generateAutoReply = async ({
  env,
  thread,
  customerMessage,
  chatConfig,
  products,
  brandName,
}) => {
  if (!thread || !customerMessage) {
    return { kind: "skip", reason: "no-input" };
  }
  if (thread.closedAt) {
    return { kind: "skip", reason: "thread-closed" };
  }
  if (!isAiEnabled(chatConfig)) {
    return { kind: "skip", reason: "ai-disabled" };
  }

  // Cooldown: if the admin spoke recently, the human is on it — let
  // them keep the lead. (Customer's own messages don't count.)
  const adminTs = lastAdminAt(thread.messages);
  if (adminTs > 0 && Date.now() - adminTs < ADMIN_COOLDOWN_MS) {
    return { kind: "skip", reason: "admin-cooldown" };
  }

  // Explicit handoff request.
  if (
    containsHandoffPhrase(
      customerMessage,
      chatConfig?.ai?.handoffKeywords || [],
    )
  ) {
    return { kind: "handoff", reason: "customer-requested-human" };
  }

  // FAQ fast path: zero-latency, free, deterministic.
  const faq = findFaqMatch(customerMessage, chatConfig?.faqs);
  if (faq) {
    return {
      kind: "reply",
      body: trimToChars(faq.answer, MAX_REPLY_CHARS),
      source: "faq",
    };
  }

  // Groq path: skip silently if no key configured. We don't want to
  // log noisy errors when the gallery owner just hasn't set up Groq
  // yet — `chat.ai.enabled=true` plus missing key is a valid "I want
  // AI but haven't wired the key" state.
  // We accept either `GROQ_API_KEY` (the original Groq-recommended
  // name) or `GROQ_TOKEN` (the name canvhub's Cloudflare Pages env is
  // configured with) so admins can pick whichever convention they
  // already use without redeploying.
  const rawKey = env?.GROQ_API_KEY || env?.GROQ_TOKEN;
  const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!apiKey) {
    return { kind: "skip", reason: "no-groq-key" };
  }

  const model =
    (typeof env?.GROQ_MODEL === "string" && env.GROQ_MODEL) ||
    (typeof chatConfig?.ai?.model === "string" && chatConfig.ai.model) ||
    DEFAULT_MODEL;

  const systemPrompt = buildSystemPrompt({
    chatConfig,
    products,
    brandName,
  });
  const conversation = buildConversation(thread);

  // Defensive timeout — if Groq is slow, abandon the auto-reply and
  // let the admin pick up. The customer's poll will see no AI reply
  // arrive, which is the same as if AI were off.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GROQ_TIMEOUT_MS);

  let raw;
  try {
    raw = await callGroq({
      apiKey,
      model,
      systemPrompt,
      conversation,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (truthy(err)) logError("chat AI groq call failed:", err);
    return { kind: "skip", reason: "groq-error" };
  } finally {
    clearTimeout(timer);
  }

  // The model was told to emit the handoff token when it can't answer.
  if (typeof raw === "string" && raw.includes(NEEDS_HUMAN_TOKEN)) {
    return { kind: "handoff", reason: "ai-uncertain" };
  }

  const body = cleanReply(raw);
  if (!body) return { kind: "handoff", reason: "ai-empty" };

  return { kind: "reply", body, source: "groq" };
};

// Exported for unit tests.
export const __internals = {
  NEEDS_HUMAN_TOKEN,
  ADMIN_COOLDOWN_MS,
  containsHandoffPhrase,
  findFaqMatch,
  buildSystemPrompt,
  buildConversation,
  cleanReply,
  isAiEnabled,
  lastAdminAt,
};
