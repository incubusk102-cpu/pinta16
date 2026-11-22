-- 0010_tiktok_posts.sql
--
-- D1 audit log for every TikTok post created through the admin
-- panel. One row per publish attempt (whether it succeeded or
-- failed) so the admin can answer "did this painting already get
-- posted to TikTok?", "what was the caption?", "what was the
-- publish status?" and "which attempts errored out, with what
-- message?".
--
-- TikTok's Content Posting API uses an asynchronous job model: the
-- admin endpoint calls `/v2/post/publish/content/init/`, gets back
-- a `publish_id`, and the post lands in either the creator's
-- inbox/drafts (UPLOAD mode) or directly in their feed
-- (DIRECT_POST mode, gated behind app audit). The publish_id can
-- be polled for status via `/v2/post/publish/status/fetch/`.
--
-- Columns:
--   id          — UUID (canvhub-side row id)
--   product_id  — KV product id (or default-artwork id)
--   publish_id  — TikTok's job handle (string returned by /init/)
--   tiktok_post_id — final TikTok video/photo id once published
--   share_url   — TikTok permalink (if returned)
--   caption     — full caption sent to TikTok
--   image_url   — first image URL the admin posted
--   image_urls  — JSON array of all image URLs (carousel posts)
--   post_mode   — "UPLOAD" or "DIRECT_POST"
--   media_type  — "PHOTO" or "VIDEO"
--   status      — "pending" | "processing" | "published" | "failed"
--   error_code  — TikTok error code string (e.g. "rate_limit_exceeded")
--   error_message — human-readable error from TikTok or canvhub
--   posted_by   — admin username (from session)
--   posted_at   — ISO when TikTok confirmed publication
--   created_at  — ISO of row creation
--   updated_at  — ISO of last update

CREATE TABLE IF NOT EXISTS tiktok_posts (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  publish_id TEXT,
  tiktok_post_id TEXT,
  share_url TEXT,
  caption TEXT,
  image_url TEXT,
  image_urls TEXT,
  post_mode TEXT NOT NULL DEFAULT 'UPLOAD',
  media_type TEXT NOT NULL DEFAULT 'PHOTO',
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  posted_by TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_product_id ON tiktok_posts(product_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_status ON tiktok_posts(status);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_publish_id ON tiktok_posts(publish_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_posted_at ON tiktok_posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_created_at ON tiktok_posts(created_at);
