-- Migration 199: Analytical Core — shadow runs (Stage 5C).
--
-- Domain table for the SHADOW-ONLY Analytical Core. Records one Core execution
-- that ran ALONGSIDE (never instead of) an authoritative Survey Studio analysis
-- run. Evaluation/audit only: it is NOT read by Studio, Discover, reports,
-- dashboards, or any client API, and it is NEVER authoritative — Survey Studio
-- remains the sole source of user-facing analysis and is completely unaffected by
-- whatever the shadow produces (or by its failure).
--
-- Follows the jobs framework's two-layer discipline (migration for `jobs` aside):
-- the `jobs` row is the OPERATIONAL record of the async attempt; THIS table is the
-- BUSINESS/evaluation record of what the shadow Core actually produced for a run.
-- Each row links to the authoritative run whose IMMUTABLE evidence_snapshot the
-- shadow re-read (study_analysis_runs.id or survey_analysis_runs.id) — the key that
-- lets an evaluator compare shadow output to the authoritative analysis of the
-- exact same governed evidence. It references NO authoritative Studio table and
-- mutates none; it creates no entitlement / Findings / Report / Discover schema.
--
-- SAFETY: additive, non-destructive, idempotent. NOT auto-applied — hand-applied
-- per the DB-ahead-of-code practice, and only in a CONTROLLED (non-production)
-- database for Stage 5C verification. The shadow subsystem stays flag-OFF
-- (ANALYTICAL_CORE_SHADOW_ENABLED) regardless.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS analytical_core_shadow_runs;

CREATE TABLE IF NOT EXISTS analytical_core_shadow_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind       text NOT NULL CHECK (source_kind IN ('study','survey')),
  source_id         uuid NOT NULL,
  -- The AUTHORITATIVE run whose immutable evidence_snapshot the shadow re-read
  -- (study_analysis_runs.id or survey_analysis_runs.id). Kind-scoped, not an FK:
  -- the id lives in one of two tables depending on source_kind, and the shadow
  -- must never add a write-path dependency onto an authoritative table.
  analysis_run_id   uuid NOT NULL,
  input_fingerprint text,
  versions          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- Core VersionSet (standard/core/pipeline/rubric/schema)
  status            text NOT NULL CHECK (status IN ('completed','failed','skipped')),
  run               jsonb,                                -- AnalyticalRun (summaries + ledger + provenance); NULL on failure
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

-- One shadow record per authoritative run: the handler UPSERTs on this key, so a
-- re-enqueue / job retry overwrites rather than duplicates (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS analytical_core_shadow_runs_analysis_run_uidx
  ON analytical_core_shadow_runs (analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_analytical_core_shadow_runs_source
  ON analytical_core_shadow_runs (source_kind, source_id, created_at DESC);

-- No client access. RLS ON + an explicit deny-all policy → only the service role
-- (jobs worker / internal tooling) may read or write; no anon/authenticated tenant
-- can reach shadow output through the client. Stage 5C exposes nothing user-facing.
ALTER TABLE analytical_core_shadow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY deny_all_anon ON analytical_core_shadow_runs USING (false);

COMMENT ON TABLE analytical_core_shadow_runs IS
  'Stage 5C shadow-only Analytical Core runs. Evaluation/audit only; never user-facing; never authoritative. Links each run to the Studio analysis run whose evidence_snapshot it re-analysed.';
