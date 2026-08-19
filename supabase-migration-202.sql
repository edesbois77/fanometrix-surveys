-- Migration 202: Research Intelligence — evidence-fingerprint identity (Stage A).
--
-- Turns the Research Reasoner's persistence from RUN-id identity into EVIDENCE-FINGERPRINT
-- identity, so the shared Research Intelligence foundation obeys the invariant:
--
--     same governed evidence + same reasoning methodology/version = same reusable intelligence
--
-- WHY: intelligence was keyed on analysis_run_id. Re-running deterministic analysis over
-- UNCHANGED evidence produces a NEW run id but the SAME evidence_hash, so the read (keyed
-- on the latest run id) found no artefact and Findings silently regressed to deterministic
-- output — the stale-artefact bug we hit in production. Keying on the fingerprint makes
-- re-analysis over unchanged evidence reuse the existing intelligence (no model call, no
-- fallback flicker); genuinely changed evidence is a new fingerprint (new lifecycle); a
-- prompt/schema/model bump changes the identity and correctly invalidates old artefacts.
--
-- The analysis_run_id column is RETAINED as PROVENANCE (which run produced/last-confirmed
-- the evidence) — auditability is not sacrificed; it simply stops being the identity.
--
-- SAFETY: additive + idempotent + NON-DESTRUCTIVE to existing rows. The two existing
-- production artefacts (survey 155c6cd5, fingerprint b6f71ebc…, prompt v2 and v3) differ
-- by prompt version, so they remain DISTINCT under the new identity and are preserved; the
-- current displayable v3 artefact keeps being the one the read returns (no change to the
-- live FedEx output). NOT auto-applied — hand-applied per the DB-ahead-of-code practice.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS research_reasoner_runs_identity_uidx;
--   DROP INDEX IF EXISTS idx_research_reasoner_runs_analysis_run;
--   CREATE UNIQUE INDEX IF NOT EXISTS research_reasoner_runs_analysis_run_uidx
--     ON research_reasoner_runs (analysis_run_id);
--   ALTER TABLE research_reasoner_runs DROP COLUMN IF EXISTS prompt_version;
--   ALTER TABLE research_reasoner_runs DROP COLUMN IF EXISTS schema_version;
--   -- (leave the widened source_kind CHECK; it is a strict superset and harmless)

-- 1) Identity columns as PLAIN columns (so the unique index + supabase-js onConflict can
--    name them; the `versions` jsonb is retained as the full methodology record for audit).
ALTER TABLE research_reasoner_runs ADD COLUMN IF NOT EXISTS prompt_version text;
ALTER TABLE research_reasoner_runs ADD COLUMN IF NOT EXISTS schema_version text;

-- 2) Backfill the plain columns from the existing versions jsonb for any prior rows.
--    (Only completed rows carry versions; failed/skipped rows stay NULL and, being NULL,
--    never collide in the unique index below.)
UPDATE research_reasoner_runs
   SET prompt_version = versions->>'prompt'
 WHERE prompt_version IS NULL AND versions ? 'prompt';
UPDATE research_reasoner_runs
   SET schema_version = versions->>'schema'
 WHERE schema_version IS NULL AND versions ? 'schema';

-- 3) Widen the source_kind CHECK from survey-only to the reserved source kinds, so future
--    adapters (study/report/comparison) need no schema change. Strict superset — no
--    existing row is invalidated. (Drops the auto-named inline constraint if present.)
ALTER TABLE research_reasoner_runs DROP CONSTRAINT IF EXISTS research_reasoner_runs_source_kind_check;
ALTER TABLE research_reasoner_runs
  ADD CONSTRAINT research_reasoner_runs_source_kind_check
  CHECK (source_kind IN ('survey','study','report','comparison'));

-- 4) Replace the RUN-id unique index with the FINGERPRINT identity.
--    a) analysis_run_id keeps a NON-unique index (provenance lookups) — it must no longer
--       be unique, because a methodology version bump legitimately produces a second
--       artefact for the SAME run (e.g. v2 then v3) with a distinct identity.
DROP INDEX IF EXISTS research_reasoner_runs_analysis_run_uidx;
CREATE INDEX IF NOT EXISTS idx_research_reasoner_runs_analysis_run
  ON research_reasoner_runs (analysis_run_id);
--    b) The identity: one reusable artefact per (source + evidence fingerprint + prompt +
--       schema + model). The handler UPSERTs on exactly this key, so a re-enqueue, a job
--       retry, a NEW analysis run producing the same fingerprint, or a concurrent job all
--       converge on a single row (idempotent). NULLs (failed/skipped rows without versions)
--       are distinct, so they never block a later successful artefact for the same evidence.
CREATE UNIQUE INDEX IF NOT EXISTS research_reasoner_runs_identity_uidx
  ON research_reasoner_runs (source_kind, source_id, evidence_fingerprint, prompt_version, schema_version, model);

COMMENT ON COLUMN research_reasoner_runs.analysis_run_id IS
  'PROVENANCE (not identity): the analysis run that produced/last-confirmed this evidence. Identity is the evidence fingerprint — see research_reasoner_runs_identity_uidx.';

NOTIFY pgrst, 'reload schema';
