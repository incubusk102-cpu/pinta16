import { wrapHandler } from "./_lib/handler-wrapper.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { logError } from "./_lib/redact.js";

const jsonHeaders = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
};

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

const payMongoRequest = async (path, secretKey, body, method = "POST") => {
  const response = await fetch(`https://api.paymongo.com${path}`, {
    method,
    headers: {
      Authorization: buildAuthHeader(secretKey),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await readPayMongoError(response));
  }

  return response.json();
};

const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Rate-limit payment intent creation per IP. PayMongo bills per
  // request and abusing this endpoint can rack up fees and noise. 6
  // intents / minute is well above any real checkout retry pattern.
  const limit = await consumeRateLimit(event, {
    bucket: "create-payment",
    windowMs: 60_000,
    max: 6,
  });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);

  try {
    const { amount, description, customer } = parseBody(event.body);

    if (
      !amount ||
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1_000_000
    ) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "Invalid amount" }),
      };
    }

    const amountInCentavos = Math.round(amount * 100);
    if (amountInCentavos < 2000) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "Minimum amount is \u20b120" }),
      };
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim();
    if (!secretKey) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "Payment not configured" }),
      };
    }

    if (!secretKey.startsWith("sk_")) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({
          error: "PAYMONGO_SECRET_KEY must be a secret key starting with sk_",
        }),
      };
    }

    const paymentIntent = await payMongoRequest(
      "/v1/payment_intents",
      secretKey,
      {
        data: {
          attributes: {
            amount: amountInCentavos,
            currency: "PHP",
            capture_type: "automatic",
            payment_method_allowed: ["qrph"],
            description: description || "Canvas Hub Art Purchase",
          },
        },
      },
    );

    const paymentMethod = await payMongoRequest(
      "/v1/payment_methods",
      secretKey,
      {
        data: {
          attributes: {
            type: "qrph",
            billing: {
              name: customer?.fullName || "Canvas Hub Customer",
              email: customer?.email || "support@canvhub.com",
              phone: customer?.phone || undefined,
              address: {
                line1: customer?.address || undefined,
                city: customer?.city || undefined,
                country: "PH",
              },
            },
          },
        },
      },
    );

    const attachedIntent = await payMongoRequest(
      `/v1/payment_intents/${paymentIntent.data.id}/attach`,
      secretKey,
      {
        data: {
          attributes: {
            payment_method: paymentMethod.data.id,
          },
        },
      },
    );

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        id: attachedIntent.data.id,
        attributes: attachedIntent.data.attributes,
        qrCodeImageUrl:
          attachedIntent.data.attributes?.next_action?.code?.image_url || null,
        paymentMethodId: paymentMethod.data.id,
      }),
    };
  } catch (error) {
    logError("create-payment error:", error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: "Payment creation failed. Please try again.",
      }),
    };
  }
};

export const onRequest = wrapHandler(handler);
