// /api/admin/tiktok-callback — OAuth redirect target.
//
// TikTok redirects the admin's browser here after they authorise the
// app. We validate the `state` (CSRF gate), exchange the `code` for
// an access + refresh token pair, persist it to KV, and bounce the
// admin back to /admin?tiktok=connected.
//
// On failure we redirect back with ?tiktok=failed&reason=... so the
// admin UI can render an inline error toast.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { exchangeAuthCode } from "../_lib/tiktok.js";
import { makeStore } from "../_lib/kv-store.js";

// We stash the random state token at this KV key inside
// STOREFRONT_CONFIG so the callback can confirm the redirect was
// actually initiated by an authed admin session.
const TIKTOK_OAUTH_STATE_KEY = "tiktok_oauth_state";

const redirect = (origin, params) => {
  const target = new URL("/admin", origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null) target.searchParams.set(k, String(v));
  }
  target.searchParams.set("section", "tiktok");
  return Response.redirect(target.toString(), 302);
};

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  // The admin must still be logged in when TikTok bounces back —
  // otherwise an attacker could trigger the flow with a victim's
  // session-less browser.
  const headers = Object.fromEntries(request.headers.entries());
  const authed = await isAuthenticated({ headers });
  if (!authed) {
    return redirect(origin, {
      tiktok: "failed",
      reason: "not-authenticated",
    });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const tiktokError = url.searchParams.get("error");
  const tiktokErrorDescription = url.searchParams.get("error_description");

  if (tiktokError) {
    return redirect(origin, {
      tiktok: "failed",
      reason: tiktokErrorDescription || tiktokError,
    });
  }
  if (!code || !state) {
    return redirect(origin, {
      tiktok: "failed",
      reason: "missing-code-or-state",
    });
  }

  // Validate state against the value we stashed when the admin
  // pressed Connect TikTok. KV is the storage; the state is single-use.
  if (!env?.STOREFRONT_CONFIG) {
    return redirect(origin, {
      tiktok: "failed",
      reason: "kv-binding-missing",
    });
  }
  const store = makeStore(env.STOREFRONT_CONFIG);
  let storedState = null;
  try {
    storedState = await store.get(TIKTOK_OAUTH_STATE_KEY, { type: "json" });
  } catch {
    storedState = null;
  }
  if (!storedState || storedState.state !== state) {
    return redirect(origin, {
      tiktok: "failed",
      reason: "state-mismatch",
    });
  }
  // Consume the state — single-use.
  try {
    await store.delete(TIKTOK_OAUTH_STATE_KEY);
  } catch {
    // best-effort
  }
  const issuedAt = Number(storedState.issuedAt) || 0;
  if (issuedAt && Date.now() / 1000 - issuedAt > 600) {
    return redirect(origin, {
      tiktok: "failed",
      reason: "state-expired",
    });
  }

  // Exchange the code for tokens. exchangeAuthCode persists to KV
  // on success.
  const result = await exchangeAuthCode({ code });
  if (!result.ok) {
    return redirect(origin, {
      tiktok: "failed",
      reason: result.error || "exchange-failed",
    });
  }

  return redirect(origin, { tiktok: "connected" });
};
