# D1 migrations

This directory holds the schema migrations for the Cloudflare D1 database
backing Canvas Hub. Each file is applied in **lexicographic order** by
`wrangler d1 migrations apply`, so the leading 4-digit prefix is what
controls execution sequence — not the file's modification time, not git
history, and not any registry.

## Why `0009_*.sql` is missing

You'll notice the sequence jumps:

```text
0008_stock_events.sql
0010_tiktok_posts.sql
```

There is no `0009_*.sql` and there never will be. Slot `0009` was
intentionally retired during development — the migration that originally
occupied that number was reworked and re-numbered before it was applied
to any environment (local, preview, or production). Rather than rewrite
git history to close the gap, we left the hole in place so that:

1. **No environment needs a corrective patch.** Production D1 has never
   seen a `0009` applied, so it has nothing to "skip" or "undo." The
   migrations table is consistent with the on-disk filenames.
2. **Branch / PR history stays readable.** Anyone reading older diffs
   that reference `0009_*` immediately sees that the slot is documented
   as retired here instead of digging through commit archaeology.

**The gap is purely cosmetic.** `wrangler d1 migrations apply` walks the
sorted filenames and applies any that haven't been recorded in
`d1_migrations` yet; a missing number has no effect on ordering,
correctness, or replayability. Future migrations should continue with
the next available number (currently `0014_*`) and **must not** reuse
`0009`.

## Adding a new migration

1. Pick the next unused number — currently `0014_*.sql`.
2. Use snake_case for the descriptive suffix (e.g.
   `0014_add_review_aggregate.sql`).
3. Write idempotent SQL where practical (`CREATE TABLE IF NOT EXISTS …`,
   `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` via the standard D1 dance)
   so re-running a partially-applied migration doesn't error out.
4. Apply locally first:
   ```bash
   npx wrangler d1 migrations apply canvhub --local
   ```
   then in CI / preview before promoting to production.

Do **not** rename or renumber existing migrations once they've been
applied to any environment — D1 keys the `d1_migrations` table by
filename, and a rename will cause the renamed file to be applied a
second time on the next run.
