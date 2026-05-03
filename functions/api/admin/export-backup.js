// /api/admin/export-backup — full KV-namespace dump for off-site backup.
//
// Streams every key/value in every business KV namespace as NDJSON
// (one JSON object per line). Designed to be called nightly by a
// GitHub Action which saves the response to a build artefact (and
// optionally to R2).
//
// Auth: a long-lived bearer token from `env.BACKUP_TOKEN`. Set it
// once in Cloudflare Pages → Settings → Environment variables, then
// copy the same value into the GitHub repo's Actions secrets as
// `BACKUP_TOKEN`. The admin login flow is NOT used because backups
// run unattended; a static token avoids the 7-day session-expiry.
//
// The endpoint uses constant-time comparison and refuses to run when
// `BACKUP_TOKEN` is unset, so accidentally deploying without the
// secret can't expose data.
//
// Response shape (NDJSON, one object per line):
//   {"meta":{"namespace":"ORDERS","keys":1234,"startedAt":"…"}}   ← header line
//   {"namespace":"ORDERS","key":"order-abc","value":"…"}          ← entry lines
//   {"namespace":"ORDERS","key":"order-def","value":"…"}
//   {"meta":{"namespace":"ORDERS","done":true,"emitted":1234}}    ← per-ns footer
//   …
//   {"meta":{"finishedAt":"…","totalEntries":N}}                  ← final line
//
// To restore a namespace, extract the entries for it and replay them
// with `wrangler kv:bulk put` (see docs/backup-recovery.md).

import { initRequestContext } from "../_lib/handler-wrapper.js";

// Namespaces that contain irreplaceable / business-critical data.
// Order matters only for log readability; the dump is independent
// per-namespace so a partial failure on one doesn't poison the others.
const BACKUP_NAMESPACES = [
  "PRODUCTS",
  "ORDERS",
  "CUSTOMER_META",
  "USERS",
  "AUDIT_LOG",
  "REVIEWS",
  "NEWSLETTER",
  "POLICIES",
  "STOREFRONT_CONFIG",
  "HERO_SLIDES",
  "CHAT_THREADS",
  "SECURITY_CONFIG",
  // Intentionally excluded — high-churn ephemeral data, regenerable:
  //   VISITORS      (heartbeats / 24h history)
  //   RATE_LIMITS   (token buckets)
  //   ADMIN_AUTH    (rotates on password change; restoring stale
  //                 credentials would lock you out of recovery)
];

const utf8 = new TextEncoder();

const constantTimeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const extractBearer = (request) => {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
};

const jsonError = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

// Page through a KV namespace, yielding entries one at a time. We
// fetch values one by one rather than batching because Cloudflare KV
// has no bulk-read API and the per-key reads are cached at the edge.
async function* iterateNamespace(kv) {
  let cursor;
  do {
    const page = await kv.list({ cursor, limit: 1000 });
    for (const meta of page.keys || []) {
      const value = await kv.get(meta.name, "text");
      if (value != null) {
        yield { key: meta.name, value };
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const expected = env.BACKUP_TOKEN;
  if (!expected) {
    return jsonError(503, {
      error:
        "BACKUP_TOKEN is not configured. Set it in Cloudflare Pages → Environment variables.",
    });
  }
  const supplied = extractBearer(request);
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    return jsonError(401, { error: "Unauthorized" });
  }

  const startedAt = new Date().toISOString();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj) =>
        controller.enqueue(utf8.encode(JSON.stringify(obj) + "\n"));

      try {
        write({ meta: { startedAt, namespaces: BACKUP_NAMESPACES } });

        let totalEntries = 0;

        for (const namespace of BACKUP_NAMESPACES) {
          const kv = env[namespace];
          if (!kv) {
            write({ meta: { namespace, skipped: "binding-missing" } });
            continue;
          }

          write({
            meta: {
              namespace,
              startedAt: new Date().toISOString(),
            },
          });

          let emitted = 0;
          try {
            for await (const { key, value } of iterateNamespace(kv)) {
              write({ namespace, key, value });
              emitted += 1;
            }
            write({ meta: { namespace, done: true, emitted } });
          } catch (err) {
            write({
              meta: {
                namespace,
                error: err?.message || String(err),
                emitted,
              },
            });
          }

          totalEntries += emitted;
        }

        write({
          meta: {
            finishedAt: new Date().toISOString(),
            totalEntries,
          },
        });
      } catch (err) {
        write({ meta: { fatal: err?.message || String(err) } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      // application/x-ndjson is the conventional MIME for line-
      // delimited JSON. CDN/buffering proxies generally leave it
      // alone; clients can stream-parse line-by-line.
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
