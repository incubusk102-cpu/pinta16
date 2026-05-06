// /api/admin/turso — Turso (libSQL) status, schema bootstrap, and one-shot
// embedding backfill. Mirrors the `/api/admin/d1` pattern.
//
// GET  ?action=status        → Turso configured? Schema applied? Row count.
// POST ?action=apply-schema  → Idempotent CREATE TABLE / INDEX.
// POST ?action=embed-all     → Walk PRODUCTS KV, embed each painting via
//                              Workers AI, upsert into `paintings_vec`.
//
// All actions require admin auth (same session cookie as the rest of /admin).

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import {
  isTursoAvailable,
  tursoBatch,
  tursoExecute,
  tursoFirst,
  vectorToText,
} from "../_lib/turso.js";
import {
  TURSO_SCHEMA_STATEMENTS,
  EMBEDDING_DIMS,
} from "../_lib/turso-schema.js";
import {
  EMBEDDING_MODEL,
  buildPaintingEmbeddingText,
  embedTexts,
  isWorkersAIAvailable,
} from "../_lib/embeddings.js";
import { getStore } from "../_lib/kv-stores.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const requireAdmin = async (request) => {
  const headers = Object.fromEntries(request.headers.entries());
  const ok = await isAuthenticated({ headers });
  return ok ? null : json(401, { error: "Not authenticated" });
};

const PRODUCTS_KEY = "all-products";

// ─── GET ───────────────────────────────────────────────────────────────────────

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";

  if (action !== "status") {
    return json(400, { error: `Unknown action: ${action}` });
  }

  if (!isTursoAvailable()) {
    return json(200, {
      available: false,
      schemaApplied: false,
      workersAi: isWorkersAIAvailable(),
      embeddingModel: EMBEDDING_MODEL,
      embeddingDims: EMBEDDING_DIMS,
      message:
        "Turso not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Cloudflare Pages → Settings → Environment variables.",
    });
  }

  // Probe sqlite_master for the expected table.
  let tableRow = null;
  let probeError = null;
  try {
    tableRow = await tursoFirst(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
      ["paintings_vec"],
    );
  } catch (err) {
    probeError = err?.message || String(err);
  }

  if (probeError) {
    return json(200, {
      available: true,
      schemaApplied: false,
      workersAi: isWorkersAIAvailable(),
      embeddingModel: EMBEDDING_MODEL,
      embeddingDims: EMBEDDING_DIMS,
      message: `Turso reachable, but probe failed: ${probeError}`,
    });
  }

  if (!tableRow) {
    return json(200, {
      available: true,
      schemaApplied: false,
      workersAi: isWorkersAIAvailable(),
      embeddingModel: EMBEDDING_MODEL,
      embeddingDims: EMBEDDING_DIMS,
      message:
        "Turso connected. Tables missing — POST /api/admin/turso?action=apply-schema to bootstrap.",
    });
  }

  let counts = { paintings_vec: 0, embedded: 0 };
  try {
    const total = await tursoFirst(`SELECT COUNT(*) AS cnt FROM paintings_vec`);
    const embedded = await tursoFirst(
      `SELECT COUNT(*) AS cnt FROM paintings_vec WHERE embedding IS NOT NULL`,
    );
    counts = {
      paintings_vec: total?.cnt ?? 0,
      embedded: embedded?.cnt ?? 0,
    };
  } catch {
    // Counts are nice-to-have; don't fail the status call if they error.
  }

  return json(200, {
    available: true,
    schemaApplied: true,
    workersAi: isWorkersAIAvailable(),
    embeddingModel: EMBEDDING_MODEL,
    embeddingDims: EMBEDDING_DIMS,
    counts,
  });
};

