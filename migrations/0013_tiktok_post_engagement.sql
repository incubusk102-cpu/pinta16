-- 0013_tiktok_post_engagement.sql
--
-- Extend `tiktok_posts` so the admin can show a "top-performing TikTok
-- posts" leaderboard. Before this migration the table only tracked
-- publish status (`pending` / `processing` / `published` / `failed`);
-- there was no place to store the view / like / comment / share counts
-- TikTok exposes through `/v2/video/query/`.
--
-- New columns (all nullable / zero-defaulted so existing rows stay
-- valid without a backfill — engagement is populated lazily by the
-- "Refresh engagement" button in the admin TikTok panel):
--
--   view_count    — current TikTok view count for the post
--   like_count    — current like count
--   comment_count — current comment count
--   share_count   — current share count
--   engagement_refreshed_at — ISO timestamp of the last successful
--                             stats fetch (NULL = never refreshed)
--
-- SQLite has no `IF NOT EXISTS` on `ALTER TABLE ADD COLUMN`, so this
-- migration is intentionally not idempotent on its own — wrangler's
-- migration runner records applied versions to `d1_migrations` and
-- won't re-run this file. The runtime bootstrap path in
-- `functions/api/_lib/d1-schema.js` (admin `apply-schema`) includes
-- these columns inline in the CREATE TABLE for fresh D1 instances
-- and the admin endpoint tolerates "duplicate column" errors when
-- re-applying against an existing table.

ALTER TABLE tiktok_posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tiktok_posts ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tiktok_posts ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tiktok_posts ADD COLUMN share_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tiktok_posts ADD COLUMN engagement_refreshed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tiktok_posts_view_count ON tiktok_posts(view_count);
