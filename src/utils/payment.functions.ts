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
}

export async function createPayment({ data }: { data: CreatePaymentData }) {
  const res = await fetch("/api/create-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload.detail || payload.error || "Status check failed");
  }

  return payload;
}
