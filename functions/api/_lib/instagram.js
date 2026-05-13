// instagram.js
//
// Meta Graph API wrapper for Instagram content publishing (organic
// auto-posting). Read-side: validate token + look up the connected
// IG account. Write-side: a two-step container → publish flow that
// posts a single image with caption to the connected IG Business
// account's feed.
//
// All functions are null-safe: when `IG_ACCESS_TOKEN` and
// `IG_USER_ID` are not bound on the running Pages deployment,
// `isInstagramConfigured()` returns false, every helper throws a
// well-typed error, and the admin panel renders a setup wizard
// instead of the post UI. The rest of the site keeps working
// unchanged.
//
// Auth model: the access token is a long-lived (~60 day) Meta token
// generated once via the Graph API Explorer + token-exchange flow.
// Refresh it before expiry with `refreshAccessToken`. The token
// never reaches the browser — admin endpoints read it from the
// Pages environment and call Meta server-side from the Workers
// runtime.
//
// Posting flow (single image):
//   1. POST /{ig-user-id}/media        → container_id (the draft)
//   2. (optionally poll) GET /{container-id}?fields=status_code
//   3. POST /{ig-user-id}/media_publish → ig_media_id (the live post)
//
// Limits enforced by Meta (not by us):
//   - 25 API posts per IG account per 24h.
//   - JPEG (preferred) ≤ 8 MB, aspect ratio between 4:5 and 1.91:1.
//   - Caption ≤ 2200 chars, ≤ 30 hashtags, ≤ 20 @-mentions.

import { getCloudflareEnv } from "./context.js";

const GRAPH_API_VERSION = "v18.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const GRAPH_API_TIMEOUT_MS = 30_000;
// Meta processes the container asynchronously; we poll status_code
// at this cadence and give up after the timeout.
const CONTAINER_POLL_INTERVAL_MS = 2_000;
const CONTAINER_POLL_TIMEOUT_MS = 90_000;
// Hard upper bound on caption length so we never POST a payload that
// Meta would reject; the SPA enforces this too with character counts.
export const MAX_CAPTION_LENGTH = 2200;
export const MAX_HASHTAGS = 30;

// ─── Configuration helpers ─────────────────────────────────────────────────────

export const getInstagramEnv = () => {
  const env = getCloudflareEnv();
  return {
    accessToken:
      typeof env?.IG_ACCESS_TOKEN === "string"
        ? env.IG_ACCESS_TOKEN.trim()
        : "",
    igUserId: typeof env?.IG_USER_ID === "string" ? env.IG_USER_ID.trim() : "",
    appId: typeof env?.IG_APP_ID === "string" ? env.IG_APP_ID.trim() : "",
    appSecret:
      typeof env?.IG_APP_SECRET === "string" ? env.IG_APP_SECRET.trim() : "",
  };
};

export const isInstagramConfigured = () => {
  const { accessToken, igUserId } = getInstagramEnv();
  return Boolean(accessToken && igUserId);
};

export const isTokenRefreshConfigured = () => {
  const { appId, appSecret } = getInstagramEnv();
  return Boolean(appId && appSecret);
};

// ─── Low-level HTTP ────────────────────────────────────────────────────────────

const graphFetch = async (method, path, params, body) => {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const init = {
    method,
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(GRAPH_API_TIMEOUT_MS),
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url.toString(), init);
  } catch (err) {
    if (err?.name === "TimeoutError") {
      throw new Error(`Instagram API timeout after ${GRAPH_API_TIMEOUT_MS}ms`);
    }
    throw new Error(`Instagram API network error: ${err?.message || err}`);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const apiError = json?.error || {};
    const message = apiError?.message || `HTTP ${res.status}`;
    const code = apiError?.code ? ` (code ${apiError.code})` : "";
    const sub = apiError?.error_subcode
      ? ` (subcode ${apiError.error_subcode})`
      : "";
    const fbtrace = apiError?.fbtrace_id
      ? ` [trace ${apiError.fbtrace_id}]`
      : "";
    throw new Error(`Instagram API: ${message}${code}${sub}${fbtrace}`);
  }

  return json || {};
};

