# Backup & recovery

All persistent state on canvhub.com lives in Cloudflare KV namespaces
(`wrangler.toml`, `[[kv_namespaces]]` blocks). KV gives us low latency
and global replication but **no built-in point-in-time recovery** — if
a namespace is accidentally cleared (admin mistake, ID typo,
automation bug), Cloudflare cannot restore it.

This document covers the off-site backup pipeline that closes that
gap, and the procedure for restoring data from a backup.

## Architecture

```
┌─────────────────────────┐  scheduled cron 02:00 UTC
│ GitHub Action           │ ───────────────────────────────────┐
│ .github/workflows       │                                    │
│ /backup.yml             │                                    ▼
└─────────────────────────┘                       ┌────────────────────────────┐
                                                  │ canvhub.com                │
                                                  │ /api/admin/export-backup   │
                                                  │   bearer-auth: BACKUP_TOKEN│
                                                  │   reads each KV namespace  │
                                                  │   streams NDJSON           │
                                                  └─────────────┬──────────────┘
                                                                │
                                ┌───────────────────────────────┴──┐
                                ▼                                  ▼
                    ┌────────────────────────┐         ┌────────────────────────┐
                    │ GitHub Actions artefact│         │ R2: canvhub-backups    │
                    │ canvhub-backup-<TS>    │         │ canvhub-backup-<TS>.gz │
                    │ retained 90 days       │         │ off-site cold storage  │
                    └────────────────────────┘         └────────────────────────┘
```

The endpoint dumps the namespaces that contain irreplaceable
business data. High-churn ephemeral namespaces are deliberately
**excluded** because backing them up is pointless and restoring them
would create more problems than it solves:

| Namespace            | Backed up? | Reason                                    |
|----------------------|:---------:|--------------------------------------------|
| `PRODUCTS`           | yes       | Catalogue. Source of truth.                |
| `ORDERS`             | yes       | Transactions. Irreplaceable.               |
| `CUSTOMER_META`      | yes       | Contact info, opt-ins.                     |
| `USERS`              | yes       | Customer profiles.                         |
| `AUDIT_LOG`          | yes       | Compliance, dispute history.               |
| `REVIEWS`            | yes       | User-generated content.                    |
| `NEWSLETTER`         | yes       | Mailing list, opt-ins.                     |
| `POLICIES`           | yes       | Legal text (terms, privacy, refund).       |
| `STOREFRONT_CONFIG`  | yes       | Hero copy, site flags.                     |
| `HERO_SLIDES`        | yes       | Slider configuration.                      |
| `CHAT_THREADS`       | yes       | Customer support history.                  |
| `SECURITY_CONFIG`    | yes       | Rate-limit overrides, IP block-list.       |
| `VISITORS`           | no        | Heartbeats / 24h history; regenerable.     |
| `RATE_LIMITS`        | no        | Token buckets; transient.                  |
| `ADMIN_AUTH`         | no        | Stale credentials would lock you out of recovery. Reset via `/admin → Initialise` if lost. |

Adjust the list in `BACKUP_NAMESPACES` at the top of
`functions/api/admin/export-backup.js` if you add new namespaces.

## One-time setup

You need to do this **once** before the cron actually saves anything.

### 1. Generate a long random `BACKUP_TOKEN`

On your local machine:

```bash
openssl rand -hex 32
```

Copy the resulting 64-character hex string — you'll paste it twice.

### 2. Set it on the Cloudflare Pages project

`Cloudflare dashboard → Workers & Pages → canvhub → Settings →
Environment variables → Production → Add variable`

| Variable name | Value | Encrypt |
|---|---|---|
| `BACKUP_TOKEN` | (the token from step 1) | yes |

Click **Save and Deploy**. Without this variable the endpoint returns
`503 BACKUP_TOKEN is not configured`.

### 3. Add the matching GitHub Actions secret

`Repo → Settings → Secrets and variables → Actions → New repository secret`

| Name | Value |
|---|---|
| `BACKUP_TOKEN` | (same token) |

### 4. (Optional) wire up R2 cold storage

This step is optional — if you skip it, backups still land in GitHub
Actions artefacts and you have 90 days of recovery window. R2 lets
you keep dumps indefinitely and recover them without depending on
GitHub.

1. Create the bucket:
   `Cloudflare dashboard → R2 → Create bucket → name canvhub-backups`.
