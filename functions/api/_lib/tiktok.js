// TikTok Content Posting API client.
//
// Implements the OAuth 2.0 authorisation flow + the v2 Content
// Posting endpoints so the admin panel can publish paintings as
// photo carousel posts to a connected TikTok account.
//
// Null-safe pattern (matches `_lib/turso.js` and `_lib/d1.js`):
// when the `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` env vars
// are not configured (the operator hasn't done the 5-minute TikTok
// Developer signup yet), every helper returns `null` / a no-op so
// the rest of the API keeps working unchanged. The admin TikTok
// section renders the setup wizard instead of the posting UI.
//
// Architecture choices:
//   * Access tokens have a 24-hour TTL and refresh tokens have a
//     365-day TTL. We store both in the STOREFRONT_CONFIG KV
//     namespace under the `tiktok_auth` key (alongside the other
//     site-wide config singletons).
//   * On every API call we transparently refresh the access token
//     if it expires within the next 60 seconds — the helper
//     callers never have to think about refresh.
//   * Photo posts are the canvhub-relevant mode. Paintings are
//     static images; we use the PHOTO `media_type` and pass the
//     public R2 image URL.
//   * UPLOAD vs DIRECT_POST: TikTok gates DIRECT_POST behind their
//     "Production" app audit (1-2 week review). Until you pass
//     that audit, posts land in the creator's inbox/drafts as
//     UPLOAD and the creator finishes publishing inside the
//     TikTok app. After audit, the same code path with `post_mode:
//     "DIRECT_POST"` publishes immediately.
//
// API docs:
//   https://developers.tiktok.com/doc/oauth-user-access-token-management
//   https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
//   https://developers.tiktok.com/doc/content-posting-api-reference-photo

import { getCloudflareEnv } from "./context.js";
import { makeStore } from "./kv-store.js";
import { d1Run, isD1Available } from "./d1.js";

const TIKTOK_API_HOST = "https://open.tiktokapis.com";
const TIKTOK_OAUTH_HOST = "https://www.tiktok.com";

// KV key inside the STOREFRONT_CONFIG namespace where we keep the
// OAuth token bundle. Single tenancy — canvhub only ever connects
// one TikTok account at a time (the @canvashub account).
const TIKTOK_AUTH_KEY = "tiktok_auth";

// KV key (same namespace) for the auto-post toggle. When `enabled`
// is true, every successful product create fires a fire-and-forget
// MEDIA_UPLOAD job. Default off — operator opts in once from the
// admin TikTok section.
const TIKTOK_AUTO_POST_KEY = "tiktok_auto_post";

// Scopes we request during the OAuth authorize step.
//   * `user.info.basic`   — open_id, union_id, avatar_url, display_name
//   * `user.info.profile` — `username` (the @ handle the admin sees).
//                           Without this scope TikTok rejects /v2/user/info/
//                           with "the user did not authorize the scope
//                           required for completing this request" because
//                           we ask for the `username` field below.
//   * `video.publish`     — required for /v2/post/publish/content/init/
//                           (DIRECT_POST and MEDIA_UPLOAD both need it).
//   * `video.upload`      — required to push images via PULL_FROM_URL.
const TIKTOK_SCOPES = [
  "user.info.basic",
  "user.info.profile",
  "video.publish",
  "video.upload",
];

// Refresh the access token if it expires within this many seconds.
const REFRESH_WINDOW_SECONDS = 60;

// Default caption length cap for TikTok captions. The API accepts
// up to 2200 chars but the UI truncates around 150 chars in feed.
// We cap at 2200 to match the API limit; the admin UI shows a
// counter at 150 / 2200.
const MAX_CAPTION_LENGTH = 2200;

// How many seconds to wait between status polls when checking a
// publish job's progress.
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

const isObject = (value) => value !== null && typeof value === "object";

// ─── env reading + null-safe gate ──────────────────────────────────────────────

// Default redirect URI path. The full URL is derived from the request
// origin so the integration works on canvhub.com without needing the
// `TIKTOK_REDIRECT_URI` env var to be set. The env var still takes
// precedence if present (for custom domains / staging).
const TIKTOK_CALLBACK_PATH = "/api/admin/tiktok-callback";

