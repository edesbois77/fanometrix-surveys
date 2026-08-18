-- Migration 198: Survey Studio — Survey Analysis (AI synthesis runs + proposals).
--
-- Persists AI RESEARCH SYNTHESIS for a single SURVEY: each "Generate analysis"
-- creates one immutable run over a snapshot of governed Survey evidence (the same
-- governed aggregate the Discover Survey dashboard already uses), plus the
-- validated proposals the model produced. The AI is NOT authority — counts/%/
-- bases/identity live in the evidence snapshot; a proposal stores INTERPRETATION
-- + references INTO that snapshot, never a second copy of the results.
--
-- Mirrors the proven Study Analysis persistence model (migration 192) but is
-- SURVEY-SCOPED via survey_id. It DOES NOT touch, reference, generalise or mutate
-- study_analysis_runs / study_analysis_proposals or any Study Analysis schema —
-- Study and Survey analysis share ARCHITECTURE/PRIMITIVES, never persistence rows.
-- It references surveys(id) ONLY; it creates no entitlement/Findings/Report schema.
--
-- SAFETY: additive, non-destructive, idempotent. NOT auto-applied — hand-applied
-- per the DB-ahead-of-code practice.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS survey_analysis_proposals;
--   DROP TABLE IF EXISTS survey_analysis_runs;

-- ── Runs ─────────────────────────────────────────────────────────────────────
-- One AI analysis of ONE immutable snapshot of governed Survey evidence. A
-- "Regenerate" ALWAYS creates a NEW run; completed runs are audit history and are
-- never mutated. Discover consumes only the LATEST run whose status='completed'
-- (a failed/running run never replaces a previously valid one).
CREATE TABLE IF NOT EXISTS survey_analysis_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE (not RESTRICT): a Survey Analysis run is a derivative CACHE/enrichment,
  -- not primary research (responses/campaigns/curated findings/reports are separate
  -- and untouched). V1 has no curated Finding depending on a proposal, so a hard-
  -- deleted survey may take its analysis cache with it. (Revisit to RESTRICT if a
  -- future "Add to Findings" from survey proposals introduces a dependency.)
  survey_id      uuid        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running','completed','failed')),
  provider       text,                       -- e.g. 'openai'
  model          text,                       -- e.g. 'gpt-4o'
  prompt_version text,                       -- e.g. 'survey-analysis-v1'
  -- The EXACT structured evidence supplied to the model (governed aggregate only:
  -- refs, questions, options, counts/%/bases, comparability, source provenance,
  -- segment facts, resultMode). NEVER raw respondent rows. Immutable once written,
  -- plus this run's OUTPUT (narrative/themes) frozen in at completion.
  evidence_snapshot jsonb    NOT NULL DEFAULT '{}'::jsonb,
  -- Fingerprint of the canonical evidence snapshot. Audit + future dedupe/cache seam.
  -- NO unique constraint: an owner may deliberately regenerate over unchanged evidence.
  evidence_hash  text,
  proposal_count integer     NOT NULL DEFAULT 0,
  error          text,                       -- bounded failure audit when status='failed'
  created_by     text,                       -- session workEmail
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
-- Current-run resolution: latest completed run for a survey (created_at DESC).
CREATE INDEX IF NOT EXISTS idx_survey_analysis_runs_survey ON survey_analysis_runs (survey_id, created_at DESC);

-- ── Proposals ────────────────────────────────────────────────────────────────
-- One validated model interpretation from a specific run. Reachable to its Survey
-- via the run (no duplicated survey_id — one authoritative relationship).
-- evidence_refs are validated strings pointing INTO the parent run's evidence_snapshot.
CREATE TABLE IF NOT EXISTS survey_analysis_proposals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid        NOT NULL REFERENCES survey_analysis_runs(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN ('observation','comparison','synthesis')),
  headline        text        NOT NULL,
  explanation     text        NOT NULL,
  evidence_refs   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  review_status   text        NOT NULL DEFAULT 'proposed'
                             CHECK (review_status IN ('proposed','accepted','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_by     text,
  reviewed_at     timestamptz,
  updated_by      text,
  updated_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_survey_analysis_proposals_run ON survey_analysis_proposals (analysis_run_id);

-- ── RLS: server-only (service role), deny anon — consistent with study_analysis ─
ALTER TABLE survey_analysis_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_analysis_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON survey_analysis_runs;
CREATE POLICY deny_all_anon ON survey_analysis_runs USING (false);
DROP POLICY IF EXISTS deny_all_anon ON survey_analysis_proposals;
CREATE POLICY deny_all_anon ON survey_analysis_proposals USING (false);

NOTIFY pgrst, 'reload schema';
