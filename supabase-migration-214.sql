-- Migration 214: Results indexes  (CONCURRENTLY — NO transaction block)
--
-- Status: HAND-APPLY. Additive — indexes only, no data change.
-- WP1 design refs: §10 of the WP1 plan · criteria 82-85, 88, 89.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- WHY THIS FILE HAS NO BEGIN/COMMIT
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block. That is a
-- Postgres restriction, not a style choice, and it is why these are separated
-- from migration 213 rather than bundled with its ALTERs.
--
-- WHY CONCURRENTLY, RATHER THAN ORDINARY PARTIAL INDEXES IN 213
--
-- The predicate matches nothing at creation (the columns are 100% NULL), so the
-- resulting indexes are empty and tiny. It is tempting to conclude the build is
-- therefore instant and safe inside 213. It is not: Postgres builds a partial
-- index by scanning the WHOLE HEAP and applying the predicate, while holding
-- ACCESS EXCLUSIVE. On survey_events that is a full scan of 1.14M rows today,
-- blocking every event write for its duration. During fieldwork that is an
-- outage of the evidence path.
--
-- CONCURRENTLY takes only SHARE UPDATE EXCLUSIVE, so writes continue.
--
-- CONSEQUENCE: this migration is NOT atomic. If a build fails it leaves an
-- INVALID index behind, which must be dropped before retrying. The verification
-- at the foot checks validity explicitly rather than mere existence.
--
-- WHY THESE INDEXES ARE MANDATORY, MEASURED
--
-- An unindexed filter on survey_events, at today's 1.14M rows:
--     Parallel Index Scan using survey_events_event_type_idx
--       Rows Removed by Filter: 397,888 x 2 workers
--       Execution Time: 16,521 ms
-- 16.5 seconds. At 10M rows that is roughly two minutes per Results load, and it
-- would degrade gradually rather than fail visibly.
--
-- THE RULE THESE INDEXES IMPOSE ON QUERIES
-- No Results query may filter survey_events by revision WITHOUT
-- `event_type = 'SURVEY_RENDER'`, or the partial predicate does not apply and the
-- slow plan returns. Measured on production after this migration:
--     with the predicate      Index Only Scan          0.144 ms
--     without it              Parallel Seq Scan    6,595.105 ms
-- Enforced by lib/campaign-groups/survey-events-index-rule.test.ts. That test did
-- NOT exist when this comment first claimed it did; it does now.
-- ══════════════════════════════════════════════════════════════════════════════

-- Exposure per revision. Partial on both the revision column and the event type,
-- so it stays small on a table whose overwhelming majority of rows are legacy.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_survey_events_revision_render
  ON public.survey_events (configuration_revision_id, created_at)
  WHERE configuration_revision_id IS NOT NULL AND event_type = 'SURVEY_RENDER';

-- Answers split by campaign x revision x question.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_response_answers_revision
  ON public.response_answers (configuration_revision_id, campaign_id, question_index)
  WHERE configuration_revision_id IS NOT NULL;

-- Completions per revision.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_responses_revision
  ON public.responses (configuration_revision_id)
  WHERE configuration_revision_id IS NOT NULL;

-- ── Verification (run as a separate statement; no transaction to assert inside) ─
-- Every index must exist AND be VALID. A CONCURRENTLY build that failed leaves an
-- invalid index that silently will not be used by the planner.
DO $verify$
DECLARE
  v_missing text := '';
  v_invalid text := '';
  i text;
BEGIN
  FOREACH i IN ARRAY ARRAY[
    'idx_survey_events_revision_render',
    'idx_response_answers_revision',
    'idx_responses_revision'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname = i) THEN
      v_missing := v_missing || E'\n  - ' || i;
    ELSIF EXISTS (
      SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
       WHERE c.relname = i AND NOT x.indisvalid
    ) THEN
      v_invalid := v_invalid || E'\n  - ' || i;
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION E'M214 FAILED — indexes not created:%', v_missing;
  END IF;
  IF v_invalid <> '' THEN
    RAISE EXCEPTION E'M214 FAILED — indexes exist but are INVALID (a CONCURRENTLY build failed). Drop each and re-run:%', v_invalid;
  END IF;
  RAISE NOTICE 'M214 OK: 3 Results indexes present and valid.';
END
$verify$;
