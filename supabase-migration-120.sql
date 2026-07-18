-- Migration 120 — Evidence Validation gate (docs/evidence-validation-blueprint.md)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- Adds a researcher-controlled validation gate between Collection and Analysis:
--   • a review lifecycle on each Conversation Search
--       Draft → Collecting → Pending Approval → Approved → Archived
--   • Included / Excluded state on each conversation (append-only flags)
--   • an audit ledger of review events
-- Only Approved (or Archived-having-been-Approved) searches, with Included and
-- relevant conversations, feed Analysis and Reports. Nothing is deleted to
-- validate evidence — the append-only Evidence Lifecycle (migration 118) is
-- preserved; these are all states/flags over the existing base.
--
-- BACKFILL DECISION (non-breaking): existing searches that ALREADY hold evidence
-- are set to 'approved' with approved_watermark = now(), so the live product does
-- not go dark the moment the gate turns on. Existing searches with no evidence
-- start 'draft'. New evidence collected after this migration will still reset an
-- approved search to 'pending_approval' via the normal delta flow. Adjust here if
-- you would rather force re-approval of already-collected evidence.

-- ── 1. Search review lifecycle ──────────────────────────────────────────────
ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS review_status      text        NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft','collecting','pending_approval','approved','archived')),
  ADD COLUMN IF NOT EXISTS approved_by        text,
  ADD COLUMN IF NOT EXISTS approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS approved_watermark timestamptz,   -- evidence high-water mark approval covers
  ADD COLUMN IF NOT EXISTS archived_at        timestamptz;

-- Backfill: searches with any evidence → approved (keep the live product working);
-- searches with none → draft (the default already set).
UPDATE social_searches s
   SET review_status      = 'approved',
       approved_by        = 'system:migration-120',
       approved_at        = now(),
       approved_watermark = now()
 WHERE s.review_status = 'draft'
   AND EXISTS (SELECT 1 FROM social_mentions m WHERE m.search_id = s.id);

CREATE INDEX IF NOT EXISTS idx_social_searches_review_status
  ON social_searches (review_status);

-- ── 2. Conversation Included / Excluded (append-only flags) ─────────────────
ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS excluded         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_at      timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_by      text,
  ADD COLUMN IF NOT EXISTS exclusion_reason text;

-- Partial index: the read gate filters on excluded = false constantly.
CREATE INDEX IF NOT EXISTS idx_social_mentions_search_included
  ON social_mentions (search_id) WHERE excluded = false;

-- ── 3. Review audit ledger ──────────────────────────────────────────────────
-- Per-search (not per-project), so it complements research_project_activity
-- rather than reusing it. One row per review action.
CREATE TABLE IF NOT EXISTS evidence_review_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id  uuid        NOT NULL REFERENCES social_searches(id) ON DELETE CASCADE,
  event      text        NOT NULL
    CHECK (event IN ('submitted_for_approval','approved','archived','reactivated',
                     'conversation_excluded','conversation_restored')),
  actor      text,
  note       text,
  run_id     uuid,       -- optional link to the collection_run that prompted it
  mention_id uuid,       -- set for conversation_excluded / conversation_restored
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_review_events_search
  ON evidence_review_events (search_id, at DESC);

ALTER TABLE evidence_review_events ENABLE ROW LEVEL SECURITY;
-- Server-only writes via the service role; deny anon (mirrors research_summaries).
DROP POLICY IF EXISTS evidence_review_events_no_anon ON evidence_review_events;
CREATE POLICY evidence_review_events_no_anon ON evidence_review_events
  FOR ALL TO anon USING (false) WITH CHECK (false);

-- Make the new columns/table visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';

-- Rollback:
--   DROP TABLE IF EXISTS evidence_review_events;
--   DROP INDEX IF EXISTS idx_social_mentions_search_included;
--   ALTER TABLE social_mentions
--     DROP COLUMN IF EXISTS excluded, DROP COLUMN IF EXISTS excluded_at,
--     DROP COLUMN IF EXISTS excluded_by, DROP COLUMN IF EXISTS exclusion_reason;
--   DROP INDEX IF EXISTS idx_social_searches_review_status;
--   ALTER TABLE social_searches
--     DROP COLUMN IF EXISTS review_status, DROP COLUMN IF EXISTS approved_by,
--     DROP COLUMN IF EXISTS approved_at, DROP COLUMN IF EXISTS approved_watermark,
--     DROP COLUMN IF EXISTS archived_at;
