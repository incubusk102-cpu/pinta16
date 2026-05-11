import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  generateAutoReply,
  __internals,
} from "../../../functions/api/_lib/chat-ai.js";

const FAQS = [
  {
    id: "shipping",
    question: "Shipping & delivery",
    answer: "We deliver via Lalamove within 2-3 days.",
  },
  {
    id: "returns",
    question: "Returns & refunds",
    answer: "Email us within 48 hours with photo evidence.",
  },
  {
    id: "payment",
    question: "Payment methods",
    answer: "GCash, Maya, bank transfer, cards.",
  },
];

const baseThread = (msgs: { from: string; body: string; at?: string }[]) => ({
  id: "thread-1",
  name: "Test Buyer",
  email: "buyer@example.com",
  createdAt: "2024-01-01T00:00:00.000Z",
  messages: msgs.map((m, i) => ({
    at: m.at || `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
    from: m.from,
    body: m.body,
  })),
});

describe("chat-ai internals", () => {
  describe("containsHandoffPhrase", () => {
    it("matches default handoff words case-insensitively", () => {
      expect(
        __internals.containsHandoffPhrase("Can I speak to a HUMAN?", []),
      ).toBe(true);
      expect(
        __internals.containsHandoffPhrase("Please talk to someone there", []),
      ).toBe(true);
      expect(
        __internals.containsHandoffPhrase("How much for shipping?", []),
      ).toBe(false);
    });

    it("respects word boundaries on single-word keywords", () => {
      // "humanitarian" should not trip the "human" keyword.
      expect(
        __internals.containsHandoffPhrase("I love humanitarian work", []),
      ).toBe(false);
    });

    it("honours admin-configured extra keywords", () => {
      expect(
        __internals.containsHandoffPhrase("This is super urgent please", [
          "urgent",
        ]),
      ).toBe(true);
    });

    it("ignores keywords shorter than 3 characters", () => {
      // Otherwise common stop-word noise would constantly escalate.
      expect(__internals.containsHandoffPhrase("ok", ["ok"])).toBe(false);
    });
  });

  describe("findFaqMatch", () => {
    it("returns the matching FAQ when query overlaps clearly", () => {
      const match = __internals.findFaqMatch(
        "How does your shipping delivery work?",
        FAQS,
      );
      expect(match?.id).toBe("shipping");
    });

    it("returns null when matches are too weak", () => {
      // "How much" hits zero FAQ keywords.
      expect(__internals.findFaqMatch("How much", FAQS)).toBeNull();
    });

    it("returns null when two FAQs tie on a single keyword", () => {
      // Both "returns" and "payment" each hit one of their question
      // tokens, so the margin requirement rejects the ambiguous match.
      const close = __internals.findFaqMatch("returns payment", FAQS);
      // It would still match on 1 token each — should return null
      // since the margin requirement (best - runner-up >= 1) is not met
      // AND score < 2.
      expect(close).toBeNull();
    });
  });

  describe("lastAdminAt", () => {
    it("returns 0 when no admin messages exist", () => {
      const t = baseThread([{ from: "customer", body: "hi" }]);
      expect(__internals.lastAdminAt(t.messages)).toBe(0);
    });

    it("returns the latest admin timestamp", () => {
      const t = baseThread([
        { from: "customer", body: "hi", at: "2024-01-01T00:00:00.000Z" },
        { from: "admin", body: "hello", at: "2024-01-01T00:01:00.000Z" },
        { from: "customer", body: "ok", at: "2024-01-01T00:02:00.000Z" },
        { from: "admin", body: "anything?", at: "2024-01-01T00:03:00.000Z" },
      ]);
      expect(__internals.lastAdminAt(t.messages)).toBe(
        Date.parse("2024-01-01T00:03:00.000Z"),
      );
    });
  });

  describe("buildSystemPrompt", () => {
    it("includes FAQ section + product list when provided", () => {
      const prompt = __internals.buildSystemPrompt({
        chatConfig: { faqs: FAQS },
        products: [
          { title: "Test Painting", size: "12x16", price: 1500, stock: 1 },
        ],
        brandName: "Canvas Hub",
      });
      expect(prompt).toContain("Shop FAQ:");
      expect(prompt).toContain("Test Painting");
      expect(prompt).toContain(__internals.NEEDS_HUMAN_TOKEN);
    });

    it("honours a custom system-prompt override", () => {
      const prompt = __internals.buildSystemPrompt({
        chatConfig: { faqs: [], ai: { systemPrompt: "Custom preamble." } },
        products: [],
      });
      expect(prompt.startsWith("Custom preamble.")).toBe(true);
    });
  });

  describe("cleanReply", () => {
    it("strips assistant role-play prefixes", () => {
      expect(__internals.cleanReply("Assistant: hello there")).toBe(
        "hello there",
      );
    });

    it("returns empty string when handoff token is present", () => {
      expect(
        __internals.cleanReply("sorry " + __internals.NEEDS_HUMAN_TOKEN),
      ).toBe("");
    });
  });
});

describe("generateAutoReply", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const env = { GROQ_API_KEY: "test-key" };
  const baseConfig = { ai: { enabled: true }, faqs: FAQS };

  it("skips when AI is disabled", async () => {
    const thread = baseThread([{ from: "customer", body: "shipping?" }]);
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "shipping?",
      chatConfig: { ai: { enabled: false }, faqs: FAQS },
      products: [],
    });
    expect(out.kind).toBe("skip");
    expect(out.reason).toBe("ai-disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips on a closed thread", async () => {
    const thread = {
      ...baseThread([{ from: "customer", body: "shipping?" }]),
      closedAt: "2024-01-02T00:00:00.000Z",
    };
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "shipping?",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("skip");
    expect(out.reason).toBe("thread-closed");
  });

  it("skips when admin replied within the cooldown window", async () => {
    const recentAdminAt = new Date(Date.now() - 60_000).toISOString();
    const thread = baseThread([
      { from: "customer", body: "hi", at: "2024-01-01T00:00:00.000Z" },
      { from: "admin", body: "hi back", at: recentAdminAt },
      { from: "customer", body: "shipping?" },
    ]);
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "shipping?",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("skip");
    expect(out.reason).toBe("admin-cooldown");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands off when the customer explicitly asks for a human", async () => {
    const thread = baseThread([
      { from: "customer", body: "I want to speak to a real person please" },
    ]);
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "I want to speak to a real person please",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("handoff");
    expect(out.reason).toBe("customer-requested-human");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a FAQ-sourced reply without calling Groq when one matches", async () => {
    const thread = baseThread([
      { from: "customer", body: "How does your shipping delivery work?" },
    ]);
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "How does your shipping delivery work?",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("reply");
    expect(out.source).toBe("faq");
    expect(out.body).toContain("Lalamove");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when AI is enabled but no Groq key is configured", async () => {
    const thread = baseThread([{ from: "customer", body: "random question" }]);
    const out = await generateAutoReply({
      env: {},
      thread,
      customerMessage: "random question",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("skip");
    expect(out.reason).toBe("no-groq-key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts GROQ_TOKEN as a fallback for GROQ_API_KEY", async () => {
    // canvhub's Cloudflare Pages env uses `GROQ_TOKEN`, not
    // `GROQ_API_KEY`. The helper should accept either name and send the
    // value through unchanged as the bearer token.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            { message: { content: "Sure, all paintings are originals." } },
          ],
        };
      },
    });
    const thread = baseThread([
      { from: "customer", body: "are these paintings originals?" },
    ]);
    const out = await generateAutoReply({
      env: { GROQ_TOKEN: "token-from-pages" },
      thread,
      customerMessage: "are these paintings originals?",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("reply");
    expect(out.source).toBe("groq");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(
      (init as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer token-from-pages");
  });

  it("prefers GROQ_API_KEY over GROQ_TOKEN when both are present", async () => {
    // If an admin sets both for any reason, the explicit API_KEY name
    // wins — mirrors how Groq's own SDK documents the variable.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: "Hi there!" } }] };
      },
    });
    const thread = baseThread([{ from: "customer", body: "hi" }]);
    await generateAutoReply({
      env: { GROQ_API_KEY: "primary-key", GROQ_TOKEN: "fallback-key" },
      thread,
      customerMessage: "random non-faq question",
      chatConfig: baseConfig,
      products: [],
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(
      (init as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer primary-key");
  });

  it("calls Groq and returns the model reply when no FAQ matches", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: "Sure! Each painting is hand-signed by the artist.",
              },
            },
          ],
        };
      },
    });

    const thread = baseThread([
      { from: "customer", body: "are your paintings hand-signed?" },
    ]);
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "are your paintings hand-signed?",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("reply");
    expect(out.source).toBe("groq");
    expect(out.body).toContain("hand-signed");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(
      (init as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer test-key");
  });

  it("hands off when the model emits the handoff token", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content: __internals.NEEDS_HUMAN_TOKEN } }],
        };
      },
    });

    const thread = baseThread([
      { from: "customer", body: "What's the status of order #1234?" },
    ]);
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "What's the status of order #1234?",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("handoff");
    expect(out.reason).toBe("ai-uncertain");
  });

  it("silently skips when Groq returns an HTTP error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      async text() {
        return "boom";
      },
    });
    const thread = baseThread([
      { from: "customer", body: "random non-FAQ question" },
    ]);
    const out = await generateAutoReply({
      env,
      thread,
      customerMessage: "random non-FAQ question",
      chatConfig: baseConfig,
      products: [],
    });
    expect(out.kind).toBe("skip");
    expect(out.reason).toBe("groq-error");
  });
});
