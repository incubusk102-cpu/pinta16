export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { amount, description } = JSON.parse(event.body || "{}");

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid amount" }),
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
    const amountInCentavos = Math.round(amount * 100);

    const siteUrl =
      process.env.URL ||
      process.env.DEPLOY_URL ||
      "https://pintaterra.netlify.app";

    const sourceRes = await fetch("https://api.paymongo.com/v1/sources", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountInCentavos,
            redirect: {
              success: `${siteUrl}?payment=success`,
              failed: `${siteUrl}?payment=failed`,
            },
            type: "qrph",
            currency: "PHP",
            description: description || "Pintaterra Art Purchase",
          },
        },
      }),
    });

    if (!sourceRes.ok) {
      const errorData = await sourceRes.text();
      console.error("PayMongo Source error:", errorData);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Payment creation failed", detail: errorData }),
      };
    }

    const sourceResult = await sourceRes.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sourceResult.data),
    };
  } catch (err) {
    console.error("create-payment error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
