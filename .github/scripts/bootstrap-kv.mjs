// Bootstraps Cloudflare KV namespaces declared in wrangler.toml and rewrites
// placeholder IDs (REPLACE_WITH_<BINDING>_KV_ID and
// REPLACE_WITH_<BINDING>_KV_PREVIEW_ID) with the real IDs returned by
// `wrangler kv namespace create`.
//
// Idempotent: only creates a namespace if the placeholder for that binding is
// still present. Existing real IDs are left untouched. Re-runs are safe.
//
// Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars (set by the
// workflow). The token must include "Workers KV Storage → Edit".

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const WRANGLER_TOML = "wrangler.toml";

const original = readFileSync(WRANGLER_TOML, "utf8");
let updated = original;
const created = [];

// Parse all kv_namespaces blocks from wrangler.toml. We don't use a TOML
// library because we want to preserve formatting and comments — only the
// placeholder ID strings are rewritten in place.
const blockRegex =
  /\[\[kv_namespaces\]\]\s*\nbinding\s*=\s*"([A-Z_]+)"\s*\nid\s*=\s*"([^"]+)"\s*\npreview_id\s*=\s*"([^"]+)"/g;

const blocks = [];
let match;
while ((match = blockRegex.exec(original)) !== null) {
  blocks.push({
    binding: match[1],
    id: match[2],
    previewId: match[3],
  });
}

if (blocks.length === 0) {
  console.error("No [[kv_namespaces]] blocks found in wrangler.toml.");
  process.exit(1);
}

console.log(`Found ${blocks.length} kv_namespaces blocks.`);

const PROJECT_PREFIX = "canvhub";

const bindingToNamespaceName = (binding) =>
  `${PROJECT_PREFIX}-${binding.toLowerCase().replace(/_/g, "-")}`;

const runWrangler = (args) => {
  console.log(`$ npx wrangler ${args.join(" ")}`);
  const result = spawnSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`wrangler ${args.join(" ")} failed (exit ${result.status})`);
  }
  return result.stdout + "\n" + result.stderr;
};

// `wrangler kv namespace create <NAME>` outputs (among other things):
//   id = "1a2b3c..."
// `--preview` variant outputs `preview_id = "..."`. The same regex catches both.
const extractId = (output, key) => {
  const re = new RegExp(`${key}\\s*=\\s*"([0-9a-f]+)"`);
  const m = output.match(re);
  if (!m) {
    console.error(output);
    throw new Error(`Could not parse ${key} from wrangler output.`);
  }
  return m[1];
};

// Both the production and preview placeholders use the same shape:
// REPLACE_WITH_<BINDING>_KV_ID or REPLACE_WITH_<BINDING>_KV_PREVIEW_ID.
const isPlaceholder = (value) => /^REPLACE_WITH_/.test(value);

for (const block of blocks) {
  const name = bindingToNamespaceName(block.binding);

  if (isPlaceholder(block.id)) {
    const out = runWrangler(["kv", "namespace", "create", name]);
    const realId = extractId(out, "id");
    updated = updated.replace(block.id, realId);
    created.push({ binding: block.binding, kind: "production", name, id: realId });
    console.log(`✓ ${block.binding} (production) → ${realId}`);
  } else {
    console.log(`— ${block.binding} (production) already real, skipping.`);
  }

  if (isPlaceholder(block.previewId)) {
    const out = runWrangler([
      "kv",
      "namespace",
      "create",
      name,
      "--preview",
    ]);
    const realPreviewId = extractId(out, "preview_id");
    updated = updated.replace(block.previewId, realPreviewId);
    created.push({
      binding: block.binding,
      kind: "preview",
      name: `${name}_preview`,
      id: realPreviewId,
    });
    console.log(`✓ ${block.binding} (preview) → ${realPreviewId}`);
  } else {
    console.log(`— ${block.binding} (preview) already real, skipping.`);
  }
}

if (updated === original) {
  console.log("No placeholders left in wrangler.toml — nothing to do.");
  process.exit(0);
}

writeFileSync(WRANGLER_TOML, updated, "utf8");

console.log(`\nWrote ${created.length} new namespace IDs to wrangler.toml:`);
for (const c of created) {
  console.log(`  - ${c.binding} (${c.kind}): ${c.name} = ${c.id}`);
}

// Append a summary visible in the workflow run UI.
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const lines = [
    "# Created KV namespaces",
    "",
    "| Binding | Kind | Namespace name | ID |",
    "| --- | --- | --- | --- |",
    ...created.map(
      (c) => `| \`${c.binding}\` | ${c.kind} | \`${c.name}\` | \`${c.id}\` |`,
    ),
  ];
  writeFileSync(summaryPath, lines.join("\n") + "\n", { flag: "a" });
}
