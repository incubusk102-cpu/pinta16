import { wrapHandler } from "./_lib/handler-wrapper.js";

const jsonHeaders = {
  "Content-Type": "application/json",
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

const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { paymentIntentId } = parseBody(event.body);

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "Invalid payment intent ID" }),
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
      console.error("PayMongo status error:", detail);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "Status check failed", detail }),
      };
    }

    const result = await response.json();
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify(result.data),
    };
  } catch (error) {
    console.error("check-payment error:", error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

export const onRequest = wrapHandler(handler);
