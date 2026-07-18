-- Migration 118 — Evidence Lifecycle: append-only base + observations provenance
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- ⚠️  This migration COLLAPSES existing duplicate evidence rows. Review it before
--     applying, ideally on a backup/branch first. It is written to preserve every
--     item and its full run provenance — nothing is lost — but it does DELETE the
--     duplicate rows that the old snapshot-per-run model created.
--
-- Implements docs/evidence-lifecycle.md:
--   • A Conversation Search owns ONE append-only evidence base — an item exists
--     once, keyed by (search_id, connector, external_id).
--   • collection_runs stays the event ledger.
--   • A new evidence_observations table records every (item seen in a run), so an
--     item can answer first-seen / last-seen / seen-in-run-1,2,4 without any
--     duplication, and any run's full observed set is reconstructable.
-- Supersedes migration 112's within-run uniqueness (snapshot-per-run) model.

-- 1) Provenance columns on the base ------------------------------------------
ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS first_seen_at     timestamptz,
  ADD COLUMN IF NOT EXISTS first_seen_run_id uuid REFERENCES collection_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_run_id  uuid REFERENCES collection_runs(id) ON DELETE SET NULL;

-- 2) Observations ledger — one append-only row per (item encountered in a run) -
CREATE TABLE IF NOT EXISTS evidence_observations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mention_id        uuid NOT NULL REFERENCES social_mentions(id)  ON DELETE CASCADE,
  collection_run_id uuid NOT NULL REFERENCES collection_runs(id)  ON DELETE CASCADE,
  search_id         uuid NOT NULL REFERENCES social_searches(id)  ON DELETE CASCADE,
  observed_at       timestamptz NOT NULL DEFAULT now(),
  snapshot          jsonb            -- optional: item metrics at this observation (metric-over-time, later)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_evidence_observation        ON evidence_observations (mention_id, collection_run_id);
CREATE INDEX        IF NOT EXISTS idx_evidence_observations_run    ON evidence_observations (collection_run_id);
CREATE INDEX        IF NOT EXISTS idx_evidence_observations_search ON evidence_observations (search_id);

-- 3) Back-fill observations from EVERY existing row (before collapse), mapping
--    each to the KEEPER of its identity group so no run encounter is lost.
--    Keeper = earliest collected_at (tie-break by id) within (search,connector,external_id).
WITH keeper AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY search_id, connector, external_id
           ORDER BY collected_at ASC NULLS FIRST, id ASC
         ) AS keeper_id
  FROM social_mentions
  WHERE external_id IS NOT NULL
)
INSERT INTO evidence_observations (mention_id, collection_run_id, search_id, observed_at)
SELECT k.keeper_id, m.collection_run_id, m.search_id, COALESCE(m.collected_at, now())
FROM social_mentions m
JOIN keeper k ON k.id = m.id
WHERE m.collection_run_id IS NOT NULL
ON CONFLICT (mention_id, collection_run_id) DO NOTHING;

-- rows with no external_id can't be identity-deduped — each is its own keeper.
INSERT INTO evidence_observations (mention_id, collection_run_id, search_id, observed_at)
SELECT m.id, m.collection_run_id, m.search_id, COALESCE(m.collected_at, now())
FROM social_mentions m
WHERE m.external_id IS NULL AND m.collection_run_id IS NOT NULL
ON CONFLICT (mention_id, collection_run_id) DO NOTHING;

-- 4) Set first/last seen on kept rows from their observation history.
UPDATE social_mentions m SET
  first_seen_at     = agg.first_at,
  first_seen_run_id = agg.first_run,
  last_seen_at      = agg.last_at,
  last_seen_run_id  = agg.last_run
FROM (
  SELECT mention_id,
         min(observed_at) AS first_at,
         max(observed_at) AS last_at,
         (array_agg(collection_run_id ORDER BY observed_at ASC))[1]  AS first_run,
         (array_agg(collection_run_id ORDER BY observed_at DESC))[1] AS last_run
  FROM evidence_observations
  GROUP BY mention_id
) agg
WHERE m.id = agg.mention_id;

-- safety net for any row without an observation (e.g. collection_run_id null).
UPDATE social_mentions SET
  first_seen_at     = COALESCE(first_seen_at, collected_at, now()),
  last_seen_at      = COALESCE(last_seen_at,  collected_at, now()),
  first_seen_run_id = COALESCE(first_seen_run_id, collection_run_id),
  last_seen_run_id  = COALESCE(last_seen_run_id,  collection_run_id)
WHERE first_seen_at IS NULL OR last_seen_at IS NULL;

-- 5) Collapse duplicates: delete non-keeper rows. Their run encounters already
--    live as observations on the keeper (step 3), so nothing is lost.
DELETE FROM social_mentions m
USING (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY search_id, connector, external_id
           ORDER BY collected_at ASC NULLS FIRST, id ASC
         ) AS keeper_id
  FROM social_mentions WHERE external_id IS NOT NULL
) k
WHERE k.id = m.id AND k.keeper_id <> m.id;

-- 6) Swap uniqueness from per-run (112) to per-search (append-only base).
DROP INDEX IF EXISTS uq_social_mentions_run_connector_external;
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_mentions_search_connector_external
  ON social_mentions (search_id, connector, external_id)
  WHERE external_id IS NOT NULL;

-- 7) Per-search cumulative aggregate over the (now deduplicated) base — one row
--    per search, so the read model reads cumulative stats without paging the
--    whole base. Sentiment counts exclude video/trend containers (opinions only).
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

-- Rollback additions from step 7:
--   DROP VIEW IF EXISTS vw_conversation_search_stats;

-- Rollback is non-trivial (duplicates are deleted). Restore from backup if needed.
-- The additive parts alone can be reversed:
--   DROP INDEX IF EXISTS uq_social_mentions_search_connector_external;
--   -- (re-create uq_social_mentions_run_connector_external from migration 112)
--   DROP TABLE IF EXISTS evidence_observations;
--   ALTER TABLE social_mentions
--     DROP COLUMN IF EXISTS first_seen_at, DROP COLUMN IF EXISTS first_seen_run_id,
--     DROP COLUMN IF EXISTS last_seen_at,  DROP COLUMN IF EXISTS last_seen_run_id;
