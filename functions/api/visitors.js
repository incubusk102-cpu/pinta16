// /api/visitors — live visitor count and 24h hourly history.
import { initRequestContext } from "./_lib/handler-wrapper.js";
// KV namespace: VISITORS (keys "heartbeats", "history-24h").

import { makeStore } from "./_lib/kv-store.js";
import { getUserAgent } from "./_lib/request-info.js";
import { buildLambdaEvent } from "./_lib/lambda-event.js";

const HEARTBEATS_KEY = "heartbeats";
const HISTORY_KEY = "history-24h";

// Live-window must comfortably exceed the client heartbeat cadence
// (4 min — see useVisitorHeartbeat.ts) so a visitor whose ping is
// late by a few seconds isn't briefly classed as offline. 6 min
// gives a 50% safety margin without making the counter visibly
// stale.
const LIVE_WINDOW_MS = 6 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HISTORY_BUCKETS = 24;
const MAX_HEARTBEATS = 5000;
const MAX_SESSIONS_PER_BUCKET = 5000;

const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|pinterest|whatsapp|telegrambot|discordbot|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|axios|curl\/|wget\/|python-requests/i;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const isBotUserAgent = (ua) => Boolean(ua) && BOT_UA_PATTERN.test(ua);

const readHeartbeats = async (store) => {
  const data = await store.get(HEARTBEATS_KEY, { type: "json" });
  return data && typeof data === "object" ? data : {};
};

const readHistory = async (store) => {
  const data = await store.get(HISTORY_KEY, { type: "json" });
  return Array.isArray(data) ? data : [];
};

const currentBucket = () => Math.floor(Date.now() / HOUR_MS);

const trimHistory = (history) => {
  const cutoff = currentBucket() - HISTORY_BUCKETS;
  return history.filter((entry) => entry.bucket > cutoff);
};

const recordHistoryHit = async (store, sessionId) => {
  const bucket = currentBucket();
  const history = trimHistory(await readHistory(store));
  let entry = history.find((item) => item.bucket === bucket);
  if (!entry) {
    entry = { bucket, sessions: [] };
    history.push(entry);
  }
  if (entry.sessions.includes(sessionId)) return;
  if (entry.sessions.length >= MAX_SESSIONS_PER_BUCKET) return;
  entry.sessions.push(sessionId);
  await store.setJSON(HISTORY_KEY, history);
};

const buildHistoryResponse = (history) => {
  const trimmed = trimHistory(history);
  const byBucket = new Map();
  const uniqueIds = new Set();
  for (const entry of trimmed) {
    byBucket.set(entry.bucket, entry.sessions.length);
    for (const id of entry.sessions) uniqueIds.add(id);
  }
  const now = currentBucket();
  const buckets = [];
  for (let i = HISTORY_BUCKETS - 1; i >= 0; i -= 1) {
    const bucket = now - i;
    buckets.push({
      bucket,
      timestamp: new Date(bucket * HOUR_MS).toISOString(),
      visitors: byBucket.get(bucket) ?? 0,
    });
  }
  return { buckets, unique24h: uniqueIds.size };
};

const handle = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  if (!env.VISITORS) {
    return json(500, { error: "VISITORS KV binding missing" });
  }
  const store = makeStore(env.VISITORS);
  const event = await buildLambdaEvent(request);

  try {
    if (event.httpMethod === "POST") {
      // Note: this endpoint used to consume a RATE_LIMITS KV write per
      // heartbeat. With the client heartbeating every 4 min and the
      // visibility-gated client throttle already in place, the
      // rate-limit was burning ~3 KV writes per heartbeat for no real
      // protection (a scripted attacker would just rotate session ids
      // anyway). Free-tier Workers KV gives 1k writes/day, so the
      // limit was the main thing pushing this site over quota — see
      // useVisitorHeartbeat.ts for the matching client-side change.
      const { sessionId } = parseBody(event.body);
      if (
        !sessionId ||
        typeof sessionId !== "string" ||
        sessionId.length > 64 ||
        !/^[a-zA-Z0-9_-]+$/.test(sessionId)
      ) {
        return json(400, { error: "sessionId required" });
      }
      if (isBotUserAgent(getUserAgent(event))) {
        return json(200, { live: 0, skipped: "bot" });
      }

      const now = Date.now();
      const heartbeats = await readHeartbeats(store);

      // Per-session heartbeat de-dupe. The legitimate client cadence is
      // 4 min (see useVisitorHeartbeat.ts) so a single session id pinging
      // more than once every 30 s is either a stuck retry loop or a
      // scripted attempt to inflate the live counter. Returning the
      // current live count without writing back to KV avoids burning a
      // KV write per spam ping while still keeping the response shape
      // identical for legitimate clients.
      const lastSeen = heartbeats[sessionId];
      if (lastSeen && now - lastSeen < 30_000) {
        const liveNow = Object.values(heartbeats).filter(
          (ts) => now - ts <= LIVE_WINDOW_MS,
        ).length;
        return json(200, { live: liveNow });
      }

      heartbeats[sessionId] = now;

      for (const [id, ts] of Object.entries(heartbeats)) {
        if (now - ts > LIVE_WINDOW_MS) delete heartbeats[id];
      }

      const ids = Object.keys(heartbeats);
      if (ids.length > MAX_HEARTBEATS) {
        const sortedByTimestamp = ids.sort(
          (a, b) => heartbeats[a] - heartbeats[b],
        );
        for (const id of sortedByTimestamp.slice(
          0,
          ids.length - MAX_HEARTBEATS,
        )) {
          delete heartbeats[id];
        }
      }

      await store.setJSON(HEARTBEATS_KEY, heartbeats);
      await recordHistoryHit(store, sessionId);
      return json(200, { live: Object.keys(heartbeats).length });
    }

    if (event.httpMethod === "GET") {
      const now = Date.now();
      const heartbeats = await readHeartbeats(store);
      const live = Object.values(heartbeats).filter(
        (ts) => now - ts <= LIVE_WINDOW_MS,
      ).length;
      const { buckets, unique24h } = buildHistoryResponse(
        await readHistory(store),
      );
      return json(200, { live, history: buckets, unique24h });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("visitors handler error:", error);
    return json(500, { error: "Could not record visitor" });
  }
};

export const onRequestGet = handle;
export const onRequestPost = handle;
