// Turso (libSQL) HTTP client for vector search.
//
// Mirrors the null-safe pattern used by `_lib/d1.js`: when the `TURSO_*` env
// vars are not configured (the operator hasn't done the 5-minute Turso
// signup yet), every helper returns `null` / a no-op so the rest of the API
// keeps working unchanged. The "More like this" rail just doesn't render.
//
// Turso lives outside Cloudflare and is intentionally limited to one job:
// **native vector search** for similar-painting recommendations. All other
// persistence still goes through KV (source of truth) + D1 (relational
// mirror), per `AGENTS.md`. See the carve-out note in that file.
//
// We hand-roll the libSQL HTTP `/v2/pipeline` protocol rather than pulling
// in `@libsql/client` (~200 KB unpacked) — the surface we actually need is
// tiny (`execute`, `batch`, `close`) and `AGENTS.md` discourages heavy deps
// when a few lines of fetch suffice.

import { getCloudflareEnv } from "./context.js";

const PIPELINE_PATH = "/v2/pipeline";

// libSQL: the Turso "DATABASE_URL" is `libsql://<host>` (or `https://<host>`).
// The Hrana-over-HTTP API lives at `https://<host>` regardless.
const httpBase = (databaseUrl) => {
  if (!databaseUrl) return null;
  const trimmed = String(databaseUrl).trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (trimmed.startsWith("libsql://"))
    return "https://" + trimmed.slice("libsql://".length);
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
    return trimmed;
  return "https://" + trimmed;
};

const tursoConfig = () => {
  const env = getCloudflareEnv();
  const url = env?.TURSO_DATABASE_URL;
  const token = env?.TURSO_AUTH_TOKEN;
  if (!url || !token) return null;
  const base = httpBase(url);
  if (!base) return null;
  return { base, token: String(token).trim() };
};

export const isTursoAvailable = () => Boolean(tursoConfig());

// Convert a JS value into the Hrana-over-HTTP arg envelope.
// We support the four types the canvhub use case actually needs.
const toArg = (value) => {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : { type: "float", value };
  }
  if (typeof value === "bigint")
    return { type: "integer", value: String(value) };
  if (typeof value === "boolean")
    return { type: "integer", value: value ? "1" : "0" };
  if (value instanceof Uint8Array) {
    let bin = "";
    for (let i = 0; i < value.length; i++) bin += String.fromCharCode(value[i]);
    return { type: "blob", base64: btoa(bin) };
  }
  return { type: "text", value: String(value) };
};

// Convert a Hrana row value back into a plain JS value.
const fromValue = (v) => {
  if (!v || typeof v !== "object") return v;
  switch (v.type) {
    case "null":
      return null;
    case "integer":
      // libSQL integers come back as strings to preserve i64 precision.
      // Coerce to Number for display values; callers that care about
      // big integers can read the raw string off the row.
      return v.value == null ? null : Number(v.value);
    case "float":
      return typeof v.value === "number" ? v.value : Number(v.value);
    case "text":
      return v.value ?? null;
    case "blob":
      return v.base64 ?? null;
    default:
      return v.value ?? null;
  }
};

const rowToObject = (cols, rowValues) => {
  const out = {};
  for (let i = 0; i < cols.length; i++) {
    const name = cols[i]?.name || `col${i}`;
    out[name] = fromValue(rowValues[i]);
  }
  return out;
};

// Run one or more statements in a single HTTP round-trip. Each statement
// can be either a plain SQL string or `{ sql, args }`. Returns an array
// of `{ rows, cols, affectedRowCount, lastInsertRowId }` results aligned
// with the input statements.
export const tursoBatch = async (statements) => {
  const cfg = tursoConfig();
  if (!cfg) return null;
  const stmts = Array.isArray(statements) ? statements : [statements];
  if (!stmts.length) return [];

  const requests = stmts.map((s) => {
    const sql = typeof s === "string" ? s : s.sql;
    const args = typeof s === "string" ? [] : s.args || [];
    return {
      type: "execute",
      stmt: { sql, args: args.map(toArg) },
    };
  });
  requests.push({ type: "close" });

  let res;
  try {
    res = await fetch(cfg.base + PIPELINE_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });
  } catch (err) {
    throw new Error(`Turso fetch failed: ${err?.message || String(err)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Turso HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const body = await res.json();
  const out = [];
  const results = Array.isArray(body?.results) ? body.results : [];
  // The trailing `close` request also lands in `results`; ignore it.
  for (let i = 0; i < requests.length - 1; i++) {
    const r = results[i];
    if (!r) {
      out.push(null);
      continue;
    }
    if (r.type === "error") {
      const msg = r?.error?.message || "Turso execute error";
      throw new Error(msg);
    }
    const exec = r?.response?.result;
    if (!exec) {
      out.push({
        rows: [],
        cols: [],
        affectedRowCount: 0,
        lastInsertRowId: null,
      });
      continue;
    }
    const cols = exec.cols || [];
    const rows = (exec.rows || []).map((row) => rowToObject(cols, row));
    out.push({
      rows,
      cols: cols.map((c) => c?.name || ""),
      affectedRowCount: exec.affected_row_count ?? 0,
      lastInsertRowId: exec.last_insert_rowid ?? null,
    });
  }
  return out;
};

export const tursoExecute = async (sql, args = []) => {
  const cfg = tursoConfig();
  if (!cfg) return null;
  const results = await tursoBatch([{ sql, args }]);
  return results?.[0] ?? null;
};

export const tursoAll = async (sql, args = []) => {
  const result = await tursoExecute(sql, args);
  return result?.rows || [];
};

export const tursoFirst = async (sql, args = []) => {
  const rows = await tursoAll(sql, args);
  return rows[0] || null;
};

// Encode a Float32 vector as the text form `vector32` accepts:
//   `[0.123, -0.456, …]`
// Six significant digits is plenty for cosine similarity with normalised
// 768-dim embeddings and keeps the on-the-wire size reasonable.
export const vectorToText = (vec) => {
  if (!vec || !vec.length) return "[]";
  const parts = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const n = Number(vec[i]);
    parts[i] = Number.isFinite(n) ? n.toFixed(6) : "0";
  }
  return "[" + parts.join(",") + "]";
};
