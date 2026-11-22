# Backup-restore drill

A backup that has never been restored is a wish, not a backup. Run
this drill **at least once per quarter** to confirm the off-site KV
backup pipeline (see [`backup-recovery.md`](./backup-recovery.md)) can
actually be turned back into a working storefront.

## What we're verifying

1. The nightly GitHub Actions run produces a non-empty NDJSON dump.
2. The R2-mirrored archive is intact and decompressable.
3. The dump contains the expected records (orders, products, users,
   storefront-config).
4. The restore script can write those records into a **separate**
   staging KV namespace **without touching production**.
5. A staging Pages preview wired to the staging KV serves the restored
   data correctly (homepage loads, /admin loads, an order looks up).

## Pre-requisites (one-time setup)

Before the first drill, create the staging KV namespaces. Use a
`staging-` prefix so they can never be accidentally promoted to prod:

```bash
# From the repo root
for NS in ORDERS USERS STOREFRONT_CONFIG PRODUCTS NEWSLETTER ADMIN_AUTH \
          AUDIT_LOG SECURITY_EVENTS RATE_LIMITS VISITORS; do
  npx wrangler kv:namespace create "staging-${NS}"
done
```

Save the resulting IDs in `wrangler.toml` under a separate
`[env.staging-restore]` block — never under the default env.

Also create a separate Cloudflare Pages project (`canvhub-restore-test`)
with the staging KV bindings.

## Drill procedure (~30 minutes)

### 1. Pull the latest backup artefact

Two sources to spot-check both:

- **GitHub Actions**: Actions → `backup` workflow → latest successful
  run → Artifacts → download `canvhub-backup-<TS>.zip`.
- **R2**: `npx wrangler r2 object get canvhub-backups
canvhub-backup-<TS>.gz --file ./backup.gz`.

Confirm both unpack and contain comparable record counts.

### 2. Inspect the dump

```bash
gunzip -k canvhub-backup-<TS>.gz
head -1 canvhub-backup-<TS>      # first line should be a JSON header
wc -l canvhub-backup-<TS>        # one line per KV record
jq -c 'select(.namespace == "ORDERS")' canvhub-backup-<TS> | wc -l
jq -c 'select(.namespace == "USERS")'  canvhub-backup-<TS> | wc -l
```

Sanity-check the totals against the live admin dashboard (Admin →
Stats → Records). Off by ≤5 % is fine (live writes happen between
backup and check). Off by 50 % is a red flag — investigate before
proceeding.

### 3. Restore into staging

`functions/api/admin/restore-backup.js` accepts the same NDJSON shape
the export emits. Wire it to the **staging** Pages project, not prod:

```bash
# Posts the dump line-by-line to the staging-restore env. The endpoint
# refuses to run when the deployment doesn't have STAGING_RESTORE=true,
# so this can never accidentally clobber production.
curl -X POST \
  -H "Authorization: Bearer ${BACKUP_TOKEN_STAGING}" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary "@canvhub-backup-<TS>" \
  https://canvhub-restore-test.pages.dev/api/admin/restore-backup
```

Expected response: `{ "ok": true, "restored": <N>, "skipped": <M> }`.

### 4. Smoke-test the restored storefront

Open the staging preview URL in a browser:

- [ ] Homepage loads, products visible.
- [ ] Open a known order ID at `/track` — order details render.
- [ ] Sign in to `/admin` with the restored admin password.
- [ ] Admin → Orders shows the expected count.
- [ ] Admin → Users shows the expected count.

### 5. Tear down

After the drill:

```bash
# Clear each staging namespace so the next drill starts fresh
for NS in ORDERS USERS STOREFRONT_CONFIG PRODUCTS; do
  npx wrangler kv:bulk delete --namespace-id <STAGING_ID> --force \
    <(npx wrangler kv:key list --namespace-id <STAGING_ID> | jq '[.[].name]')
done
```

### 6. Log the drill

Append to `docs/incidents/drills.md`:

```
- 2026-04-30 | drill | restored 2026-04-29 dump, 412 orders / 28 users; staging looked correct; total time 22 min.
```

## When the drill fails

If anything in §2–§4 is broken, the production backup pipeline is
unreliable. Treat it as a P1 incident: do not run the next nightly
backup until the issue is fixed (otherwise you may overwrite the last
known-good archive with a broken one).

Common failures:

- NDJSON header missing → export endpoint regression. Compare against
  the previous artefact.
- Record count off by >50 % → KV namespace was partially cleared, or
  the export now skips a namespace. Cross-reference
  `functions/api/admin/export-backup.js` with the live wrangler.toml.
- Restore endpoint 401 → `BACKUP_TOKEN_STAGING` doesn't match. Don't
  share with the prod token.
- Smoke test 500s → KV schema drift. Likely a recent migration that
  the export pipeline didn't pick up. Add to the export schema.
