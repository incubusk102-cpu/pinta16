// Cloudflare Turnstile server-side verifier.
//
// Used by public-facing POST endpoints that submit a Turnstile token in the
// request body so we can confirm the request came from a real browser before
// taking action. Token verification happens against Cloudflare's siteverify
// endpoint; the widget itself is rendered client-side via `Turnstile.tsx`.
//
// Graceful fallback: when `TURNSTILE_SECRET_KEY` is not configured (which is
// the default in local dev and on freshly deployed Pages projects), this
// helper returns `{ allowed: true, skipped: true }` so the rest of the
// handler proceeds normally. That keeps the integration safe to ship before
// the dashboard widget is created.

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const getClientIp = (event) => {
  const headers = event?.headers || {};
  const cfip = headers["cf-connecting-ip"];
  if (cfip) return cfip;
  const xff = headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return "";
};

export const verifyTurnstileToken = async (event, { token } = {}) => {
  const secret = (process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) {
    return { allowed: true, skipped: true };
  }
  if (typeof token !== "string" || token.length === 0) {
    return { allowed: false, reason: "missing-token" };
  }

  try {
    const params = new URLSearchParams();
    params.set("secret", secret);
    params.set("response", token);
    const remoteip = getClientIp(event);
    if (remoteip) params.set("remoteip", remoteip);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: params,
    });
    if (!res.ok) {
      // siteverify itself failed — fail open rather than blocking real users
      // when Cloudflare's edge has a hiccup. The rate limiter is still in
      // front of these endpoints, so abuse is bounded.
      return { allowed: true, skipped: true, reason: "siteverify-error" };
    }
    const data = await res.json();
    if (data?.success) return { allowed: true };
    return {
      allowed: false,
      reason: Array.isArray(data?.["error-codes"])
        ? data["error-codes"].join(",")
        : "invalid-token",
    };
  } catch {
    return { allowed: true, skipped: true, reason: "siteverify-exception" };
  }
};

// Build a uniform 400 response for failed verification.
export const turnstileFailureResponse = (reason) => ({
  statusCode: 400,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    error: "Verification failed. Please refresh the page and try again.",
    reason,
  }),
});
