// /api/admin/chat-ai-status — read-only diagnostic for the chat AI
// auto-reply pipeline.
//
// Returns the worker's exact view of:
//   - chat.ai.enabled persisted in STOREFRONT_CONFIG KV
//   - whether GROQ_API_KEY / GROQ_TOKEN env vars are bound and non-empty
//   - length of each token (raw and trimmed) so we can detect stray
//     whitespace without ever echoing the value itself
//   - prefix of the resolved key (e.g. "gsk_") so an operator can sanity-
//     check it was pasted correctly
//   - the result of a live, non-streaming Groq /models GET probe using
//     the resolved key — i.e. does the key actually authenticate against
//     Groq right now from this Pages Function
//
// The endpoint never echoes the secret value. Length, prefix, and the
// Groq probe result are all that's exposed. Auth is the same admin
// session cookie used by every other /api/admin/* endpoint; anonymous
// callers get 401.
//
// GET ?action=status (default) — return the JSON described above.
//
// Read-only by design: no KV writes, no Groq mutations. Safe to call
// repeatedly; the Groq /models probe is a cheap, free-tier-friendly
// auth check.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";

const CONFIG_KEY = "config";
const GROQ_MODELS_ENDPOINT = "https://api.groq.com/openai/v1/models";
const GROQ_PROBE_TIMEOUT_MS = 4000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });

const requireAdmin = async (request) => {
  const headers = Object.fromEntries(request.headers.entries());
  const ok = await isAuthenticated({ headers });
  return ok ? null : json(401, { error: "Not authenticated" });
};

const inspectToken = (raw) => {
  if (typeof raw !== "string") {
    return {
      present: false,
      raw_length: 0,
      trimmed_length: 0,
      has_whitespace_padding: false,
    };
  }
  const trimmed = raw.trim();
  return {
    present: raw.length > 0,
    raw_length: raw.length,
    trimmed_length: trimmed.length,
    has_whitespace_padding: raw.length !== trimmed.length,
  };
};

const tokenPrefix = (raw) => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // First 4 chars only — enough to confirm "gsk_" without revealing
  // anything meaningful from the secret payload itself.
  return trimmed.slice(0, 4);
};

const readStorefrontChatAi = async (env) => {
  if (!env?.STOREFRONT_CONFIG) {
    return {
      kv_binding_present: false,
      ai_enabled: null,
      ai_model: null,
      handoff_keywords_count: 0,
      system_prompt_length: 0,
      faq_count: 0,
      chat_widget_enabled: null,
    };
  }
  let raw = null;
  try {
    raw = await env.STOREFRONT_CONFIG.get(CONFIG_KEY, { type: "json" });
  } catch {
    return {
      kv_binding_present: true,
      kv_read_error: true,
      ai_enabled: null,
      ai_model: null,
      handoff_keywords_count: 0,
      system_prompt_length: 0,
      faq_count: 0,
      chat_widget_enabled: null,
    };
  }
  const chat = raw && typeof raw === "object" ? raw.chat || {} : {};
  const ai = chat && typeof chat === "object" ? chat.ai || {} : {};
  const faqs = Array.isArray(chat?.faqs) ? chat.faqs : [];
  const keywords = Array.isArray(ai?.handoffKeywords) ? ai.handoffKeywords : [];
  return {
    kv_binding_present: true,
    kv_read_error: false,
    ai_enabled: ai?.enabled === true,
    ai_model: typeof ai?.model === "string" ? ai.model : null,
    handoff_keywords_count: keywords.length,
    system_prompt_length:
      typeof ai?.systemPrompt === "string" ? ai.systemPrompt.length : 0,
    faq_count: faqs.length,
    chat_widget_enabled: chat?.enabled === true,
  };
};

const probeGroq = async (apiKey) => {
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return { attempted: false, reason: "no-key" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GROQ_PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  let status = null;
  let ok = false;
  let errorMessage = null;
  let modelsCount = null;
  try {
    const resp = await fetch(GROQ_MODELS_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    status = resp.status;
    ok = resp.ok;
    if (resp.ok) {
      try {
        const body = await resp.json();
        if (body && Array.isArray(body.data)) {
          modelsCount = body.data.length;
        }
      } catch {
        // ignore body parse failure; status alone is the signal
      }
    } else {
      // Capture the error message text but cap it so we never echo a
      // full Groq response back to the admin (defence in depth).
      try {
        const text = await resp.text();
        errorMessage = text.slice(0, 240);
      } catch {
        errorMessage = `HTTP ${resp.status}`;
      }
    }
  } catch (err) {
    errorMessage =
      err?.name === "AbortError"
        ? `timeout after ${GROQ_PROBE_TIMEOUT_MS}ms`
        : err?.message || String(err);
  } finally {
    clearTimeout(timer);
  }
  return {
    attempted: true,
    ok,
    status,
    duration_ms: Date.now() - startedAt,
    models_count: modelsCount,
    error: errorMessage,
  };
};

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";
  if (action !== "status") {
    return json(400, { error: `Unknown action: ${action}` });
  }

  const groqApiKey = inspectToken(env?.GROQ_API_KEY);
  const groqToken = inspectToken(env?.GROQ_TOKEN);

  // Same precedence the chat-ai code uses: GROQ_API_KEY wins, else
  // GROQ_TOKEN. The probe runs against whichever key the production
  // path would actually use.
  const resolvedRaw =
    (typeof env?.GROQ_API_KEY === "string" && env.GROQ_API_KEY) ||
    (typeof env?.GROQ_TOKEN === "string" && env.GROQ_TOKEN) ||
    "";
  const resolvedKey = {
    source:
      typeof env?.GROQ_API_KEY === "string" && env.GROQ_API_KEY
        ? "GROQ_API_KEY"
        : typeof env?.GROQ_TOKEN === "string" && env.GROQ_TOKEN
          ? "GROQ_TOKEN"
          : null,
    prefix: tokenPrefix(resolvedRaw),
    trimmed_length: resolvedRaw.trim().length,
  };

  const storefront = await readStorefrontChatAi(env);
  const groqProbe = await probeGroq(resolvedRaw);

  return json(200, {
    ok: true,
    timestamp: new Date().toISOString(),
    storefront_config: storefront,
    env: {
      groq_api_key: groqApiKey,
      groq_token: groqToken,
      resolved: resolvedKey,
    },
    groq_probe: groqProbe,
  });
};
