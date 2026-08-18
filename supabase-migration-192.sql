-- Migration 192: Survey Studio — Study Analysis (AI proposal runs + reviewable proposals).
--
-- Persists AI ANALYST ASSISTANCE for a Study: each "Analyse study" creates one
-- immutable run over a snapshot of governed Study evidence, plus the reviewable
-- proposals the AI produced. The AI is NOT authority — counts/%/bases/identity live
-- in the evidence snapshot (governed aggregate only); a proposal stores INTERPRETATION
-- + references into that snapshot, never a second copy of the results.
--
-- Studio-native and DECOUPLED: FKs reference studies(id) ONLY. This migration does NOT
-- reference research_projects, analysis_runs, findings, finding_evidence,
-- research_summaries, survey_findings, or any entitlement table, and creates no Study
-- Finding / Report / Discover / entitlement schema (all deferred to later slices).
--
-- SAFETY: additive, non-destructive, idempotent. NOT auto-applied — hand-applied per
-- the DB-ahead-of-code practice.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS study_analysis_proposals;
--   DROP TABLE IF EXISTS study_analysis_runs;

-- ── Runs ─────────────────────────────────────────────────────────────────────
-- One AI analysis of ONE immutable snapshot of governed Study evidence. A rerun
-- ALWAYS creates a NEW run; completed runs are audit history and never mutated.
CREATE TABLE IF NOT EXISTS study_analysis_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT (not CASCADE): a Study with analysis history cannot be silently deleted,
  -- mirroring survey_findings -> surveys. Provenance is preserved; no retention tooling.
  study_id       uuid        NOT NULL REFERENCES studies(id) ON DELETE RESTRICT,
  status         text        NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running','completed','failed')),
  provider       text,                       -- e.g. 'openai'
  model          text,                       -- e.g. 'gpt-4o'
  prompt_version text,                       -- e.g. 'study-analysis-v2'
  -- The EXACT structured evidence supplied to the AI (governed aggregate only: refs,
  -- questions, options, counts/%/bases, comparability, source provenance). NEVER raw
  -- respondent rows. Immutable once written, so "what did this run analyse?" is always
  -- answerable even after fieldwork changes current Study Results.
  evidence_snapshot jsonb    NOT NULL DEFAULT '{}'::jsonb,
  -- Fingerprint of the canonical evidence snapshot. Audit + future dedupe/cache seam.
  -- NO unique constraint: the analyst may deliberately rerun over unchanged evidence.
  evidence_hash  text,
  proposal_count integer     NOT NULL DEFAULT 0,
  error          text,                       -- bounded failure audit when status='failed'
  created_by     text,                       -- session workEmail
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_study_analysis_runs_study ON study_analysis_runs (study_id, created_at DESC);

-- ── Proposals ────────────────────────────────────────────────────────────────
-- One AI-generated interpretation from a specific run. Reachable to its Study via the
-- run (no duplicated study_id — one authoritative relationship). evidence_refs are
-- validated strings pointing INTO the parent run's evidence_snapshot (immutable on edit).
CREATE TABLE IF NOT EXISTS study_analysis_proposals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid        NOT NULL REFERENCES study_analysis_runs(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN ('observation','comparison','synthesis')),
  headline        text        NOT NULL,
  explanation     text        NOT NULL,
  evidence_refs   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- NOT 'published': an accepted proposal is still a proposal, never a governed Finding.
  review_status   text        NOT NULL DEFAULT 'proposed'
                             CHECK (review_status IN ('proposed','accepted','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_by     text,                       -- set on accept/dismiss
  reviewed_at     timestamptz,
  updated_by      text,                       -- set on editorial (headline/explanation) edit
  updated_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_study_analysis_proposals_run    ON study_analysis_proposals (analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_study_analysis_proposals_review ON study_analysis_proposals (review_status);

-- ── RLS: server-only (service role), deny anon — consistent with studies ─────
ALTER TABLE study_analysis_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_analysis_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON study_analysis_runs;
CREATE POLICY deny_all_anon ON study_analysis_runs USING (false);
DROP POLICY IF EXISTS deny_all_anon ON study_analysis_proposals;
CREATE POLICY deny_all_anon ON study_analysis_proposals USING (false);

NOTIFY pgrst, 'reload schema';
