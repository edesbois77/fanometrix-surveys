-- Migration 190: Survey Studio — Findings (structured provenance + editorial + snapshot).
--
-- A Studio Finding is a Fanometrix-curated result deliberately selected, contextualised
-- and published — the human editorial layer between Manage → Results and (later) Discover.
-- It is NOT the Research Project `findings` table (RP analysis reasoning engine): that table
-- and its pipeline are UNTOUCHED. A Studio Finding stays connected to the analytical result
-- it came from via CANONICAL provenance (survey/question/option/filters), plus a SNAPSHOT of
-- the numbers Fanometrix actually reviewed/published (so a published statement never silently
-- drifts as later fieldwork arrives).
--
-- SAFETY: additive, non-destructive, idempotent. New table only; no existing table/column/
-- view/data touched. NOT auto-applied — hand-applied per the DB-ahead-of-code practice.
--
-- GOVERNED SEPARATION (settled): the Finding carries NO organisation_id — ownership is
-- resolved through survey_id when Manage needs it, and consumer/Discover access will be
-- governed by the INDEPENDENT `finding` entitlement class (not built here). No attribution,
-- distribution, ownership or entitlement column lives on the Finding, so those concepts can
-- never be conflated here.
--
-- V1 SCOPE: source_type = 'answer' only, so every Finding identifies a canonical answer
-- option (option_id NOT NULL). Widening to other source types is a future additive migration.
--
-- ROLLBACK: DROP TABLE IF EXISTS survey_findings;

CREATE TABLE IF NOT EXISTS survey_findings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A Finding is part of the persistent research record: RESTRICT, never cascade — a
  -- hard-deleted Survey must not silently erase published Findings.
  survey_id            uuid        NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,

  -- ── SOURCE / PROVENANCE (system-controlled, canonical — never client-trusted) ──
  source_type          text        NOT NULL DEFAULT 'answer' CHECK (source_type IN ('answer')),
  question_index       smallint    NOT NULL CHECK (question_index BETWEEN 0 AND 4),
  question_id          text        NOT NULL,
  option_id            text        NOT NULL,                 -- V1: answer findings always identify an option
  filters              jsonb       NOT NULL DEFAULT '{}',    -- {publisher?, market?, campaign?, language?}
  display_language     text,

  -- ── SNAPSHOT (the reviewed/published numbers — do NOT silently mutate) ──
  base_n               integer     NOT NULL CHECK (base_n >= 0),
  answer_count         integer     CHECK (answer_count IS NULL OR answer_count >= 0),
  percentage           numeric     CHECK (percentage IS NULL OR percentage BETWEEN 0 AND 1),
  shown                integer     CHECK (shown IS NULL OR shown >= 0),
  answered             integer     CHECK (answered IS NULL OR answered >= 0),
  question_completion  numeric     CHECK (question_completion IS NULL OR question_completion BETWEEN 0 AND 1),
  snapshot             jsonb       NOT NULL DEFAULT '{}',    -- full resolved result (labels/options) for faithful re-render

  -- ── EDITORIAL (Fanometrix-controlled) ──
  headline             text        NOT NULL,
  commentary           text,
  status               text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  published_by         text,
  published_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_survey_findings_survey ON survey_findings (survey_id, status, created_at DESC);

ALTER TABLE survey_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON survey_findings;
CREATE POLICY deny_all_anon ON survey_findings USING (false);

-- Shared updated_at trigger (set_updated_at from migration 008).
DROP TRIGGER IF EXISTS survey_findings_updated_at ON survey_findings;
CREATE TRIGGER survey_findings_updated_at BEFORE UPDATE ON survey_findings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
