// Thin adapter that gives a Cloudflare KV namespace the small slice of the
// Netlify Blobs API the rest of the codebase expects. The shape is intentionally
// limited to what we use: get / setJSON / set / delete / list, plus a CAS-shim
// for getWithMetadata + onlyIfMatch / onlyIfNew.
//
// KV does NOT support real CAS, so the conditional writes here are best-effort:
// they re-read before writing and bail if the underlying value changed since
// the previous read. That's a narrower window than true CAS, but on a small
// site with few concurrent admin writers it is sufficient. For the cases that
// actually need strong consistency (admin credentials, audit log), code
// callers can still rely on the "read-before-write + bail-on-mismatch" loop
// that Netlify Blobs callers already use.

const stableHash = async (value) => {
  if (value == null) return null;
  const data = new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const makeStore = (kv) => {
  if (!kv) {
    throw new Error("kv-store: missing KV namespace binding");
  }

  return {
    async get(key, opts = {}) {
      const type = opts.type || "text";
      if (type === "json") {
        const text = await kv.get(key, "text");
        if (text == null) return null;
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }
      if (type === "arrayBuffer") return kv.get(key, "arrayBuffer");
      if (type === "stream") return kv.get(key, "stream");
      return kv.get(key, "text");
    },

    async getWithMetadata(key, opts = {}) {
      const type = opts.type || "text";
      const raw = await kv.get(key, type === "json" ? "text" : type);
      if (raw == null) return { data: null, etag: null, metadata: null };
      let data = raw;
      if (type === "json") {
        try {
          data = JSON.parse(raw);
        } catch {
          data = null;
        }
      }
      const etag = await stableHash(raw);
      return { data, etag, metadata: null };
    },

    async set(key, value, opts = {}) {
      if (opts.onlyIfNew) {
        const existing = await kv.get(key, "text");
        if (existing != null) return { modified: false };
        await kv.put(key, value);
        return { modified: true };
      }
      if (opts.onlyIfMatch !== undefined) {
        const current = await kv.get(key, "text");
        const currentEtag = await stableHash(current);
        if (currentEtag !== opts.onlyIfMatch) return { modified: false };
        await kv.put(key, value);
        return { modified: true };
      }
      await kv.put(key, value);
      return { modified: true };
    },

    async setJSON(key, value, opts = {}) {
      return this.set(key, JSON.stringify(value), opts);
    },

    async delete(key) {
      await kv.delete(key);
    },

    async list(opts = {}) {
      const result = await kv.list({
        prefix: opts.prefix,
        cursor: opts.cursor,
        limit: opts.limit,
      });
      return {
        blobs: (result.keys || []).map((k) => ({ key: k.name })),
        cursor: result.list_complete ? undefined : result.cursor,
      };
    },

    async getMetadata() {
      // KV does not separate value from metadata for our use cases.
      return null;
    },
  };
};