export const resolveTikTokRedirectUri = (origin) => {
  const env = getCloudflareEnv();
  const fromEnv = env?.TIKTOK_REDIRECT_URI
    ? String(env.TIKTOK_REDIRECT_URI)
    : "";
  if (fromEnv) return fromEnv;
  if (origin) return `${origin}${TIKTOK_CALLBACK_PATH}`;
  return "";
};

export const getTikTokEnv = ({ origin } = {}) => {
  const env = getCloudflareEnv();
  return {
    clientKey: env?.TIKTOK_CLIENT_KEY ? String(env.TIKTOK_CLIENT_KEY) : "",
    clientSecret: env?.TIKTOK_CLIENT_SECRET
      ? String(env.TIKTOK_CLIENT_SECRET)
      : "",
    redirectUri: resolveTikTokRedirectUri(origin),
  };
};

export const isTikTokConfigured = () => {
  const { clientKey, clientSecret } = getTikTokEnv();
  return Boolean(clientKey && clientSecret);
};

// Public client_key is sometimes safe to expose to the SPA (for the
// OAuth redirect URL builder). client_secret never leaves the
// Functions runtime.
export const getPublicTikTokConfig = () => {
  const { clientKey, redirectUri } = getTikTokEnv();
  return {
    configured: isTikTokConfigured(),
    clientKey: clientKey || null,
    redirectUri: redirectUri || null,
    scopes: TIKTOK_SCOPES,
  };
};

// ─── auth state (KV-backed) ────────────────────────────────────────────────────

// Read the stored OAuth token bundle. Returns `null` if the admin
// has not connected a TikTok account yet, or if the STOREFRONT_CONFIG
// binding is missing (e.g. local dev without bindings).
export const getStoredAuth = async () => {
  const env = getCloudflareEnv();
  if (!env?.STOREFRONT_CONFIG) return null;
  const store = makeStore(env.STOREFRONT_CONFIG);
  try {
    const raw = await store.get(TIKTOK_AUTH_KEY, { type: "json" });
    return isObject(raw) ? raw : null;
  } catch {
    return null;
  }
};

export const setStoredAuth = async (payload) => {
  const env = getCloudflareEnv();
  if (!env?.STOREFRONT_CONFIG) {
    throw new Error("STOREFRONT_CONFIG KV binding missing");
  }
  const store = makeStore(env.STOREFRONT_CONFIG);
  await store.setJSON(TIKTOK_AUTH_KEY, payload);
};

export const clearStoredAuth = async () => {
  const env = getCloudflareEnv();
  if (!env?.STOREFRONT_CONFIG) return;
  const store = makeStore(env.STOREFRONT_CONFIG);
  try {
    await store.delete(TIKTOK_AUTH_KEY);
  } catch {
    // best-effort
  }
};

// ─── OAuth flow ────────────────────────────────────────────────────────────────

// Build the URL the admin sends the user to start the OAuth flow.
// The `state` param is a CSRF token the callback verifies. `origin`
// (optional) is used to derive the redirect URI when TIKTOK_REDIRECT_URI
// env var is not set.
export const buildAuthorizeUrl = ({ state, origin } = {}) => {
  const { clientKey, redirectUri } = getTikTokEnv({ origin });
  if (!clientKey) return null;
  if (!redirectUri) return null;
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: TIKTOK_SCOPES.join(","),
    redirect_uri: redirectUri,
    state: state || "",
  });
  return `${TIKTOK_OAUTH_HOST}/v2/auth/authorize/?${params.toString()}`;
};

