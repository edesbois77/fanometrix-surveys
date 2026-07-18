-- Migration 118b — corrective for 118: ensure vw_conversation_search_stats exists
-- and is visible to PostgREST. Run in: supabase.com → SQL Editor → New query → Run
--
-- Post-118 validation found the read model's aggregate view was not visible to
-- PostgREST ("could not find the table in the schema cache"). This re-asserts the
-- view (CREATE OR REPLACE is idempotent) and forces a PostgREST schema reload so
-- the read model (Execution / Dashboard conversation totals) resolves it.
-- Safe to run whether the view already exists or not.

CREATE OR REPLACE VIEW vw_conversation_search_stats AS
WITH kinds AS (
  SELECT search_id, jsonb_object_agg(content_kind, cnt) AS by_kind
  FROM (
    SELECT search_id, COALESCE(content_kind, 'unknown') AS content_kind, count(*) AS cnt
    FROM social_mentions GROUP BY 1, 2
  ) t GROUP BY search_id
)
SELECT
  m.search_id,
  count(*) FILTER (WHERE m.content_kind NOT IN ('video','trend') OR m.content_kind IS NULL)                                   AS conversations,
  count(*) FILTER (WHERE m.content_kind = 'video')                                                                            AS video_count,
  count(*) FILTER (WHERE m.content_kind = 'comment')                                                                          AS comment_count,
  count(*) FILTER (WHERE m.content_kind = 'post')                                                                             AS post_count,
  count(*) FILTER (WHERE (m.content_kind NOT IN ('video','trend') OR m.content_kind IS NULL) AND m.sentiment = 'Positive')    AS positive,
  count(*) FILTER (WHERE (m.content_kind NOT IN ('video','trend') OR m.content_kind IS NULL) AND m.sentiment = 'Neutral')     AS neutral,
  count(*) FILTER (WHERE (m.content_kind NOT IN ('video','trend') OR m.content_kind IS NULL) AND m.sentiment = 'Negative')    AS negative,
  k.by_kind
FROM social_mentions m
JOIN kinds k ON k.search_id = m.search_id
GROUP BY m.search_id, k.by_kind;

-- Force PostgREST to reload its schema cache so the view is queryable immediately.
NOTIFY pgrst, 'reload schema';
