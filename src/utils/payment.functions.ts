export async function createPayment({ data }: { data: { amount: number; description?: string } }) {
  const res = await fetch("/api/create-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Payment creation failed");
  }

  return res.json();
}

export async function checkPaymentStatus({ data }: { data: { paymentIntentId: string } }) {
  const res = await fetch("/api/check-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Status check failed");
  }

  return res.json();
}
