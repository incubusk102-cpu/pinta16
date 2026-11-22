// Workers AI text-embedding helper.
//
// canvhub uses Cloudflare Workers AI's `@cf/baai/bge-base-en-v1.5` model
// (768-dim, free up to 10k Neurons/day) to embed painting metadata for
// semantic similarity. Embeddings live in Turso (`paintings_vec.embedding`,
// `F32_BLOB(768)`); see `_lib/turso.js` and `_lib/turso-schema.js`.
//
// All helpers are null-safe: when the `AI` binding is missing (operator
// hasn't enabled Workers AI on the Pages project yet), `embedText`
// resolves to `null` so the calling endpoint can degrade gracefully
// instead of 500-ing.

import { getCloudflareEnv } from "./context.js";

export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
export const EMBEDDING_DIMS = 768;

export const isWorkersAIAvailable = () => {
  const env = getCloudflareEnv();
  return Boolean(env?.AI);
};

// Build the text we feed to the embedding model from a painting's metadata.
// Order matters a little — the title is the highest-signal field and the
// model attends more strongly to early tokens. Keep the result well below
// the model's 512-token context window.
export const buildPaintingEmbeddingText = (painting) => {
  if (!painting || typeof painting !== "object") return "";
  const parts = [];
  if (painting.title)
    parts.push(`Title: ${String(painting.title).slice(0, 200)}`);
  if (painting.category)
    parts.push(`Category: ${String(painting.category).slice(0, 60)}`);
  if (painting.medium)
    parts.push(`Medium: ${String(painting.medium).slice(0, 60)}`);
  if (painting.year) parts.push(`Year: ${String(painting.year).slice(0, 12)}`);
  if (painting.dimensions)
    parts.push(`Dimensions: ${String(painting.dimensions).slice(0, 60)}`);
  if (painting.description)
    parts.push(`Description: ${String(painting.description).slice(0, 600)}`);
  return parts.join("\n");
};

// Run the model against one or more text inputs. Returns an array of
// Float32-compatible number arrays, or `null` if the binding is missing.
export const embedTexts = async (texts) => {
  const env = getCloudflareEnv();
  if (!env?.AI) return null;
  const cleaned = (Array.isArray(texts) ? texts : [texts])
    .map((t) => (t == null ? "" : String(t)))
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (cleaned.length === 0) return [];
  const result = await env.AI.run(EMBEDDING_MODEL, { text: cleaned });
  const data = result?.data || result?.embeddings || [];
  if (!Array.isArray(data)) return [];
  return data.filter((v) => Array.isArray(v));
};

export const embedText = async (text) => {
  const out = await embedTexts([text]);
  if (!out || !out.length) return null;
  return out[0];
};
