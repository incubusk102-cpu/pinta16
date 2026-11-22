// AI auto-reply for the customer chat widget.
//
// When a customer message lands and the admin hasn't replied recently,
// we try a deterministic FAQ keyword match first, then fall back to an
// LLM completion grounded in the gallery's FAQs and (optionally) the
// product catalogue. The reply is appended to the thread as
// `from: "ai"`. If the AI is uncertain or the customer asks for a human,
// no auto-reply is posted — the thread sits in the admin Chat tab as
// usual, so the gallery owner can take over.
//
// Two providers are supported, in priority order:
//
//   1. Cloudflare Workers AI (`env.AI`) — same-cloud, no external key,
//      free up to 10k Neurons/day, immune to third-party rate-limit
//      surprises. This is the recommended default; enable it by adding
//      the AI binding in `wrangler.toml` (`[ai] binding = "AI"`).
//
//   2. Groq Llama (`env.GROQ_API_KEY` or `env.GROQ_TOKEN`) — fallback
//      for projects that already have a Groq key wired up. Used when
//      the Workers AI binding is missing. Anything beyond the Groq free
//      tier silently degrades to "no AI reply".
//
// If neither provider is configured, the AI step is skipped silently
// (the customer's message still lands, the admin handles the thread
// manually). No error is ever visible to buyers.

import { logError } from "./redact.js";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
// Default Workers AI model: Llama 3.1 8B is universally available on the
// free tier and quality is solid for FAQ-style chat. Override per-site
// via `chatConfig.ai.model` (must start with `@cf/`) or the
// `WORKERS_AI_MODEL` env var if you want a different model (e.g.
// `@cf/meta/llama-3.3-70b-instruct-fp8-fast` on a paid tier).
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

// The token the model is instructed to emit when it can't answer the
// customer's question confidently. Picked to be unique enough that it
// would never appear in a real reply.
const NEEDS_HUMAN_TOKEN = "<<<NEEDS_HUMAN>>>";

// Workers AI's 8B Llama in particular has been observed to mangle the
// handoff token in production — dropping a leading `<`, swallowing the
// `N` in `NEEDS_`, eating the underscore, or omitting the `NEEDS_`
// prefix entirely. A strict `.includes("<<<NEEDS_HUMAN>>>")` check
// missed those variants and the malformed token leaked to the
// customer as a literal chat message. This regex tolerates those
// mangled variants: 2+ angle brackets on either side surrounding a
// small chunk of optional prefix characters and the word `HUMAN`.
// Examples it now catches that the strict check did not:
//   `<<EEDS_HUMAN>>>`, `<<<HUMAN>>>`, `<<<NEEDSHUMAN>>>`,
//   `<<< NEEDS HUMAN >>>`, `<<NEEDS_HUMAN>>`.
const HANDOFF_TOKEN_REGEX = /<{2,}[^<>]{0,20}HUMAN[^<>]{0,5}>{2,}/i;
const looksLikeHandoffToken = (s) =>
  typeof s === "string" && HANDOFF_TOKEN_REGEX.test(s);

// Keep AI replies short — chat is a quick-question medium. Anything
// over ~120 words and customers stop reading.
const MAX_REPLY_CHARS = 800;

// Hard upper bound on how long we wait for the LLM before giving up and
// leaving the message for the admin to handle. Groq's typical p50 for
// 70B is ~600ms and Workers AI's 8B is similar; 6s covers a very
// generous p99 for either path.
const AI_TIMEOUT_MS = 6000;

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

// Default warm persona for the AI. Reads like an actual gallery
// assistant rather than a corporate FAQ bot. Kept short so it doesn't
// crowd out the data-grounding rules below. Admins who want a
// different voice can override via chat.ai.systemPrompt.
const DEFAULT_PERSONA =
  "You are Mia, the friendly assistant at Canvas Hub \u2014 a small Filipino independent art studio that sells original hand-painted artworks. Be warm and conversational, like a thoughtful gallerist chatting with a buyer who walked in. Match the customer's language naturally (English, Tagalog, or Taglish \u2014 do not switch unprompted). Keep replies short: one short paragraph, never more than ~80 words. No emojis unless the customer used one first.";

