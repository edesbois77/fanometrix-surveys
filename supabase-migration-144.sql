-- Migration 144: analysis_runs
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The domain record of one reasoning run. The jobs framework owns HOW the work
-- runs (attempts, lease, retries); this table owns WHAT the run is and where it
-- got to, which is the two-layer discipline the framework requires (a jobs row
-- is never the source of truth for business state). The analyst surface polls
-- this to show "analysing" before any finding exists, and to show the coverage
-- and counts once it does.
--
-- The run's id is the same run_id stamped on every finding it produced
-- (migration 143), so a project's findings and the run that formed them are one
-- join, and superseding a run's candidates is one predicate.

CREATE TABLE IF NOT EXISTS analysis_runs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_project_id  uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

  status               text        NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','completed','failed')),

  -- What the run reasoned over and produced. Written when it completes, so the
  -- surface can summarise without re-reading every finding.
  needs_reasoned       int         NOT NULL DEFAULT 0,
  findings_written     int         NOT NULL DEFAULT 0,     -- every proposition, all ranks
  candidates_written   int         NOT NULL DEFAULT 0,     -- rank 1 only, the count a person reviews
  superseded           int         NOT NULL DEFAULT 0,
  -- Coverage and the honest remainders, as computed by the pipeline. Jsonb
  -- because they are display summaries, not queried dimensions.
  coverage             jsonb,
  unexamined           jsonb       NOT NULL DEFAULT '[]',
  unmapped             jsonb       NOT NULL DEFAULT '[]',

  -- Provenance and operational trail.
  model                text,
  requested_by         text,
  error                text,

  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_project ON analysis_runs (research_project_id, created_at DESC);

-- At most one live run per project. A second Run Analysis while one is in flight
-- is a no-op, not a duplicate: the reasoning is expensive and there is nothing to
-- gain from two of them racing to supersede each other's candidates.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_analysis_runs_active
  ON analysis_runs (research_project_id)
  WHERE status IN ('queued','running');

CREATE OR REPLACE FUNCTION set_analysis_runs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS analysis_runs_updated_at ON analysis_runs;
CREATE TRIGGER analysis_runs_updated_at
  BEFORE UPDATE ON analysis_runs
  FOR EACH ROW EXECUTE FUNCTION set_analysis_runs_updated_at();

ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analysis_runs_no_anon ON analysis_runs;
CREATE POLICY analysis_runs_no_anon ON analysis_runs FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   DROP TABLE IF EXISTS analysis_runs;
--   DROP TRIGGER IF EXISTS analysis_runs_updated_at ON analysis_runs;
--   DROP FUNCTION IF EXISTS set_analysis_runs_updated_at();