// ─── POST ──────────────────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;

  if (!isTursoAvailable()) {
    return json(503, {
      error:
        "Turso not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.",
    });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  if (action === "apply-schema") {
    try {
      await tursoBatch(TURSO_SCHEMA_STATEMENTS);
    } catch (err) {
      return json(500, {
        error: "Failed to apply schema",
        detail: err?.message || String(err),
      });
    }
    return json(200, {
      success: true,
      statementsExecuted: TURSO_SCHEMA_STATEMENTS.length,
    });
  }

  if (action === "embed-all") {
    if (!isWorkersAIAvailable()) {
      return json(503, {
        error:
          'Workers AI binding (env.AI) not available. Add `[ai] binding = "AI"` to wrangler.toml and redeploy.',
      });
    }

    let products;
    try {
      const store = getStore("products");
      const raw = await store.get(PRODUCTS_KEY, { type: "json" });
      products = Array.isArray(raw) ? raw : [];
    } catch (err) {
      return json(500, {
        error: "Failed to read PRODUCTS KV",
        detail: err?.message || String(err),
      });
    }

    // Embeddable rows: anything with at least a title.
    const rows = products
      .filter((p) => p && p.id && p.title)
      .map((p) => ({
        id: String(p.id),
        title: p.title,
        category: p.category || null,
        medium: p.medium || null,
        year: p.year ? String(p.year) : null,
        price: typeof p.price === "number" ? Math.round(p.price) : null,
        salePrice:
          typeof p.salePrice === "number" ? Math.round(p.salePrice) : null,
        availability: p.availability || "available",
        image: p.image || null,
        embeddingText: buildPaintingEmbeddingText(p),
      }))
      .filter((r) => r.embeddingText.length > 0);

    if (!rows.length) {
      return json(200, {
        success: true,
        total: 0,
        embedded: 0,
        message: "No embeddable paintings found in PRODUCTS KV.",
      });
    }

    // Workers AI accepts batched text; chunk to keep payloads small and
    // stay under the 1-minute Pages Functions request budget.
    const BATCH = 16;
    let embedded = 0;
    const errors = [];
    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      let vectors;
      try {
        vectors = await embedTexts(chunk.map((r) => r.embeddingText));
      } catch (err) {
        errors.push({
          batchStart: i,
          reason: err?.message || String(err),
        });
        continue;
      }
      if (!vectors || vectors.length !== chunk.length) {
        errors.push({
          batchStart: i,
          reason: `Expected ${chunk.length} embeddings, got ${vectors?.length ?? 0}`,
        });
        continue;
      }

      // One pipeline call per chunk: chunk.length upserts in a single round-trip.
      const stmts = chunk.map((row, idx) => ({
        sql: `INSERT INTO paintings_vec (
                 id, title, category, medium, year, price, sale_price,
                 availability, image, embedding, embedding_text,
                 embedding_model, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, vector32(?), ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 title           = excluded.title,
                 category        = excluded.category,
                 medium          = excluded.medium,
                 year            = excluded.year,
                 price           = excluded.price,
                 sale_price      = excluded.sale_price,
                 availability    = excluded.availability,
                 image           = excluded.image,
                 embedding       = excluded.embedding,
                 embedding_text  = excluded.embedding_text,
                 embedding_model = excluded.embedding_model,
                 updated_at      = excluded.updated_at`,
        args: [
          row.id,
          row.title,
          row.category,
          row.medium,
          row.year,
          row.price,
          row.salePrice,
          row.availability,
          row.image,
          vectorToText(vectors[idx]),
          row.embeddingText,
          EMBEDDING_MODEL,
          now,
        ],
      }));

      try {
        await tursoBatch(stmts);
        embedded += chunk.length;
      } catch (err) {
        errors.push({
          batchStart: i,
          reason: err?.message || String(err),
        });
      }
    }

    return json(200, {
      success: true,
      total: rows.length,
      embedded,
      failed: rows.length - embedded,
      errors: errors.length ? errors.slice(0, 10) : undefined,
      embeddingModel: EMBEDDING_MODEL,
      embeddingDims: EMBEDDING_DIMS,
    });
  }

  if (action === "clear") {
    try {
      const result = await tursoExecute(`DELETE FROM paintings_vec`);
      return json(200, {
        success: true,
        deleted: result?.affectedRowCount ?? 0,
      });
    } catch (err) {
      return json(500, {
        error: "Failed to clear paintings_vec",
        detail: err?.message || String(err),
      });
    }
  }

  return json(400, { error: `Unknown action: ${action}` });
};
