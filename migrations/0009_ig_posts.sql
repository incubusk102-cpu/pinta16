-- 0009_ig_posts.sql
--
-- D1 audit log of every Instagram post published through the admin
-- panel. One row per publish attempt (whether it succeeded or failed)
-- so the admin can answer "did this painting already get posted?",
-- "what was the caption?", "when did we post it?", and "which
-- attempts errored out, with what message?".
--
-- The actual posting goes through Meta's Graph API
-- (`functions/api/_lib/instagram.js`) and is wired into the admin
-- panel at `functions/api/admin/instagram.js`. KV remains untouched
-- by this feature — Instagram history is a pure D1 concern.
--
-- Privacy: no customer data on this table. `posted_by` is the admin
-- email (when a logged-in admin made the change). `ig_media_id` /
-- `container_id` / `permalink` are Meta-side identifiers and don't
-- reveal anything beyond what's already public on Instagram itself.
--
-- Volume sanity:
--   At canvhub scale we publish maybe ~10 paintings/month plus the
--   occasional retry. Worst case a few rows/day, well under the
--   D1 free-tier 100k writes/day cap.

CREATE TABLE IF NOT EXISTS ig_posts (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  ig_media_id TEXT,
  container_id TEXT,
  permalink TEXT,
  caption TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  posted_by TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ig_posts_product_id ON ig_posts(product_id);
CREATE INDEX IF NOT EXISTS idx_ig_posts_status ON ig_posts(status);
CREATE INDEX IF NOT EXISTS idx_ig_posts_posted_at ON ig_posts(posted_at);
CREATE INDEX IF NOT EXISTS idx_ig_posts_created_at ON ig_posts(created_at);
