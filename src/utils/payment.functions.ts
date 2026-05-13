import { jsonAuthHeaders } from "@/lib/api";

interface CreatePaymentData {
  amount: number;
  description?: string;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
  };
  // Cloudflare Turnstile token captured by the widget in CheckoutForm.
  // Forwarded to /api/create-payment so the server can reject bot
  // submissions before the PayMongo payment-intent is created.
  // Optional: when Turnstile is not configured (`VITE_TURNSTILE_SITE_KEY`
  // unset) the widget never renders and the server falls open.
  turnstileToken?: string | null;
}

export async function createPayment({ data }: { data: CreatePaymentData }) {
  const res = await fetch("/api/create-payment", {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify(data),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      payload.detail || payload.error || "Payment creation failed",
    );
  }

  return payload;
}

export async function checkPaymentStatus({
  data,
}: {
  data: { paymentIntentId: string };
}) {
  const res = await fetch("/api/check-payment", {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify(data),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload.detail || payload.error || "Status check failed");
  }

  return payload;
}