// Customer-facing acknowledgement variants posted when the AI hands
// off to a human (either an input-side keyword match or an output-side
// handoff token). Rotated randomly so consecutive handoffs don't read
// identically. The `{name_suffix}` placeholder is replaced with `,
// <First>` when a usable name is available, or with an empty string
// otherwise — the surrounding punctuation already reads naturally in
// both cases.
const HANDOFF_ACK_VARIANTS = [
  "Got it{name_suffix} \u2014 letting the gallery owner know now. Someone will get back to you within a few hours. Salamat sa pasensya!",
  "Thanks for reaching out{name_suffix}! Passing this along to a real person from the team. We usually reply within a few hours.",
  "Hi there{name_suffix} \u2014 flagging this for the gallery owner so a real person can help. Talk soon!",
  "Noted{name_suffix}. The team has been pinged \u2014 you'll hear back from a real person shortly. Salamat!",
];

// Customer specifically asked to talk to a human (e.g. "are you a real
// person?", "can I talk to the owner?"). Different vibe from the
// generic ack above \u2014 here Mia introduces herself by name, confirms a
// real person is being looped in, and offers to help in the meantime.
// This is what the customer expected: a warm "hi, I'm Mia" instead of
// the widget going silent or dropping a bare "got it" line. The
// output-side handoff (Mia couldn't answer from the data) keeps using
// HANDOFF_ACK_VARIANTS \u2014 mid-conversation "hi, I'm Mia" would read
// as out of place.
const GREETING_HANDOFF_ACK_VARIANTS = [
  "Hi{name_suffix}! I'm Mia, the AI assistant here at Canvas Hub \u2014 a real person from the team will be with you shortly (usually within a few hours). While you wait, I can answer quick questions about shipping, payment, returns, or our paintings \u2014 just ask!",
  "Hey{name_suffix} \u2014 Mia here, Canvas Hub's AI assistant. I've already pinged the gallery owner so a real person can take over. In the meantime, happy to help with anything about our artworks, pricing, or shipping \u2014 feel free to ask!",
  "Hi{name_suffix}, I'm Mia \u2014 the AI greeter for Canvas Hub. A real person from the team is being notified now and should reply within a few hours. Anything I can help with while you wait? Shipping, payment methods, returns, sizes \u2014 ask away!",
  "Kumusta{name_suffix}! Mia here \u2014 I'm Canvas Hub's AI assistant. Pinapadala ko na ito sa gallery owner; a real person will reply within a few hours. Habang naghihintay, happy to help with any quick questions about the paintings or shipping!",
];

// Soft preamble variants prepended to a verbatim FAQ answer so the
// reply doesn't read like an unchanged copy-paste. Returns the
// preamble string + a trailing newline, or "" if no usable name was
// supplied (in which case we just send the admin-edited FAQ answer
// raw, which is the existing behaviour).
const FAQ_PREAMBLE_VARIANTS = [
  "Hi {name}! Here's the info:",
  "Hey {name} \u2014 quick answer for you:",
  "Hi {name}, happy to help with that:",
  "Good question, {name}! Here's what we've got:",
];

const truthy = (v) => v !== undefined && v !== null && v !== "";

// Returns a trimmed customer name only if it looks plausibly like a
// real name. The chat widget requires *something* in the name field
// but doesn't enforce shape, so "asdf", "123", or a 200-char paste
// shouldn't end up in the prompt. Empty string → caller treats as
// "no name available".
const sanitizeCustomerName = (raw) => {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().slice(0, 40);
  if (trimmed.length < 2) return "";
  // Require at least one ASCII letter so digit-only / symbol-only
  // garbage doesn't get personalised against. Non-ASCII names (e.g.
  // Ñ, accented characters) usually also contain ASCII letters; this
  // is intentionally permissive.
  if (!/[a-zA-Z]/.test(trimmed)) return "";
  return trimmed;
};

