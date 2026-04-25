import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "visitors";
const HEARTBEATS_KEY = "heartbeats";
const HISTORY_KEY = "history-24h";

const LIVE_WINDOW_MS = 5 * 60 * 1000; // 5 min
const HOUR_MS = 60 * 60 * 1000;
const HISTORY_BUCKETS = 24;
const MAX_HEARTBEATS = 5000;

const jsonHeaders = { "Content-Type": "application/json" };

const json = (statusCode, body) => ({
  statusCode,
  headers: jsonHeaders,
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getVisitorsStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

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
  if (!entry.sessions.includes(sessionId)) {
    entry.sessions.push(sessionId);
    await store.setJSON(HISTORY_KEY, history);
  }
};

const buildHistoryResponse = (history) => {
  const trimmed = trimHistory(history);
  const byBucket = new Map();
  for (const entry of trimmed)
    byBucket.set(entry.bucket, entry.sessions.length);
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
  return buckets;
};

export const handler = async (event) => {
  try {
    const store = getVisitorsStore(event);

    if (event.httpMethod === "POST") {
      const { sessionId } = parseBody(event.body);
      if (
        !sessionId ||
        typeof sessionId !== "string" ||
        sessionId.length > 64
      ) {
        return json(400, { error: "sessionId required" });
      }

      const now = Date.now();
      const heartbeats = await readHeartbeats(store);
      heartbeats[sessionId] = now;

      // Drop expired entries.
      for (const [id, ts] of Object.entries(heartbeats)) {
        if (now - ts > LIVE_WINDOW_MS) delete heartbeats[id];
      }

      // Cap memory if a wave of unique sessions floods in.
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
      const history = buildHistoryResponse(await readHistory(store));
      return json(200, { live, history });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("visitors handler error:", error);
    return json(500, { error: "Could not record visitor" });
  }
};
