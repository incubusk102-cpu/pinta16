import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the handler.
vi.mock("../../../functions/api/_lib/handler-wrapper.js", () => ({
  wrapHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("../../../functions/api/_lib/rate-limit.js", () => ({
  consumeRateLimit: vi.fn(),
  rateLimitResponse: vi.fn((retryAfter: number) => ({
    statusCode: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(1, Math.ceil(retryAfter))),
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify({
      error: `Too many requests. Try again in ${Math.ceil(retryAfter)}s.`,
    }),
  })),
}));

vi.mock("../../../functions/api/_lib/turnstile.js", () => ({
  verifyTurnstileToken: vi.fn(),
  turnstileFailureResponse: vi.fn((reason: string) => ({
    statusCode: 400,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Verification failed. Please refresh the page and try again.",
      reason,
    }),
  })),
}));

vi.mock("../../../functions/api/_lib/redact.js", () => ({
  logError: vi.fn(),
}));

// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import { onRequest } from "../../../functions/api/create-payment.js";
import { consumeRateLimit } from "../../../functions/api/_lib/rate-limit.js";
import { verifyTurnstileToken } from "../../../functions/api/_lib/turnstile.js";

const mockedConsumeRateLimit = vi.mocked(consumeRateLimit);
const mockedVerifyTurnstileToken = vi.mocked(verifyTurnstileToken);

const makeEvent = (
  overrides: Partial<{
    httpMethod: string;
    body: string;
    headers: Record<string, string>;
  }> = {},
) => ({
  httpMethod: overrides.httpMethod ?? "POST",
  body: overrides.body ?? "{}",
  headers: overrides.headers ?? { "content-type": "application/json" },
});

const parse = (result: { body: string }) => JSON.parse(result.body);

/** Valid PayMongo-style responses for the 3-call happy path. */
const payMongoIntentResponse = {
  data: {
    id: "pi_test_123",
    attributes: { status: "awaiting_payment_method" },
  },
};

const payMongoMethodResponse = {
  data: { id: "pm_test_456", attributes: { type: "qrph" } },
};

const payMongoAttachResponse = {
  data: {
    id: "pi_test_123",
    attributes: {
      status: "awaiting_next_action",
      next_action: {
        code: { image_url: "https://qr.paymongo.com/test.png" },
      },
    },
  },
};

describe("create-payment handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Default: rate limit allows, turnstile allows.
    mockedConsumeRateLimit.mockResolvedValue({
      allowed: true,
      retryAfter: 0,
      remaining: 5,
      count: 1,
    });
    mockedVerifyTurnstileToken.mockResolvedValue({
      allowed: true,
      skipped: true,
    });

    process.env.PAYMONGO_SECRET_KEY = "sk_test_abc123";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("rejects non-POST methods with 405", async () => {
    const result = await onRequest(makeEvent({ httpMethod: "GET" }));
    expect(result.statusCode).toBe(405);
    expect(parse(result).error).toBe("Method not allowed");
  });

  it("returns 429 when rate-limited", async () => {
    mockedConsumeRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 30,
      remaining: 0,
      count: 6,
    });

    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: 100 }) }),
    );
    expect(result.statusCode).toBe(429);
  });

  it("returns 400 on turnstile rejection", async () => {
    mockedVerifyTurnstileToken.mockResolvedValue({
      allowed: false,
      reason: "invalid-token",
    });

    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ amount: 100, turnstileToken: "bad" }),
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toContain("Verification failed");
  });

  it("returns 400 for missing amount", async () => {
    const result = await onRequest(makeEvent({ body: JSON.stringify({}) }));
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe("Invalid amount");
  });

  it("returns 400 for negative amount", async () => {
    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: -100 }) }),
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe("Invalid amount");
  });

  it("returns 400 for amount exceeding max", async () => {
    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: 1_000_001 }) }),
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe("Invalid amount");
  });

  it("returns 400 for amount below minimum (< 20 PHP)", async () => {
    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: 15 }) }),
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe("Minimum amount is \u20b120");
  });

  it("returns 500 when PAYMONGO_SECRET_KEY is missing", async () => {
    delete process.env.PAYMONGO_SECRET_KEY;

    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: 100 }) }),
    );
    expect(result.statusCode).toBe(500);
    expect(parse(result).error).toBe("Payment not configured");
  });

  it("returns 500 when PAYMONGO_SECRET_KEY does not start with sk_", async () => {
    process.env.PAYMONGO_SECRET_KEY = "pk_test_wrong";

    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: 100 }) }),
    );
    expect(result.statusCode).toBe(500);
    expect(parse(result).error).toContain(
      "PAYMONGO_SECRET_KEY must be a secret key",
    );
  });

  it("returns 200 with payment data on successful flow", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(payMongoIntentResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(payMongoMethodResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(payMongoAttachResponse),
      });

    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({
          amount: 500,
          description: "Test Art",
          customer: { fullName: "Juan Cruz", email: "juan@test.com" },
        }),
      }),
    );

    expect(result.statusCode).toBe(200);

    const body = parse(result);
    expect(body.id).toBe("pi_test_123");
    expect(body.attributes).toBeDefined();
    expect(body.qrCodeImageUrl).toBe("https://qr.paymongo.com/test.png");
    expect(body.paymentMethodId).toBe("pm_test_456");

    // Verify 3 PayMongo API calls were made.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Verify correct PayMongo URLs.
    const urls = fetchMock.mock.calls.map(
      (call: [string, ...unknown[]]) => call[0],
    );
    expect(urls[0]).toBe("https://api.paymongo.com/v1/payment_intents");
    expect(urls[1]).toBe("https://api.paymongo.com/v1/payment_methods");
    expect(urls[2]).toContain(
      "https://api.paymongo.com/v1/payment_intents/pi_test_123/attach",
    );

    // Verify auth header uses Base64-encoded secret key.
    const authHeader = (
      fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    )[1].headers.Authorization;
    const expectedAuth = `Basic ${Buffer.from("sk_test_abc123:").toString("base64")}`;
    expect(authHeader).toBe(expectedAuth);
  });

  it("returns 500 on PayMongo API failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            errors: [{ detail: "Insufficient funds" }],
          }),
        ),
    });

    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: 100 }) }),
    );
    expect(result.statusCode).toBe(500);
    expect(parse(result).error).toBe(
      "Payment creation failed. Please try again.",
    );
  });

  it("returns 500 on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    const result = await onRequest(
      makeEvent({ body: JSON.stringify({ amount: 100 }) }),
    );
    expect(result.statusCode).toBe(500);
    expect(parse(result).error).toBe(
      "Payment creation failed. Please try again.",
    );
  });
});