const firstName = (raw) => {
  const full = sanitizeCustomerName(raw);
  if (!full) return "";
  const first = full.split(/\s+/)[0].slice(0, 20);
  // Title-case the first letter so "jess" → "Jess" without mangling
  // intentionally-cased names like "DJ" (we only touch the first char).
  return first.charAt(0).toUpperCase() + first.slice(1);
};

const pickHandoffAck = (customerName, randomFn = Math.random) => {
  const first = firstName(customerName);
  const idx = Math.floor(randomFn() * HANDOFF_ACK_VARIANTS.length);
  const variant = HANDOFF_ACK_VARIANTS[idx] || HANDOFF_ACK_VARIANTS[0];
  const suffix = first ? `, ${first}` : "";
  return variant.replace("{name_suffix}", suffix);
};

// Used when the handoff was triggered by the customer explicitly
// asking for a human (`outcome.reason === "customer-requested-human"`).
// Reads as a warm "hi, I'm Mia" intro rather than a terse ack \u2014 see
// GREETING_HANDOFF_ACK_VARIANTS above for rationale. Note the suffix
// shape is `" Jess"` (leading space, no comma) because every greeting
// variant ends with `Hi{name_suffix}` / `Hey{name_suffix}` / etc \u2014
// punctuation already reads naturally before the name.
const pickGreetingHandoffAck = (customerName, randomFn = Math.random) => {
  const first = firstName(customerName);
  const idx = Math.floor(randomFn() * GREETING_HANDOFF_ACK_VARIANTS.length);
  const variant =
    GREETING_HANDOFF_ACK_VARIANTS[idx] || GREETING_HANDOFF_ACK_VARIANTS[0];
  const suffix = first ? ` ${first}` : "";
  return variant.replace("{name_suffix}", suffix);
};

const pickFaqPreamble = (customerName, randomFn = Math.random) => {
  const first = firstName(customerName);
  if (!first) return "";
  const idx = Math.floor(randomFn() * FAQ_PREAMBLE_VARIANTS.length);
  const variant = FAQ_PREAMBLE_VARIANTS[idx] || FAQ_PREAMBLE_VARIANTS[0];
  return variant.replace("{name}", first);
};

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

// Lightweight FAQ keyword matcher — counts how many distinct tokens
// from the customer's message appear as substrings of the FAQ's
// question text or id. If the best FAQ has at least one hit AND is
// strictly ahead of the runner-up, we return its answer verbatim. The
// previous threshold of >= 2 hits over-rejected short, very common
// phrasings ("how do I pay", "can I get a refund", "do you ship") and
// pushed them to the LLM, which then paraphrased the FAQ inaccurately
// (e.g. answering "GCash via QR PH only" for the payment question
// while the admin-configured FAQ lists GCash, Maya, bank transfer, and
// cards). The margin-of-1 requirement still rejects genuine ties.
// This is free (no API call) and deterministic, so prefer it whenever
// a single FAQ stands out.
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
  // Require at least 1 keyword hit AND a 1-point margin over the
  // runner-up. The hit floor rejects messages that overlap with
  // nothing (e.g. "how much" hits no FAQ token at all), while the
  // margin requirement rejects ambiguous ties like "returns payment"
  // where two FAQs each score 1. Together they let "how do I pay"
  // → payment FAQ verbatim while still keeping bare "how" off the
  // fast path.
  if (bestScore < 1) return null;
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

