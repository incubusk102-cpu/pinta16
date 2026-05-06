// Turso (libSQL) schema for vector search.
//
// One table — `paintings_vec` — and one DiskANN index. Painting metadata is
// duplicated here so the public similarity endpoint can return enough fields
// to render a card without joining back against KV. The source of truth for
// product data is still the `PRODUCTS` KV namespace (per `AGENTS.md`); rows
// here are derived and rebuildable at any time via the admin "Generate
// embeddings" action.
//
// All statements are idempotent (`CREATE … IF NOT EXISTS`), so applying the
// schema repeatedly is a no-op.

// Embedding dimensionality. `@cf/baai/bge-base-en-v1.5` returns 768 floats.
// If you swap the model, update this AND re-run "Generate embeddings".
export const EMBEDDING_DIMS = 768;

export const TURSO_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS paintings_vec (
    id TEXT PRIMARY KEY,
    title TEXT,
    category TEXT,
    medium TEXT,
    year TEXT,
    price INTEGER,
    sale_price INTEGER,
    availability TEXT,
    image TEXT,
    embedding F32_BLOB(${EMBEDDING_DIMS}),
    embedding_text TEXT,
    embedding_model TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS paintings_vec_idx
   ON paintings_vec (libsql_vector_idx(embedding))`,
];

// The list of columns clients should expect back from a similar-paintings
// query. Kept here so the API and the admin panel agree on the shape.
export const PAINTING_VEC_COLUMNS = [
  "id",
  "title",
  "category",
  "medium",
  "year",
  "price",
  "sale_price",
  "availability",
  "image",
];
