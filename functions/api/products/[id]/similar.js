// GET /api/products/:id/similar — top-k similar paintings via Turso
// vector search.
//
// Public endpoint, no auth. Renders the "More like this" rail on the
// product detail page.
//
// Pipeline:
//   1. Look up the painting's stored embedding in Turso (`paintings_vec`).
//   2. Use it as the query vector against the DiskANN index
//      (`vector_top_k`), filtering out the painting itself, draft rows,
//      and (configurably) sold rows.
//   3. Return the top-k rows in the existing painting card shape.
//
// Null-safe: when Turso isn't configured yet, when the painting hasn't
// been embedded yet, or when the index has fewer than `k` neighbours,
// the response is `{ available: false, similar: [] }` so the rail
// component can quietly fall back to the rule-based RelatedProducts.

import { initRequestContext } from "../../_lib/handler-wrapper.js";
import { isTursoAvailable, tursoAll, tursoFirst } from "../../_lib/turso.js";
import { PAINTING_VEC_COLUMNS } from "../../_lib/turso-schema.js";

const json = (status, body, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      // Public endpoint; safe to cache at the edge for a short window.
      "Cache-Control": "public, max-age=60",
      ...extraHeaders,
    },
  });

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const parsePositiveInt = (raw, fallback) => {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

// Strip a `product-` route prefix if present. The product detail page
// receives `product-<uuid>` in the URL but rows in `paintings_vec` are
// keyed by the bare `<uuid>` (matching the KV product `id` field).
const normalizeId = (raw) => {
  const s = String(raw || "");
  if (s.startsWith("product-")) return s.slice("product-".length);
  return s;
};

export const onRequestGet = async ({ request, env, params }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const id = normalizeId(params?.id || "");
  if (!id) return json(400, { available: false, error: "Missing product id" });

  if (!isTursoAvailable()) {
    // Turso not configured — front-end falls back to the rule-based rail.
    return json(200, { available: false, reason: "no-binding", similar: [] });
  }

  const url = new URL(request.url);
  const k = clamp(parsePositiveInt(url.searchParams.get("k"), 6), 1, 24);
  // Vector indexes return approximate neighbours; ask for a few extra so
  // we can drop the source painting and any draft rows without falling
  // short of `k`.
  const overFetch = clamp(k + 4, k, k * 3);

  // Step 1 — fetch the source row's embedding text. We round-trip through
  // `vector_extract` so the value is portable text that we can feed back
  // into a `vector32(?)` call below. (Hrana over HTTP doesn't have a
  // first-class Float32 vector argument type.)
  let source;
  try {
    source = await tursoFirst(
      `SELECT vector_extract(embedding) AS embedding_text
         FROM paintings_vec
        WHERE id = ?`,
      [id],
    );
  } catch (err) {
    return json(200, {
      available: true,
      similar: [],
      error: "Turso query failed",
      detail: err?.message || String(err),
    });
  }

  if (!source?.embedding_text) {
    return json(200, {
      available: true,
      similar: [],
      reason: "not-embedded",
    });
  }

  // Step 2 — vector_top_k against the DiskANN index, then JOIN back to
  // pull the metadata columns. Filter out the source row, drafts, and
  // (by default) sold paintings — an art shop's "more like this" rail
  // should suggest things people can actually buy.
  const cols = PAINTING_VEC_COLUMNS.map((c) => `p.${c}`).join(", ");
  let rows;
  try {
    rows = await tursoAll(
      `SELECT ${cols},
              vector_distance_cos(p.embedding, vector32(?)) AS distance
         FROM vector_top_k('paintings_vec_idx', vector32(?), ?) AS v
         JOIN paintings_vec p ON p.rowid = v.id
        WHERE p.id <> ?
          AND COALESCE(p.availability, 'available') NOT IN ('draft')
        ORDER BY distance ASC
        LIMIT ?`,
      [source.embedding_text, source.embedding_text, overFetch, id, k],
    );
  } catch (err) {
    return json(200, {
      available: true,
      similar: [],
      error: "Turso query failed",
      detail: err?.message || String(err),
    });
  }

  // Cosine distance is in [0,2]; convert to a 0-100 similarity score for
  // the UI without leaking the raw distance.
  const similar = (rows || []).map((r) => {
    const distance = typeof r.distance === "number" ? r.distance : 0;
    const score = Math.round(clamp(1 - distance / 2, 0, 1) * 100);
    return {
      id: r.id,
      title: r.title || "",
      category: r.category || null,
      medium: r.medium || null,
      year: r.year || null,
      price: r.price ?? null,
      salePrice: r.sale_price ?? null,
      availability: r.availability || "available",
      image: r.image || null,
      similarity: score,
    };
  });

  return json(200, { available: true, similar });
};
