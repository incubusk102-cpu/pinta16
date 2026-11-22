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

  // NOTE: We deliberately don't re-check `isAuthenticated` here. The
  // admin's session cookie uses `SameSite=Strict` (see _lib/cookies.js)
  // which browsers strip from cross-site top-level navigations — and a
  // redirect from www.tiktok.com → canvhub.com is exactly that. The
  // CSRF guarantee comes instead from the `state` token we minted (and
  // stashed in KV) at /api/admin/tiktok?action=connect-url — that
  // endpoint already required admin auth, the state is 192 bits of
  // crypto-random, single-use, and expires in 10 minutes. Validating
  // it below is sufficient proof the OAuth flow was started by an
  // authed admin from this exact site.

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
  const result = await exchangeAuthCode({ code, origin });
  if (!result.ok) {
    return redirect(origin, {
      tiktok: "failed",
      reason: result.error || "exchange-failed",
    });
  }

  return redirect(origin, { tiktok: "connected" });
};