// ─── Account / status ──────────────────────────────────────────────────────────

// Returns IG account metadata + token validity. Used by the admin
// status panel; never throws — surfaces a structured `{ ok: false, ... }`
// shape so the panel can show a setup wizard.
export const getInstagramAccountStatus = async () => {
  if (!isInstagramConfigured()) {
    return {
      configured: false,
      tokenRefreshAvailable: false,
      message:
        "Instagram not configured. Set IG_ACCESS_TOKEN and IG_USER_ID in Cloudflare Pages → Settings → Variables and Secrets.",
    };
  }

  const { accessToken, igUserId } = getInstagramEnv();

  // 1. Resolve the IG user — username + follower count + connected
  //    page name. Confirms the token is alive and pointed at the
  //    right account.
  let account = null;
  let accountError = null;
  try {
    account = await graphFetch("GET", `/${igUserId}`, {
      fields:
        "id,username,name,profile_picture_url,followers_count,media_count,biography",
      access_token: accessToken,
    });
  } catch (err) {
    accountError = err?.message || String(err);
  }

  // 2. Probe the token's debug info — gives us expiry + scopes.
  let tokenInfo = null;
  let tokenInfoError = null;
  try {
    const debug = await graphFetch("GET", `/debug_token`, {
      input_token: accessToken,
      access_token: accessToken, // Self-introspection works on user tokens.
    });
    tokenInfo = debug?.data || null;
  } catch (err) {
    tokenInfoError = err?.message || String(err);
  }

  const expiresAt = tokenInfo?.expires_at
    ? new Date(Number(tokenInfo.expires_at) * 1000).toISOString()
    : null;
  const daysUntilExpiry = expiresAt
    ? Math.max(
        0,
        Math.floor(
          (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  return {
    configured: true,
    tokenRefreshAvailable: isTokenRefreshConfigured(),
    account: account
      ? {
          id: account.id,
          username: account.username,
          name: account.name,
          profilePictureUrl: account.profile_picture_url,
          followersCount: account.followers_count,
          mediaCount: account.media_count,
          biography: account.biography,
        }
      : null,
    accountError,
    token: tokenInfo
      ? {
          isValid: tokenInfo.is_valid === true,
          scopes: Array.isArray(tokenInfo.scopes) ? tokenInfo.scopes : [],
          expiresAt,
          daysUntilExpiry,
        }
      : null,
    tokenInfoError,
  };
};

// ─── Two-step publish flow ─────────────────────────────────────────────────────

// Step 1: Create a media container (draft). Returns the container id.
export const createMediaContainer = async ({ imageUrl, caption }) => {
  if (!isInstagramConfigured()) {
    throw new Error(
      "Instagram is not configured (IG_ACCESS_TOKEN / IG_USER_ID missing).",
    );
  }
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error(
      "createMediaContainer: imageUrl is required (publicly reachable HTTPS URL).",
    );
  }
  if (!imageUrl.startsWith("https://")) {
    throw new Error(
      `createMediaContainer: imageUrl must be HTTPS (got: ${imageUrl.slice(0, 64)}…).`,
    );
  }
  if (typeof caption !== "string") {
    throw new Error("createMediaContainer: caption must be a string.");
  }
  if (caption.length > MAX_CAPTION_LENGTH) {
    throw new Error(
      `createMediaContainer: caption exceeds ${MAX_CAPTION_LENGTH} chars (got ${caption.length}).`,
    );
  }

  const { accessToken, igUserId } = getInstagramEnv();
  const res = await graphFetch("POST", `/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });

  if (!res?.id) {
    throw new Error("createMediaContainer: Meta returned no container id.");
  }
  return res.id;
};

// Poll container status until FINISHED or until the timeout expires.
// Meta sometimes returns PUBLISHED immediately for small JPEGs; for
// larger media (or anything they re-encode) it may take a few
// seconds to be FINISHED. Throws if the container errors out.
export const pollContainerStatus = async (
  containerId,
  {
    timeoutMs = CONTAINER_POLL_TIMEOUT_MS,
    intervalMs = CONTAINER_POLL_INTERVAL_MS,
  } = {},
) => {
  if (!containerId)
    throw new Error("pollContainerStatus: containerId is required.");
  const { accessToken } = getInstagramEnv();
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await graphFetch("GET", `/${containerId}`, {
      fields: "status_code,status",
      access_token: accessToken,
    });
    const code = res?.status_code || res?.status;
    if (code === "FINISHED" || code === "PUBLISHED") {
      return code;
    }
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(
        `Instagram container ${containerId} failed with status ${code}.`,
      );
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Instagram container ${containerId} not ready after ${timeoutMs}ms (last status: ${code}).`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
};

// Step 2: Publish a container. Returns the live ig_media_id.
export const publishContainer = async (containerId) => {
  if (!isInstagramConfigured()) {
    throw new Error(
      "Instagram is not configured (IG_ACCESS_TOKEN / IG_USER_ID missing).",
    );
  }
  if (!containerId)
    throw new Error("publishContainer: containerId is required.");

  const { accessToken, igUserId } = getInstagramEnv();
  const res = await graphFetch("POST", `/${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  if (!res?.id) {
    throw new Error("publishContainer: Meta returned no media id.");
  }
  return res.id;
};

// Fetch permalink + thumbnail of a published media.
export const getMediaInfo = async (mediaId) => {
  if (!mediaId) throw new Error("getMediaInfo: mediaId is required.");
  const { accessToken } = getInstagramEnv();
  const res = await graphFetch("GET", `/${mediaId}`, {
    fields: "id,permalink,media_type,media_url,thumbnail_url,timestamp,caption",
    access_token: accessToken,
  });
  return {
    id: res?.id,
    permalink: res?.permalink || null,
    mediaType: res?.media_type || null,
    mediaUrl: res?.media_url || null,
    thumbnailUrl: res?.thumbnail_url || null,
    timestamp: res?.timestamp || null,
    caption: res?.caption || null,
  };
};

// One-shot: full publish flow with container poll. Throws on any error.
export const publishToInstagram = async ({ imageUrl, caption }) => {
  const containerId = await createMediaContainer({ imageUrl, caption });
  await pollContainerStatus(containerId);
  const mediaId = await publishContainer(containerId);
  let info = null;
  try {
    info = await getMediaInfo(mediaId);
  } catch {
    // Permalink lookup is best-effort; the publish itself already succeeded.
  }
  return {
    containerId,
    mediaId,
    permalink: info?.permalink || null,
  };
};

// ─── Token refresh ─────────────────────────────────────────────────────────────

// Refreshes a long-lived token, extending its expiry by another 60
// days. Requires app id + app secret. Returns the new token; the
// caller is responsible for persisting it.
export const refreshAccessToken = async () => {
  if (!isInstagramConfigured()) {
    throw new Error(
      "refreshAccessToken: IG_ACCESS_TOKEN / IG_USER_ID not set.",
    );
  }
  if (!isTokenRefreshConfigured()) {
    throw new Error(
      "refreshAccessToken: IG_APP_ID / IG_APP_SECRET not set (token refresh requires both).",
    );
  }
  const { accessToken, appId, appSecret } = getInstagramEnv();
  const res = await graphFetch("GET", `/oauth/access_token`, {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: accessToken,
  });
  if (!res?.access_token) {
    throw new Error("refreshAccessToken: Meta returned no access_token.");
  }
  return {
    accessToken: res.access_token,
    tokenType: res.token_type || null,
    expiresIn: typeof res.expires_in === "number" ? res.expires_in : null,
  };
};

// ─── Caption generator ─────────────────────────────────────────────────────────

const PHP_FORMATTER = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const DEFAULT_TAGS = [
  "philippineart",
  "originalpainting",
  "handpainted",
  "canvashub",
  "canvhub",
  "filipinoartist",
  "supportlocalart",
  "artph",
  "wallartph",
  "homedecorph",
];

const CATEGORY_TAGS = {
  abstract: ["abstractart", "abstractpainting", "modernart"],
  landscape: ["landscapeart", "landscapepainting", "naturepainting"],
  portrait: ["portraitart", "portraitpainting", "facialart"],
  "still-life": ["stilllife", "stilllifepainting"],
  figurative: ["figurativeart", "figurativepainting"],
  cultural: ["culturalart", "filipinoculture", "philippineheritage"],
  contemporary: ["contemporaryart", "modernart"],
};

const slugTag = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);

// Build a clean, conversion-friendly caption for a single painting.
// `product` is the canvhub Product shape from `src/contexts/ProductContext.tsx`
// (id, title, medium, price, salePrice, dimensions, description, category, …).
// `options.tone` switches between "available" (in-stock pitch) and
// "made-to-order" (commission pitch).
export const generateCaption = (product, options = {}) => {
  if (!product || typeof product !== "object") return "";

  const title = String(product.title || "Untitled").trim();
  const medium = String(product.medium || "").trim();
  const dimensions = String(product.dimensions || "").trim();
  const description = String(product.description || "").trim();
  const category = String(product.category || "")
    .trim()
    .toLowerCase();
  const productUrl =
    product.productUrl ||
    product.permalink ||
    (product.id ? `https://canvhub.com/product/${product.id}` : null);
  const price = Number(product.salePrice ?? product.price ?? 0);
  const availability = String(
    product.availability || "available",
  ).toLowerCase();

  const lines = [];
  if (availability === "made-to-order") {
    lines.push(`Now taking commissions — "${title}"`);
  } else if (availability === "sold") {
    lines.push(`Sold piece — "${title}" (similar commissions welcome)`);
  } else {
    lines.push(`Available now — "${title}"`);
  }

  const metaLine = [medium, dimensions].filter(Boolean).join(" · ");
  if (metaLine) lines.push(metaLine);

  if (price > 0) {
    lines.push(PHP_FORMATTER.format(price));
  }

  if (description) {
    const trimmed =
      description.length > 400
        ? `${description.slice(0, 397).trim()}…`
        : description;
    lines.push("");
    lines.push(trimmed);
  }

  lines.push("");
  if (productUrl) {
    lines.push(`Shop: ${productUrl}`);
  }
  lines.push("Link in bio · DM to commission · Worldwide shipping");

  // Hashtags — kept tight; Meta caps at 30.
  const tags = new Set();
  for (const t of DEFAULT_TAGS) tags.add(t);
  for (const t of CATEGORY_TAGS[category] || []) tags.add(t);
  if (medium) {
    const m = slugTag(medium);
    if (m) tags.add(m);
  }
  const titleTag = slugTag(title);
  if (titleTag && titleTag.length >= 4) tags.add(titleTag);

  const tagList = Array.from(tags).slice(0, MAX_HASHTAGS);
  if (tagList.length) {
    lines.push("");
    lines.push(tagList.map((t) => `#${t}`).join(" "));
  }

  let caption = lines.join("\n").trim();
  if (caption.length > MAX_CAPTION_LENGTH) {
    caption = caption.slice(0, MAX_CAPTION_LENGTH - 1).trim() + "…";
  }

  if (options.append && typeof options.append === "string") {
    const extra = `\n\n${options.append.trim()}`;
    if (caption.length + extra.length <= MAX_CAPTION_LENGTH) {
      caption += extra;
    }
  }

  return caption;
};

// Resolve the public, HTTPS URL Meta should fetch for a given product.
// Meta requires the image to be served from a publicly reachable URL
// (it downloads server-side); base64 / data URIs are rejected. We
// prefer the largest variant available (`urls.lg`) since IG re-
// compresses anyway and starting from a higher-quality source helps
// the result look crisp.
export const resolveProductImageUrl = (
  product,
  { origin = "https://canvhub.com" } = {},
) => {
  if (!product || typeof product !== "object") return null;

  const primary =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images[0]
      : null;
  const candidate =
    primary?.urls?.lg ||
    primary?.urls?.md ||
    primary?.url ||
    product.image ||
    "";

  const trimmed = String(candidate).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return null; // base64 not allowed.
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) {
    return trimmed.replace(/^http:\/\//, "https://");
  }
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
};
