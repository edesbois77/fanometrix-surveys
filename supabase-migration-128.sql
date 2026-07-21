-- Migration 128 — Evidence judged against Information Needs (docs/conversation-advisor.md)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- The collection-time classifier now judges each conversation's relevance
-- against the Conversation Advisor's Information Needs (migration 127) rather
-- than the generated Search Strategy. Alongside the existing research_aspect
-- (migration 116) — which now uses the aspects the advisor DEFINED — we record
-- the single information need each relevant conversation best answers, so a
-- researcher can see which needs are well-evidenced and which have gaps.
--
--   information_need (text): verbatim Information Need this conversation best
--     answers, or NULL (off-topic, or a legacy search with no needs defined).
--
-- Additive and nullable: existing rows and legacy searches (no information_needs)
-- keep working unchanged — they simply carry NULL here.

ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS information_need text;

-- Coverage reads ("how much evidence per need?") group by this column.
CREATE INDEX IF NOT EXISTS idx_social_mentions_information_need
  ON social_mentions (search_id, information_need)
  WHERE information_need IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   DROP INDEX IF EXISTS idx_social_mentions_information_need;
--   ALTER TABLE social_mentions DROP COLUMN IF EXISTS information_need;
