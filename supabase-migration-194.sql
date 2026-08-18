-- Migration 194 — Survey Studio Reports V1 (Slice 1): study_reports
--
-- A Report is an EDITORIAL COMPOSITION of human-approved Findings into a client-ready
-- document. It is NOT a second analysis engine: it composes approved Findings + their
-- frozen governed evidence + (as organisational context) the pinned Analysis run's Study
-- Story/themes. The rendered document is a serialisable framework `ReportConfig`, stored
-- verbatim in `config` (jsonb) so the premium /reports renderer draws it with no Studio
-- business logic. Provenance (which Findings + which Analysis run) is preserved for
-- staleness + audit. Slice 1 = ONE depth ("report") and DRAFT status only (no external
-- publish/share). Everything the model produced is verified deterministically BEFORE it
-- is persisted here.
--
-- DB-ahead-of-code practice: hand-apply in prod, then deploy the code. Idempotent.
--   Rollback (manual, destructive):  DROP TABLE IF EXISTS study_reports;

CREATE TABLE IF NOT EXISTS study_reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id           uuid        NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  title              text        NOT NULL,
  -- Depth/render mode. Slice 1 ships only "report"; "snapshot"/"full" reserved for later
  -- DEPTHS of the SAME pipeline (not new engines) — CHECK admits them so no migration is
  -- needed to add a depth, but the code only emits "report" today.
  report_type        text        NOT NULL DEFAULT 'report' CHECK (report_type IN ('report','snapshot','full')),
  status             text        NOT NULL DEFAULT 'draft'   CHECK (status IN ('draft','published')),
  -- Optional short editorial brief (emphasis/tone only; never changes evidence/claims).
  editorial_brief    text,
  -- The verified, renderable framework ReportConfig (sections[]). Source of truth for view.
  config             jsonb       NOT NULL,
  -- Provenance for traceability + staleness (report section -> finding -> frozen evidence -> run).
  source_finding_ids uuid[]      NOT NULL DEFAULT '{}',
  analysis_run_id    uuid        REFERENCES study_analysis_runs(id) ON DELETE SET NULL,
  -- Snapshot of the exact Findings+evidence used, so a (future) published report is immutable
  -- and staleness can compare current Findings to what the report was built from.
  source_snapshot    jsonb,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  published_by       text,
  published_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_study_reports_study ON study_reports (study_id, status, created_at DESC);

-- Server-only (service role); deny anon/authenticated — consistent with studies/analysis/findings.
ALTER TABLE study_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON study_reports;
CREATE POLICY deny_all_anon ON study_reports USING (false);

DROP TRIGGER IF EXISTS study_reports_updated_at ON study_reports;
CREATE TRIGGER study_reports_updated_at BEFORE UPDATE ON study_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