2. Create an API token with R2 write access:
   `Cloudflare profile → API tokens → Create token →
    "Custom token" → "Workers R2 Storage: Edit"` (account-scoped).
3. Add two repo secrets:
   - `BACKUP_R2_TOKEN` — the API token from step 2.
   - `CLOUDFLARE_ACCOUNT_ID` — already present if `deploy.yml` is set up.
4. (Optional) override the bucket name with a repo variable
   `BACKUP_R2_BUCKET` if you used a name other than `canvhub-backups`.

The `Push to R2` step in the workflow auto-skips when
`BACKUP_R2_TOKEN` is missing, so the workflow stays green even with
just the Actions-artifact path enabled.

### 5. Trigger a manual run to verify

`Repo → Actions → Nightly KV backup → Run workflow → Run workflow`.

It should complete in 1–10 minutes depending on KV size. Download
the artefact, `gunzip` it, and confirm it contains entries for each
namespace.

## Verifying a backup

```bash
# Decompress and count entries per namespace.
gunzip -c canvhub-backup-2026-05-03.ndjson.gz \
  | jq -c 'select(.key) | .namespace' \
  | sort | uniq -c | sort -rn
```

A healthy dump has thousands of entries for `ORDERS`, hundreds for
most others. The first and last lines of the file should be the
`startedAt` / `finishedAt` markers.

## Restoring a namespace

**Stop the bleeding first.** If the loss is from a runaway script,
disable the script before restoring or you'll just lose the data
again. If from a compromised admin, rotate `BACKUP_TOKEN` and the
admin password before going further.

### 1. Pick a backup

Either grab the most recent artefact from `Actions → Nightly KV
backup`, or download from R2:

```bash
npx wrangler r2 object get canvhub-backups/canvhub-backup-2026-05-02.ndjson.gz \
  --file canvhub-backup.ndjson.gz
```

### 2. Filter to the namespace you need to restore

```bash
gunzip -c canvhub-backup.ndjson.gz \
  | jq -c 'select(.namespace == "ORDERS" and .key)' \
  > restore-orders.ndjson
```

### 3. Convert to wrangler bulk-put format

`wrangler kv:bulk put` expects a JSON array of `{key, value, …}`:

```bash
jq -s 'map({key: .key, value: .value})' restore-orders.ndjson \
  > restore-orders.json
```

### 4. Replay into the namespace

Look up the namespace ID from `wrangler.toml` (`[[kv_namespaces]]` →
the ORDERS block). Then:

```bash
npx wrangler kv:bulk put --namespace-id 84646326b4a04e5c88e4fbb18d87969d \
  restore-orders.json
```

`kv:bulk put` is idempotent — replaying the same data twice is a
no-op for keys whose values match. If a key has been modified since
the backup, the wrangler write **overwrites** the current value
unconditionally. There is no merge step. If you only want to
restore *missing* keys, pre-filter the file to drop keys that
already exist (e.g. `wrangler kv:key list` + diff).

## Recovering a single key

For "I deleted one product, please put it back":

```bash
gunzip -c canvhub-backup.ndjson.gz \
  | jq -r 'select(.namespace == "PRODUCTS" and .key == "all-products") | .value' \
  > products.json

npx wrangler kv:key put --namespace-id a892c12dd94048669dbd1cd8f77ef031 \
  all-products "$(cat products.json)"
```

## Rotating `BACKUP_TOKEN`

Treat the token like any other long-lived credential:

1. Generate a new token: `openssl rand -hex 32`.
2. Update the value on the Cloudflare Pages project (Settings →
   Environment variables → BACKUP_TOKEN). Trigger a redeploy or wait
   for the next push.
3. Update the matching GitHub Actions secret with the new value.
4. Manually run `Nightly KV backup` to confirm the new token works.

The endpoint uses constant-time comparison so the rotation window is
safe even with concurrent requests.

## Failure modes & monitoring

The workflow fails loudly when:

- `BACKUP_TOKEN` is missing or wrong (HTTP 401/503).
- The dump is truncated mid-stream (no `finishedAt` marker).
- R2 upload is enabled but the token lost permission.

GitHub emails the repo owner on workflow failure by default. Add
yourself / a shared address to `Settings → Notifications` if you
want richer alerting.