// Exchange an authorisation code for an access token + refresh token
// bundle. Called by the OAuth callback endpoint. `origin` is used to
// derive the redirect URI (must match the value used during authorize).
export const exchangeAuthCode = async ({ code, origin } = {}) => {
  const { clientKey, clientSecret, redirectUri } = getTikTokEnv({ origin });
  if (!clientKey || !clientSecret) {
    return { ok: false, error: "TikTok not configured" };
  }
  if (!redirectUri) {
    return { ok: false, error: "redirect URI not resolved" };
  }
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code: String(code),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(`${TIKTOK_API_HOST}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    return {
      ok: false,
      error: data?.error_description || data?.error || `HTTP ${res.status}`,
    };
  }
  return persistTokenResponse(data);
};

// Use the refresh_token to mint a new 24-hour access token.
export const refreshAccessToken = async () => {
  const { clientKey, clientSecret } = getTikTokEnv();
  if (!clientKey || !clientSecret) {
    return { ok: false, error: "TikTok not configured" };
  }
  const auth = await getStoredAuth();
  if (!auth?.refresh_token) {
    return { ok: false, error: "No refresh token stored" };
  }
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: auth.refresh_token,
  });
  const res = await fetch(`${TIKTOK_API_HOST}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    return {
      ok: false,
      error: data?.error_description || data?.error || `HTTP ${res.status}`,
    };
  }
  return persistTokenResponse(data, auth);
};

const persistTokenResponse = async (data, previous = null) => {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = data.access_token || data.accessToken;
  const refreshToken = data.refresh_token || data.refreshToken;
  if (!accessToken) {
    return { ok: false, error: "TikTok response missing access_token" };
  }
  const expiresIn = Number(data.expires_in) || 86400;
  const refreshExpiresIn = Number(data.refresh_expires_in) || 31536000;
  const payload = {
    access_token: accessToken,
    refresh_token: refreshToken || previous?.refresh_token || null,
    open_id: data.open_id || previous?.open_id || null,
    scope: data.scope || previous?.scope || TIKTOK_SCOPES.join(","),
    token_type: data.token_type || previous?.token_type || "Bearer",
    expires_at: now + expiresIn,
    refresh_expires_at: now + refreshExpiresIn,
    connected_at: previous?.connected_at || now,
    refreshed_at: now,
  };
  await setStoredAuth(payload);
  return { ok: true, auth: payload };
};

// Return a fresh access token, refreshing if it's about to expire.
// Returns null if not configured or refresh fails.
export const getValidAccessToken = async () => {
  if (!isTikTokConfigured()) return null;
  const auth = await getStoredAuth();
  if (!auth?.access_token) return null;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(auth.expires_at) || 0;
  if (expiresAt - now > REFRESH_WINDOW_SECONDS) {
    return auth.access_token;
  }
  const refreshed = await refreshAccessToken();
  if (!refreshed.ok) return null;
  return refreshed.auth.access_token;
};

// ─── account info ──────────────────────────────────────────────────────────────

