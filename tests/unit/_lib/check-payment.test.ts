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

vi.mock("../../../functions/api/_lib/redact.js", () => ({
  logError: vi.fn(),
}));

// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import { onRequest } from "../../../functions/api/check-payment.js";
import { consumeRateLimit } from "../../../functions/api/_lib/rate-limit.js";

const mockedConsumeRateLimit = vi.mocked(consumeRateLimit);

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

describe("check-payment handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    mockedConsumeRateLimit.mockResolvedValue({
      allowed: true,
      retryAfter: 0,
      remaining: 29,
      count: 1,
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
      count: 30,
    });

    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ paymentIntentId: "pi_test_123" }),
      }),
    );
    expect(result.statusCode).toBe(429);
  });

  it("returns 400 for missing paymentIntentId", async () => {
    const result = await onRequest(makeEvent({ body: JSON.stringify({}) }));
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe("Invalid payment intent ID");
  });

  it("returns 400 for paymentIntentId that is too long", async () => {
    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ paymentIntentId: "a".repeat(101) }),
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe("Invalid payment intent ID");
  });

  it("returns 400 for paymentIntentId with bad characters", async () => {
    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ paymentIntentId: "../hack" }),
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(parse(result).error).toBe("Invalid payment intent ID");
  });

  it("returns 500 when PAYMONGO_SECRET_KEY is missing", async () => {
    delete process.env.PAYMONGO_SECRET_KEY;

    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ paymentIntentId: "pi_test_123" }),
      }),
    );
    expect(result.statusCode).toBe(500);
    expect(parse(result).error).toBe("Payment not configured");
  });

  it("returns 200 with payment data on successful status check", async () => {
    const paymentData = {
      data: {
        id: "pi_test_123",
        attributes: {
          status: "succeeded",
          amount: 50000,
          currency: "PHP",
        },
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(paymentData),
    });

    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ paymentIntentId: "pi_test_123" }),
      }),
    );

    expect(result.statusCode).toBe(200);

    const body = parse(result);
    expect(body.id).toBe("pi_test_123");
    expect(body.attributes.status).toBe("succeeded");

    // Verify correct PayMongo URL.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://api.paymongo.com/v1/payment_intents/pi_test_123");

    // Verify GET method.
    const options = fetchMock.mock.calls[0][1] as { method: string };
    expect(options.method).toBe("GET");

    // Verify auth header.
    const authHeader = (
      fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    )[1].headers.Authorization;
    const expectedAuth = `Basic ${Buffer.from("sk_test_abc123:").toString("base64")}`;
    expect(authHeader).toBe(expectedAuth);
  });

  it("returns 500 when PayMongo returns an error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            errors: [{ detail: "Resource not found" }],
          }),
        ),
    });

    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ paymentIntentId: "pi_test_123" }),
      }),
    );
    expect(result.statusCode).toBe(500);
    expect(parse(result).error).toBe("Status check failed");
  });

  it("returns 500 on network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));

    const result = await onRequest(
      makeEvent({
        body: JSON.stringify({ paymentIntentId: "pi_test_123" }),
      }),
    );
    expect(result.statusCode).toBe(500);
    expect(parse(result).error).toBe("Internal server error");
  });
});
