// Replacement for Netlify's purgeCache(): hits Cloudflare's cache purge API
// using the zone id + an API token with `Cache Purge:Edit` permission.
// Best-effort — failures are logged, not surfaced to the caller.

import { getCloudflareEnv } from "./context.js";

export const purgeCacheByTags = async (tags) => {
  const env = getCloudflareEnv();
  const zoneId = env.CF_ZONE_ID;
  const token = env.CF_PURGE_TOKEN;
  if (!zoneId || !token || !Array.isArray(tags) || tags.length === 0) return;
  try {
    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags }),
      },
    );
  } catch (err) {
    console.warn("purgeCacheByTags failed", err);
  }
};

export const purgeCacheByUrls = async (urls) => {
  const env = getCloudflareEnv();
  const zoneId = env.CF_ZONE_ID;
  const token = env.CF_PURGE_TOKEN;
  if (!zoneId || !token || !Array.isArray(urls) || urls.length === 0) return;
  try {
    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: urls }),
      },
    );
  } catch (err) {
    console.warn("purgeCacheByUrls failed", err);
  }
};
