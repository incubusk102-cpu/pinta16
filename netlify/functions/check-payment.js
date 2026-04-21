export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { paymentIntentId } = JSON.parse(event.body || "{}");

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid source ID" }),
      };
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Payment not configured" }),
      };
    }

    const authHeader = `Basic ${Buffer.from(secretKey + ":").toString("base64")}`;

    const response = await fetch(
      `https://api.paymongo.com/v1/sources/${paymentIntentId}`,
      {
        method: "GET",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("PayMongo status error:", errorData);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Status check failed" }),
      };
    }

    const result = await response.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    };
  } catch (err) {
    console.error("check-payment error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
