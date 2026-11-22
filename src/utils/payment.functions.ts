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

// Hard-cap how long each PayMongo round-trip is allowed to take on the
// client side. The Workers runtime gives us roughly 30 s of wall-clock
// per request before Cloudflare itself aborts, so anything past ~30 s
// is already lost — we just want the client to surface that loss as a
// user-friendly retry prompt instead of leaving the button stuck on
// "Generating QR Code…" forever. Status checks are quicker on the
// server, so they get a tighter ceiling.
const CREATE_PAYMENT_TIMEOUT_MS = 30_000;
const CHECK_PAYMENT_TIMEOUT_MS = 10_000;

// Custom error class so callers can distinguish a client-side timeout
// from a server error and reset their loading state cleanly.
export class PaymentTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentTimeoutError";
  }
}

const createTimeoutSignal = (
  ms: number,
): { signal: AbortSignal; cleanup: () => void } => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

export async function createPayment({ data }: { data: CreatePaymentData }) {
  const { signal, cleanup } = createTimeoutSignal(CREATE_PAYMENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/create-payment", {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(data),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new PaymentTimeoutError(
        "Payment is taking longer than expected. Please check your connection and try again.",
      );
    }
    throw error;
  } finally {
    cleanup();
  }

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
  const { signal, cleanup } = createTimeoutSignal(CHECK_PAYMENT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/check-payment", {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(data),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new PaymentTimeoutError(
        "Status check timed out. We'll retry automatically — or tap Check Now.",
      );
    }
    throw error;
  } finally {
    cleanup();
  }

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload.detail || payload.error || "Status check failed");
  }

  return payload;
}
