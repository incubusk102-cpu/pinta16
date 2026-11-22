import { wrapHandler } from "./_lib/handler-wrapper.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { logError } from "./_lib/redact.js";

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const buildAuthHeader = (secretKey) =>
  `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

// PayMongo secret keys are always `sk_<env>_<random>`. Reject anything
// that doesn't match so a misconfigured publishable key (`pk_…`) can't
// silently 401 every status poll in production.
const getPaymongoSecret = () => {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key || !key.startsWith("sk_")) return null;
  return key;
};

const readPayMongoError = async (response) => {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    const message = payload?.errors
      ?.map((error) => error?.detail || error?.code)
      .filter(Boolean)
      .join("; ");
    return message || text;
  } catch {
    return text;
  }
};

const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: withSecurityHeaders(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Throttle status polls. The checkout page polls this every few
  // seconds while waiting for QR-Ph confirmation, so we allow ~30 /
  // minute / IP — well above the real polling rate but enough to
  // dampen scripted abuse.
  const limit = await consumeRateLimit(event, {
    bucket: "check-payment",
    windowMs: 60_000,
    max: 30,
  });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

  try {
    const { paymentIntentId } = parseBody(event.body);

    if (
      !paymentIntentId ||
      typeof paymentIntentId !== "string" ||
      paymentIntentId.length > 100 ||
      !/^[a-zA-Z0-9_-]+$/.test(paymentIntentId)
    ) {
      return {
        statusCode: 400,
        headers: withSecurityHeaders(),
        body: JSON.stringify({ error: "Invalid payment intent ID" }),
      };
    }

    const secretKey = getPaymongoSecret();
    if (!secretKey) {
      return {
        statusCode: 500,
        headers: withSecurityHeaders(),
        body: JSON.stringify({ error: "Payment not configured" }),
      };
    }

    const response = await fetch(
      `https://api.paymongo.com/v1/payment_intents/${paymentIntentId}`,
      {
        method: "GET",
        headers: {
          Authorization: buildAuthHeader(secretKey),
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const detail = await readPayMongoError(response);
      logError("PayMongo status error:", detail);
      return {
        statusCode: 500,
        headers: withSecurityHeaders(),
        body: JSON.stringify({ error: "Status check failed" }),
      };
    }

    const result = await response.json();
    return {
      statusCode: 200,
      headers: withSecurityHeaders(),
      body: JSON.stringify(result.data),
    };
  } catch (error) {
    logError("check-payment error:", error);
    return {
      statusCode: 500,
      headers: withSecurityHeaders(),
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

export const onRequest = wrapHandler(handler);