export const getCreatorInfo = async () => {
  const token = await getValidAccessToken();
  if (!token) return null;
  const res = await fetch(
    `${TIKTOK_API_HOST}/v2/post/publish/creator_info/query/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error?.code !== "ok") {
    return {
      ok: false,
      error: data?.error?.message || `HTTP ${res.status}`,
      raw: data,
    };
  }
  return { ok: true, info: data?.data || null };
};

export const getUserInfo = async () => {
  const token = await getValidAccessToken();
  if (!token) return null;
  const fields = [
    "open_id",
    "union_id",
    "avatar_url",
    "display_name",
    "username",
  ].join(",");
  const res = await fetch(
    `${TIKTOK_API_HOST}/v2/user/info/?fields=${encodeURIComponent(fields)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error?.code !== "ok") {
    return {
      ok: false,
      error: data?.error?.message || `HTTP ${res.status}`,
    };
  }
  return { ok: true, user: data?.data?.user || null };
};

// Compose an admin-facing status report covering: env config, KV
// binding, stored token, token validity, account display name, and
// the audit-mode flag (controls whether DIRECT_POST is unlocked).
export const getTikTokAccountStatus = async ({ origin } = {}) => {
  const configured = isTikTokConfigured();
  const env = getCloudflareEnv();
  const out = {
    configured,
    redirectUri: getTikTokEnv({ origin }).redirectUri || null,
    kvBindingMissing: !env?.STOREFRONT_CONFIG,
    connected: false,
    account: null,
    token: null,
    creator: null,
    requiredScopes: TIKTOK_SCOPES,
    // True when the stored token was issued under an older scope set
    // than what we now request — the admin must click Disconnect +
    // Connect once to mint a fresh token. Set further down once we
    // know what scopes were actually granted.
    needsReconnect: false,
    missingScopes: [],
    errors: [],
  };
  if (!configured) {
    out.errors.push(
      "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in Cloudflare Pages → Settings → Environment variables. TIKTOK_REDIRECT_URI is auto-derived from the request origin unless overridden.",
    );
    return out;
  }
  if (out.kvBindingMissing) {
    out.errors.push("STOREFRONT_CONFIG KV binding missing.");
    return out;
  }
  const auth = await getStoredAuth();
  if (!auth) {
    out.errors.push(
      "No TikTok account connected yet. Click Connect TikTok to start the OAuth flow.",
    );
    return out;
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(auth.expires_at) || 0;
  const refreshExpiresAt = Number(auth.refresh_expires_at) || 0;
  out.connected = true;
  out.token = {
    expiresInSeconds: Math.max(0, expiresAt - now),
    expiresInDays: Math.max(0, Math.round((expiresAt - now) / 86400)),
    refreshExpiresInDays: Math.max(
      0,
      Math.round((refreshExpiresAt - now) / 86400),
    ),
    refreshExpired: refreshExpiresAt > 0 && refreshExpiresAt < now,
    refreshedAt: auth.refreshed_at || null,
    connectedAt: auth.connected_at || null,
    scope: auth.scope || null,
    openId: auth.open_id || null,
  };
  if (out.token.refreshExpired) {
    out.errors.push(
      "TikTok refresh token expired (>365 days old). Reconnect the account.",
    );
    return out;
  }
  // Detect a scope drift: the stored token was issued under a smaller
  // scope set than what TIKTOK_SCOPES asks for now (e.g. after we added
  // user.info.profile). One Disconnect + Connect fixes it. Without this
  // signal the admin sees a cryptic TikTok error from /v2/user/info/.
  const grantedScopes = String(auth.scope || "")
    .split(/[,\s]+/)
    .filter(Boolean);
  const missingScopes = TIKTOK_SCOPES.filter((s) => !grantedScopes.includes(s));
  out.missingScopes = missingScopes;
  out.needsReconnect = missingScopes.length > 0;
  if (out.needsReconnect) {
    out.errors.push(
      `Stored TikTok token is missing scope(s): ${missingScopes.join(", ")}. Click Disconnect and then Connect TikTok again to grant them.`,
    );
  }
  // Get user info + creator info in parallel. Either failing
  // shouldn't block the status response.
  const [user, creator] = await Promise.all([
    getUserInfo().catch(() => null),
    getCreatorInfo().catch(() => null),
  ]);
  if (user?.ok) {
    out.account = {
      openId: user.user?.open_id || null,
      unionId: user.user?.union_id || null,
      displayName: user.user?.display_name || null,
      username: user.user?.username || null,
      avatarUrl: user.user?.avatar_url || null,
    };
  } else if (user?.error && !out.needsReconnect) {
    // When the stored token is missing scopes, /v2/user/info/ will
    // always fail with the same root cause we already surfaced — don't
    // double-report it.
    out.errors.push(`User info: ${user.error}`);
  }
  if (creator?.ok) {
    out.creator = {
      maxVideoPostDurationSec:
        creator.info?.max_video_post_duration_sec || null,
      privacyLevelOptions: creator.info?.privacy_level_options || null,
      commentDisabled: creator.info?.comment_disabled,
      duetDisabled: creator.info?.duet_disabled,
      stitchDisabled: creator.info?.stitch_disabled,
    };
  } else if (creator?.error) {
    out.errors.push(`Creator info: ${creator.error}`);
  }
  return out;
};

// ─── publishing (photo posts) ──────────────────────────────────────────────────

// Initialise a photo carousel publish job. Returns the publish_id
// TikTok assigned; callers should poll the status endpoint until
// the job reaches a terminal state.
//
// `imageUrls`: array of public HTTPS image URLs (max 35 images per
//   TikTok's docs; canvhub typically posts a single image).
// `caption`: title + description text. Capped at 2200 chars.
// `postMode`:
//   - "MEDIA_UPLOAD" — image lands in the creator's TikTok inbox
//     for them to publish manually (works pre-audit).
//   - "DIRECT_POST"  — image publishes immediately to the creator's
//     feed (requires TikTok Production audit).
// `privacyLevel`: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS"
//   | "FOLLOWER_OF_CREATOR" | "SELF_ONLY". Required for DIRECT_POST.
export const initPhotoPost = async ({
  imageUrls,
  caption,
  postMode = "MEDIA_UPLOAD",
  privacyLevel = "SELF_ONLY",
  disableComment = false,
  autoAddMusic = false,
  brandContentToggle = false,
  brandOrganicToggle = false,
}) => {
  const token = await getValidAccessToken();
  if (!token) return { ok: false, error: "Not connected to TikTok" };
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { ok: false, error: "imageUrls is required" };
  }
  if (imageUrls.length > 35) {
    return { ok: false, error: "Max 35 images per post" };
  }
  for (const u of imageUrls) {
    if (typeof u !== "string" || !/^https:\/\//i.test(u)) {
      return { ok: false, error: `Image URL must be public HTTPS: ${u}` };
    }
  }
  const trimmedCaption = String(caption || "").slice(0, MAX_CAPTION_LENGTH);
  const resolvedMode =
    postMode === "DIRECT_POST" ? "DIRECT_POST" : "MEDIA_UPLOAD";
  // `privacy_level`, `disable_comment`, `auto_add_music`, and the
  // `brand_*_toggle` fields only apply to DIRECT_POST. TikTok rejects
  // MEDIA_UPLOAD requests that include them with `invalid_params`.
  const postInfo =
    resolvedMode === "DIRECT_POST"
      ? {
          title: trimmedCaption.slice(0, 90),
          description: trimmedCaption,
          privacy_level: privacyLevel,
          disable_comment: Boolean(disableComment),
          auto_add_music: Boolean(autoAddMusic),
          brand_content_toggle: Boolean(brandContentToggle),
          brand_organic_toggle: Boolean(brandOrganicToggle),
        }
      : {
          title: trimmedCaption.slice(0, 90),
          description: trimmedCaption,
        };
  const body = {
    media_type: "PHOTO",
    post_mode: resolvedMode,
    post_info: postInfo,
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: 0,
      photo_images: imageUrls,
    },
  };
  const res = await fetch(`${TIKTOK_API_HOST}/v2/post/publish/content/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error?.code !== "ok") {
    return {
      ok: false,
      error: data?.error?.message || `HTTP ${res.status}`,
      errorCode: data?.error?.code || null,
      raw: data,
    };
  }
  return {
    ok: true,
    publishId: data?.data?.publish_id || null,
  };
};

// Poll the status of a publish job until it reaches a terminal
// state or the timeout elapses.
//
// Returns:
//   { ok: true, status, shareUrl?, postId? } on terminal success
//   { ok: false, status?, error? }           on terminal failure /
//                                            timeout
//
// TikTok's status enum:
//   PROCESSING_UPLOAD  / PROCESSING_DOWNLOAD — still working
//   PROCESSING_AUTH_REQUIRED                 — needs creator action
//   PUBLISH_COMPLETE                         — terminal success (DIRECT_POST)
//   SEND_TO_USER_INBOX                       — terminal success (MEDIA_UPLOAD)
//   FAILED                                    — terminal failure
export const pollPublishStatus = async (
  publishId,
  { timeoutMs = POLL_TIMEOUT_MS } = {},
) => {
  const token = await getValidAccessToken();
  if (!token) return { ok: false, error: "Not connected to TikTok" };
  if (!publishId) return { ok: false, error: "publishId required" };
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "PROCESSING_UPLOAD";
  let lastRaw = null;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${TIKTOK_API_HOST}/v2/post/publish/status/fetch/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      },
    );
    const data = await res.json().catch(() => ({}));
    lastRaw = data;
    if (!res.ok || data?.error?.code !== "ok") {
      return {
        ok: false,
        error: data?.error?.message || `HTTP ${res.status}`,
        errorCode: data?.error?.code || null,
      };
    }
    const status = data?.data?.status || "PROCESSING_UPLOAD";
    lastStatus = status;
    if (status === "PUBLISH_COMPLETE" || status === "SEND_TO_USER_INBOX") {
      return {
        ok: true,
        status,
        shareUrl: data?.data?.publicly_available_post_id
          ? `https://www.tiktok.com/@/video/${data.data.publicly_available_post_id}`
          : null,
        postId: data?.data?.publicly_available_post_id || null,
        uploadedBytes: data?.data?.uploaded_bytes || null,
      };
    }
    if (status === "FAILED") {
      return {
        ok: false,
        status,
        error: data?.data?.fail_reason || "TikTok reported FAILED",
      };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return {
    ok: false,
    status: lastStatus,
    error: "Polling timed out before TikTok finished processing",
    raw: lastRaw,
  };
};

