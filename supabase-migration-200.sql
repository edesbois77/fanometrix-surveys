-- Migration 200: response_answers becomes the AUTHORITATIVE individual-answer
-- evidence store — self-describing, reorder-safe, and Campaign-Group-ready.
--
-- WHY NOW (P0 production incident)
--   `/api/answer` shipped in migration 147 but was never reachable: it was missing
--   from every middleware allow-list, so anonymous embeds got 401 (app host) or 302
--   (surveys host) and the client swallowed the error. `response_answers` therefore
--   held ZERO rows from the day it was created, and Q4/Q5 answers — which live
--   NOWHERE else, because `responses` only has q1/q2/q3 — were discarded entirely.
--   The middleware fix restores the write. This migration makes what gets written
--   actually sufficient as research evidence.
--
-- WHAT THIS FIXES BEYOND REACHABILITY
--   1. IDENTITY. A row was keyed only by `question_index` (position). Editing or
--      reordering a survey's questions silently re-pointed every historical answer
--      at a different question. `question_id` (+ `canonical_question_key` where the
--      survey carries one) records WHICH question was actually answered.
--   2. CONTEXT. Publisher / placement / market / language / creative were absent, so
--      per-publisher or per-market partial-completion analysis was impossible — the
--      core promise of a multi-publisher study.
--   3. CAMPAIGN GROUPS. `group_id` is added NULLABLE now, purely so the evidence
--      model does not have to change again when Campaign Groups are (re)built in
--      Survey Studio. Nothing in this migration implements Campaign Groups.
--
-- SAFETY
--   • Purely ADDITIVE. No column is dropped, renamed, retyped or backfilled.
--   • Every new column is NULLABLE with no default, so existing rows stay valid.
--     (`response_answers` is empty in production, so there is nothing to rewrite —
--     but this migration is written to be correct even if that changes.)
--   • Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout.
--   • `responses`, `survey_events` and every existing view are UNTOUCHED.
--   • The application tolerates this migration NOT being applied yet: the answer
--     endpoint detects an unknown-column error once and falls back to the migration-147
--     column set, so answer capture is restored by the code deploy alone. Applying
--     this migration upgrades the evidence; it is not required to stop the data loss.
--
-- ORDER: safe to run BEFORE or AFTER the code deploy.

-- ── Question identity (never rely on position alone again) ───────────────────
ALTER TABLE response_answers
  -- The authored question's stable id (surveys.questions[].id), exactly as rendered
  -- to the respondent. Survives question reordering and re-wording.
  ADD COLUMN IF NOT EXISTS question_id             text,
  -- Cross-survey comparability anchor (surveys.questions[].canonical_question_key).
  -- NULL for surveys authored before the anchor existed — readers fall back to
  -- question_id, exactly as lib/studio/question-identity.ts already does.
  ADD COLUMN IF NOT EXISTS canonical_question_key  text;

-- ── Delivery context (server-resolved from the campaign, not client-asserted) ─
ALTER TABLE response_answers
  -- Campaign Group slug (campaign_groups.group_id). NULLABLE and unused today;
  -- present so Campaign Groups can be added without another evidence migration.
  ADD COLUMN IF NOT EXISTS group_id                text,
  ADD COLUMN IF NOT EXISTS publisher               text,
  ADD COLUMN IF NOT EXISTS placement               text,
  ADD COLUMN IF NOT EXISTS placement_id            text,
  ADD COLUMN IF NOT EXISTS creative_id             text,
  -- Which embed renderer produced this answer (themed | classic | studio-classic |
  -- stack). Lets us prove every production-capable renderer writes the same contract.
  ADD COLUMN IF NOT EXISTS renderer                text,
  ADD COLUMN IF NOT EXISTS survey_language         text,
  -- ISO country code from the campaign / ad-server macro. `country` (already present)
  -- stays as the resolved display name so no existing reader changes.
  ADD COLUMN IF NOT EXISTS country_code            text;

-- ── Read paths ───────────────────────────────────────────────────────────────
-- Survey-scoped question results (Manage → Results, Discover → Results, Findings).
CREATE INDEX IF NOT EXISTS idx_response_answers_survey_question
  ON response_answers (survey_id, question_index)
  WHERE is_demo = false;

-- Question-identity reads that must survive a reorder.
CREATE INDEX IF NOT EXISTS idx_response_answers_question_id
  ON response_answers (survey_id, question_id)
  WHERE is_demo = false;

-- Future Campaign Group reporting; partial so it costs nothing while group_id is NULL.
CREATE INDEX IF NOT EXISTS idx_response_answers_group
  ON response_answers (group_id, question_index)
  WHERE group_id IS NOT NULL;

-- Per-publisher partial-completion analysis.
CREATE INDEX IF NOT EXISTS idx_response_answers_publisher
  ON response_answers (publisher, question_index)
  WHERE is_demo = false;

-- RLS is unchanged: written only by the server (service role), never by anon.
-- (Policy response_answers_no_anon from migration 147 still applies.)

NOTIFY pgrst, 'reload schema';

-- ── Verification (expect 10 new columns present, 4 new indexes) ──────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'response_answers'
--      AND column_name IN ('question_id','canonical_question_key','group_id','publisher',
--                          'placement','placement_id','creative_id','renderer',
--                          'survey_language','country_code')
--    ORDER BY column_name;
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'response_answers' AND indexname LIKE 'idx_response_answers_%'
--    ORDER BY indexname;

-- ── Rollback ─────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS idx_response_answers_publisher;
--   DROP INDEX IF EXISTS idx_response_answers_group;
--   DROP INDEX IF EXISTS idx_response_answers_question_id;
--   DROP INDEX IF EXISTS idx_response_answers_survey_question;
--   ALTER TABLE response_answers
--     DROP COLUMN IF EXISTS country_code,
--     DROP COLUMN IF EXISTS survey_language,
--     DROP COLUMN IF EXISTS renderer,
--     DROP COLUMN IF EXISTS creative_id,
--     DROP COLUMN IF EXISTS placement_id,
--     DROP COLUMN IF EXISTS placement,
--     DROP COLUMN IF EXISTS publisher,
--     DROP COLUMN IF EXISTS group_id,
--     DROP COLUMN IF EXISTS canonical_question_key,
--     DROP COLUMN IF EXISTS question_id;