const buildSystemPrompt = ({
  chatConfig,
  products,
  brandName,
  customerName,
}) => {
  const customPreamble = String(chatConfig?.ai?.systemPrompt || "").trim();

  // Default preamble was previously a generic "friendly customer-
  // service assistant" line. The Mia persona reads as an actual
  // person, encourages Taglish, and keeps replies short — all of
  // which makes the bot feel less robotic to canvhub's market.
  const defaultPreamble = customPreamble
    ? customPreamble
    : DEFAULT_PERSONA.replace("Canvas Hub", brandName || "Canvas Hub");

  // Customer name is passed through from `thread.name` (captured
  // when the customer started the chat). Used naturally by the
  // model on the first reply so the conversation feels less
  // anonymous. We do NOT ask the model to use it every message —
  // that would read as creepy after the first reply.
  const first = firstName(customerName);
  const nameLine = first
    ? `Customer's first name is ${first}. Address them by name naturally on your first reply (e.g. "Hi ${first} \u2014 ..."). Do not repeat their name in every message.`
    : "";

  const guardrails = [
    "Ground every answer in the Shop FAQ and the active artworks list below.",
    "If the customer asks about pricing, shipping, payment, returns, sizing, or stock, answer using the data provided — never invent numbers.",
    "Never invent product titles, prices, promo codes, or shipping fees not present in the data.",
    "Never collect or echo back credit-card numbers, passwords, or OTPs.",
    "Currency is Philippine Peso (PHP). Format numbers as PHP 1,234.",
    "Keep responses under 120 words.",
    // Handoff guidance is consolidated into a single rule with a strict
    // format clause. Workers AI's 8B Llama has been observed to (a)
    // overuse the handoff token on greetings/small-talk and (b) mangle
    // its spelling. Both are addressed here.
    `Handoff rule: reply with the literal token ${NEEDS_HUMAN_TOKEN} (three "<", the word NEEDS_HUMAN, three ">", nothing else, no extra punctuation) ONLY when the customer explicitly asks for a human / live agent / owner, OR asks something genuinely outside the data above (e.g. "where is my order #1234", refund timing for a specific order, legal/medical/complaints). Greetings, small talk, thanks, and any question answerable from the FAQ or artworks list must get a normal helpful reply — do NOT emit the handoff token. If you cannot reproduce the token exactly as written, give a normal short answer instead of an approximation.`,
  ];

  const sections = [
    defaultPreamble,
    nameLine,
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
      model: model || DEFAULT_GROQ_MODEL,
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

// Cloudflare Workers AI does not accept an AbortSignal directly, so we
// race the inference promise against the signal's abort event to keep
// the same outer-bound behaviour as `callGroq`. The signal is always
// the one set up in `generateAutoReply` against `AI_TIMEOUT_MS`, so
// worst-case latency is identical across both providers.
const callWorkersAI = async ({
  env,
  model,
  systemPrompt,
  conversation,
  signal,
}) => {
  const messages = [{ role: "system", content: systemPrompt }, ...conversation];
  const inference = env.AI.run(model || DEFAULT_WORKERS_AI_MODEL, {
    messages,
    temperature: 0.3,
    max_tokens: 400,
  });
  const result = signal
    ? await Promise.race([
        inference,
        new Promise((_, reject) => {
          const onAbort = () =>
            reject(
              new Error(`Workers AI call aborted after ${AI_TIMEOUT_MS}ms`),
            );
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }),
      ])
    : await inference;
  // Workers AI text-generation models return `{ response: "..." }` for
  // the legacy text shape and `{ choices: [{ message: { content }}]}`
  // for the OpenAI-compatible shape. Honour both.
  const text =
    typeof result?.response === "string"
      ? result.response
      : typeof result?.choices?.[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : null;
  if (typeof text !== "string") {
    throw new Error("Workers AI response missing content");
  }
  return text;
};

const cleanReply = (raw) => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (looksLikeHandoffToken(trimmed)) return "";
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
    // Soft preamble ("Hi Jess! Here's the info:\n\n") on top of the
    // admin-edited FAQ answer so the reply doesn't read as a bare
    // copy-paste from the admin panel. Empty preamble when the
    // customer didn't provide a usable name — keeps the existing
    // raw-FAQ behaviour for those threads.
    const preamble = pickFaqPreamble(thread?.name);
    const body = preamble
      ? trimToChars(`${preamble}\n\n${faq.answer}`, MAX_REPLY_CHARS)
      : trimToChars(faq.answer, MAX_REPLY_CHARS);
    return {
      kind: "reply",
      body,
      source: "faq",
    };
  }

  // Pick a provider, in priority order:
  //   1. Cloudflare Workers AI (`env.AI` binding present) — preferred,
  //      same-cloud, no external key, free up to 10k Neurons/day.
  //   2. Groq (`env.GROQ_API_KEY` or `env.GROQ_TOKEN` set) — fallback for
  //      projects that already have a Groq key wired up.
  //   3. Neither — skip silently. `chat.ai.enabled=true` plus no provider
  //      is a valid "I want AI but haven't finished wiring it" state and
  //      we don't want to log noisy errors at every customer message.
  const workersAiAvailable = Boolean(env?.AI);
  const rawGroqKey = env?.GROQ_API_KEY || env?.GROQ_TOKEN;
  const groqKey = typeof rawGroqKey === "string" ? rawGroqKey.trim() : "";

  let provider;
  if (workersAiAvailable) {
    provider = "workers-ai";
  } else if (groqKey) {
    provider = "groq";
  } else {
    return { kind: "skip", reason: "no-ai-provider" };
  }

  const systemPrompt = buildSystemPrompt({
    chatConfig,
    products,
    brandName,
    customerName: thread?.name,
  });
  const conversation = buildConversation(thread);

  // Defensive timeout — if the provider is slow, abandon the auto-reply
  // and let the admin pick up. The customer's poll will see no AI reply
  // arrive, which is the same as if AI were off.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);

  let raw;
  try {
    if (provider === "workers-ai") {
      const model =
        (typeof env?.WORKERS_AI_MODEL === "string" && env.WORKERS_AI_MODEL) ||
        (typeof chatConfig?.ai?.model === "string" &&
          chatConfig.ai.model.startsWith("@cf/") &&
          chatConfig.ai.model) ||
        DEFAULT_WORKERS_AI_MODEL;
      raw = await callWorkersAI({
        env,
        model,
        systemPrompt,
        conversation,
        signal: ctrl.signal,
      });
    } else {
      const model =
        (typeof env?.GROQ_MODEL === "string" && env.GROQ_MODEL) ||
        (typeof chatConfig?.ai?.model === "string" && chatConfig.ai.model) ||
        DEFAULT_GROQ_MODEL;
      raw = await callGroq({
        apiKey: groqKey,
        model,
        systemPrompt,
        conversation,
        signal: ctrl.signal,
      });
    }
  } catch (err) {
    if (truthy(err)) logError(`chat AI ${provider} call failed:`, err);
    return { kind: "skip", reason: `${provider}-error` };
  } finally {
    clearTimeout(timer);
  }

  // The model was told to emit the handoff token when it can't answer.
  // Use the regex-based check so common mangled variants emitted by
  // small models (e.g. `<<EEDS_HUMAN>>>`, `<<<HUMAN>>>`) still trigger
  // the handoff rather than leaking to the customer verbatim.
  if (looksLikeHandoffToken(raw)) {
    return { kind: "handoff", reason: "ai-uncertain" };
  }

  const body = cleanReply(raw);
  if (!body) return { kind: "handoff", reason: "ai-empty" };

  return { kind: "reply", body, source: provider };
};

// Exported for unit tests.
export const __internals = {
  NEEDS_HUMAN_TOKEN,
  HANDOFF_TOKEN_REGEX,
  looksLikeHandoffToken,
  ADMIN_COOLDOWN_MS,
  DEFAULT_PERSONA,
  HANDOFF_ACK_VARIANTS,
  GREETING_HANDOFF_ACK_VARIANTS,
  FAQ_PREAMBLE_VARIANTS,
  containsHandoffPhrase,
  findFaqMatch,
  buildSystemPrompt,
  buildConversation,
  cleanReply,
  sanitizeCustomerName,
  firstName,
  pickHandoffAck,
  pickGreetingHandoffAck,
  pickFaqPreamble,
  isAiEnabled,
  lastAdminAt,
};
