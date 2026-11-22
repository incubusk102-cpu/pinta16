// Per-request Cloudflare context. Pages Functions don't pass `env` into nested
// helpers the way Netlify Lambdas exposed `connectLambda(event)`, so we stash
// it on a module-scoped slot at the start of every onRequest call. Helpers
// (admin-auth, audit-log, rate-limit, email, etc.) read from here so we don't
// have to rewrite hundreds of call sites that originally took just `event`.
//
// This is safe because Pages Functions process one request at a time per
// isolate, and even when an isolate handles concurrent requests the `env`
// is identical across them (it's set once at deploy time).

let currentEnv = null;

export const setCloudflareContext = (env) => {
  currentEnv = env || null;
};

export const getCloudflareEnv = () => currentEnv || {};

export const requireKvBinding = (name) => {
  const env = getCloudflareEnv();
  const kv = env?.[name];
  if (!kv) {
    throw new Error(`Missing KV binding: ${name}`);
  }
  return kv;
};