// ─── caption + image URL helpers ───────────────────────────────────────────────

// Pick the largest public HTTPS variant of a product image so
// TikTok's downloader has the best source to work with.
//
// Handles:
//   - product.images[*].urls.{lg, md, sm} — modern R2 responsive set
//   - product.images[*].url               — legacy single URL per image
//   - product.image                       — top-level legacy URL
// And rejects:
//   - data: URIs (not publicly fetchable by TikTok)
//   - http: URLs (TikTok requires HTTPS for the source_info pull)
export const resolveProductImageUrl = (product, { origin = "" } = {}) => {
  if (!product) return null;
  const candidates = [];
  const images = Array.isArray(product.images) ? product.images : [];
  for (const img of images) {
    if (!img) continue;
    if (img.urls) {
      if (img.urls.lg) candidates.push(img.urls.lg);
      if (img.urls.md) candidates.push(img.urls.md);
      if (img.urls.sm) candidates.push(img.urls.sm);
    }
    if (img.url) candidates.push(img.url);
  }
  if (product.image) candidates.push(product.image);
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:")) continue;
    if (trimmed.startsWith("https://")) return trimmed;
    if (trimmed.startsWith("http://")) {
      return "https://" + trimmed.slice("http://".length);
    }
    if (trimmed.startsWith("/") && origin) {
      const base = String(origin).replace(/\/+$/, "");
      return `${base}${trimmed}`;
    }
  }
  return null;
};

