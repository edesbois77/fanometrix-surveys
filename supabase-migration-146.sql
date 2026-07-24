-- Migration 146: the Project Findings layer (source findings), on the existing
-- findings infrastructure.
--
-- The architecture we agreed: Evidence → Source Findings → Analyst approval →
-- Cross-source Analysis → Reports. Rather than a parallel table, source findings
-- REUSE the findings table (lifecycle, evidence, revisions, adjudication all come
-- for free) with a discriminator, so source and analysis findings stay
-- structurally distinct while the existing analysis history is preserved
-- untouched (every existing row is finding_layer='analysis' by default).
--
-- Additive and non-destructive. Applied by hand ahead of code (see the DB-ahead
-- process). No backfill: the DEFAULT does the work.

-- ── 1. Discriminator + source anchor on findings ─────────────────────────────
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS finding_layer text NOT NULL DEFAULT 'analysis'
    CHECK (finding_layer IN ('source','analysis'));

-- Which source a source-finding came from. NULL for analysis findings.
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS source_kind text
    CHECK (source_kind IN ('survey','document','news','youtube','bluesky','reddit','conversation'));
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS source_ref text;

-- The board reads one layer, grouped by source, filtered by status, constantly.
CREATE INDEX IF NOT EXISTS idx_findings_layer_source
  ON findings (research_project_id, finding_layer, source_kind, status);

-- ── 2. 'set_aside' as a first-class status ───────────────────────────────────
-- Set-aside is distinct from rejected: a rejected claim is wrong, a set-aside one
-- is held back (for feedback and a later AI re-run) and can be brought back. Only
-- 'approved' feeds final Analysis, so set_aside simply keeps it out without
-- destroying it.
ALTER TABLE findings DROP CONSTRAINT IF EXISTS findings_status_check;
ALTER TABLE findings
  ADD CONSTRAINT findings_status_check
  CHECK (status IN ('candidate','in_review','approved','rejected','superseded','set_aside'));

-- ── 3. Structured analyst feedback, stored auditably ─────────────────────────
-- Captured now so the later controlled AI re-run has a clean, explicit signal to
-- act on. It never alters methodology and never retrains anything: it is a record
-- of what a person judged, kept beside the finding.
CREATE TABLE IF NOT EXISTS finding_feedback (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id          uuid        NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  research_project_id uuid        NOT NULL,
  feedback_class      text        NOT NULL
                      CHECK (feedback_class IN (
                        'incorrect','weak_evidence','duplicate','poorly_worded',
                        'not_relevant','missing_context','needs_more_evidence','other')),
  note                text,
  actor               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finding_feedback_finding ON finding_feedback (finding_id);
CREATE INDEX IF NOT EXISTS idx_finding_feedback_project ON finding_feedback (research_project_id, created_at DESC);

ALTER TABLE finding_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finding_feedback_no_anon ON finding_feedback;
CREATE POLICY finding_feedback_no_anon ON finding_feedback FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ──────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS finding_feedback;
--   ALTER TABLE findings DROP CONSTRAINT IF EXISTS findings_status_check;
--   ALTER TABLE findings ADD CONSTRAINT findings_status_check
--     CHECK (status IN ('candidate','in_review','approved','rejected','superseded'));
--   DROP INDEX IF EXISTS idx_findings_layer_source;
--   ALTER TABLE findings DROP COLUMN IF EXISTS source_ref;
--   ALTER TABLE findings DROP COLUMN IF EXISTS source_kind;
--   ALTER TABLE findings DROP COLUMN IF EXISTS finding_layer;