const DEFAULT_HASHTAGS = [
  "#philippineart",
  "#originalpainting",
  "#handmade",
  "#canvashub",
  "#artph",
  "#artistsoftiktok",
  "#painting",
];

const CATEGORY_HASHTAGS = {
  abstract: ["#abstractart", "#modernart"],
  landscape: ["#landscapepainting", "#nature"],
  portrait: ["#portraitpainting", "#portraitart"],
  "still-life": ["#stilllife", "#stilllifepainting"],
  seascape: ["#seascape", "#oceanart"],
};

const formatPrice = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);
};

// Build a caption from a canvhub product. TikTok captions are
// space-sensitive: leading hashtags get more pickup from the
// algorithm than trailing ones, but readability matters too. We
// put the descriptive text first, then a CTA, then hashtags.
export const generateTikTokCaption = (product) => {
  if (!product) return "";
  const lines = [];
  const title = String(product.title || "Untitled").trim();
  const medium = String(product.medium || "").trim();
  const dims = String(product.dimensions || "").trim();
  const desc = String(product.description || "").trim();
  const price = formatPrice(product.salePrice ?? product.price);
  lines.push(`✨ ${title} ✨`);
  const metaParts = [];
  if (medium) metaParts.push(medium);
  if (dims) metaParts.push(dims);
  if (metaParts.length) lines.push(metaParts.join(" · "));
  if (price) lines.push(`${price}`);
  if (desc) {
    const snippet = desc.length > 240 ? desc.slice(0, 237) + "…" : desc;
    lines.push("");
    lines.push(snippet);
  }
  lines.push("");
  lines.push("Shop the full collection at canvhub.com 🎨");
  lines.push("");
  const categoryKey = String(product.category || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const categoryTags = CATEGORY_HASHTAGS[categoryKey] || [];
  const allTags = [...new Set([...DEFAULT_HASHTAGS, ...categoryTags])].slice(
    0,
    15,
  );
  lines.push(allTags.join(" "));
  const out = lines.join("\n").trim();
  return out.length > MAX_CAPTION_LENGTH
    ? out.slice(0, MAX_CAPTION_LENGTH - 1) + "…"
    : out;
};

// ─── auto-post toggle ──────────────────────────────────────────────────────────

// Read the auto-post-on-product-create toggle. Returns `false` when
// the flag has never been set, when STOREFRONT_CONFIG is unbound, or
// on any read error — safe defaults so an env hiccup never opens the
// floodgates.
export const getAutoPostEnabled = async () => {
  const env = getCloudflareEnv();
  if (!env?.STOREFRONT_CONFIG) return false;
  const store = makeStore(env.STOREFRONT_CONFIG);
  try {
    const value = await store.get(TIKTOK_AUTO_POST_KEY, { type: "json" });
    return Boolean(value?.enabled);
  } catch {
    return false;
  }
};

// Write the auto-post toggle. Throws when STOREFRONT_CONFIG is
// unbound — admin handler upgrades that to a 500.
export const setAutoPostEnabled = async (enabled) => {
  const env = getCloudflareEnv();
  if (!env?.STOREFRONT_CONFIG) {
    throw new Error("STOREFRONT_CONFIG KV binding missing");
  }
  const store = makeStore(env.STOREFRONT_CONFIG);
  await store.setJSON(TIKTOK_AUTO_POST_KEY, {
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString(),
  });
};

// ─── unified publish flow ──────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

const newAuditId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

// publishProductPhoto — the single source of truth for the
// init → poll → D1-audit-log flow. Both the admin "publish now"
// endpoint and the auto-post-on-create hook call this so we can't
// drift between the two paths.
//
// `product` is the canvhub KV product row.
// `origin` is the canvhub URL (e.g. https://canvhub.com), used to
//   resolve relative image paths into public HTTPS URLs.
// `postMode` defaults to MEDIA_UPLOAD (works in Sandbox).
//   DIRECT_POST requires TikTok Production audit.
// `source` is recorded in the audit table so the admin can
//   distinguish manual posts from auto-on-create posts.
//
// Returns `{ ok, id, publishId, postId, shareUrl, status, error,
// errorCode }`. Never throws — wraps everything in try/catch so it's
// safe to call from a fire-and-forget background task.
export const publishProductPhoto = async ({
  product,
  origin = "",
  postMode = "MEDIA_UPLOAD",
  privacyLevel = null,
  captionOverride = null,
  imageUrlOverride = null,
  source = "manual",
} = {}) => {
  try {
    if (!product?.id) {
      return { ok: false, error: "product is required" };
    }
    if (!isD1Available()) {
      return { ok: false, error: "D1 not configured" };
    }
    const caption = (captionOverride ?? generateTikTokCaption(product)).slice(
      0,
      MAX_CAPTION_LENGTH,
    );
    const imageUrl =
      (typeof imageUrlOverride === "string" &&
      /^https:\/\//i.test(imageUrlOverride)
        ? imageUrlOverride
        : null) || resolveProductImageUrl(product, { origin });
    if (!imageUrl || !/^https:\/\//i.test(imageUrl)) {
      return {
        ok: false,
        error: "Product has no public HTTPS image URL",
      };
    }
    const resolvedMode =
      postMode === "DIRECT_POST" ? "DIRECT_POST" : "MEDIA_UPLOAD";
    const resolvedPrivacy =
      typeof privacyLevel === "string" && privacyLevel.trim()
        ? privacyLevel
        : resolvedMode === "DIRECT_POST"
          ? "PUBLIC_TO_EVERYONE"
          : "SELF_ONLY";

    // Pre-write the audit row so even init failures are recorded.
    // `posted_by` doubles as our source tag ("manual" / "auto-create")
    // so we don't need a schema change to track origin.
    const rowId = newAuditId();
    const now = nowIso();
    await d1Run(
      `INSERT INTO tiktok_posts
        (id, product_id, caption, image_url, image_urls, post_mode, media_type, status, posted_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PHOTO', 'pending', ?, ?, ?)`,
      [
        rowId,
        product.id,
        caption,
        imageUrl,
        JSON.stringify([imageUrl]),
        resolvedMode,
        source,
        now,
        now,
      ],
    );

    const initResult = await initPhotoPost({
      imageUrls: [imageUrl],
      caption,
      postMode: resolvedMode,
      privacyLevel: resolvedPrivacy,
    });
    if (!initResult.ok) {
      await d1Run(
        `UPDATE tiktok_posts
           SET status='failed', error_code=?, error_message=?, updated_at=?
         WHERE id=?`,
        [
          initResult.errorCode || null,
          initResult.error || "init failed",
          nowIso(),
          rowId,
        ],
      );
      return {
        ok: false,
        id: rowId,
        error: initResult.error || "TikTok rejected the init request",
        errorCode: initResult.errorCode || null,
      };
    }

    const publishId = initResult.publishId;
    await d1Run(
      `UPDATE tiktok_posts
         SET publish_id=?, status='processing', updated_at=?
       WHERE id=?`,
      [publishId, nowIso(), rowId],
    );

    const pollResult = await pollPublishStatus(publishId, {
      timeoutMs: 60000,
    });
    if (!pollResult.ok) {
      await d1Run(
        `UPDATE tiktok_posts
           SET status='failed', error_code=?, error_message=?, updated_at=?
         WHERE id=?`,
        [
          pollResult.errorCode || pollResult.status || null,
          pollResult.error || "polling failed",
          nowIso(),
          rowId,
        ],
      );
      return {
        ok: false,
        id: rowId,
        publishId,
        error: pollResult.error || "TikTok publishing failed",
        status: pollResult.status || null,
      };
    }

    const finishedAt = nowIso();
    await d1Run(
      `UPDATE tiktok_posts
         SET status='published', tiktok_post_id=?, share_url=?, posted_at=?, updated_at=?
       WHERE id=?`,
      [
        pollResult.postId || null,
        pollResult.shareUrl || null,
        finishedAt,
        finishedAt,
        rowId,
      ],
    );

    return {
      ok: true,
      id: rowId,
      publishId,
      postId: pollResult.postId || null,
      shareUrl: pollResult.shareUrl || null,
      status: pollResult.status,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
};

// shouldAutoPostProduct — decide whether the create-product hook
// should fire the auto-post. Centralised here so the rules are
// auditable in one place.
//
// Skips when:
//   * auto-post toggle is off
//   * TikTok is not configured (env vars missing)
//   * not OAuth-connected (no stored token)
//   * product has no image
//   * product availability is sold / draft / reserved
//   * product has no id (defensive)
export const shouldAutoPostProduct = async (product) => {
  if (!product || !product.id) return { ok: false, reason: "no-product" };
  if (!product.image && !product.images?.length) {
    return { ok: false, reason: "no-image" };
  }
  const av = String(product.availability || "available").toLowerCase();
  if (av === "sold" || av === "draft" || av === "reserved") {
    return { ok: false, reason: `availability-${av}` };
  }
  if (!isTikTokConfigured()) {
    return { ok: false, reason: "not-configured" };
  }
  const enabled = await getAutoPostEnabled();
  if (!enabled) return { ok: false, reason: "toggle-off" };
  const auth = await getStoredAuth();
  if (!auth?.access_token) {
    return { ok: false, reason: "not-connected" };
  }
  return { ok: true };
};

export { MAX_CAPTION_LENGTH };
