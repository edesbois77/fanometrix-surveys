-- Migration 095: Per-source simulation runs — "Run Research"
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Product Walkthrough's individually-attached Surveys/Conversation Searches
-- (Phase 1+3 of the multi-source correction) have never had a way to
-- collect simulated data of their own — evidence_simulations (migration
-- 081) is project-scoped: one row per project, source_config.sources names
-- evidence TYPES, never a specific attached source. This adds a per-source
-- run record without touching that project-wide shape at all.
--
-- research_project_evidence_id — not evidence_type/evidence_id — is the
-- identity a per-source run is scoped to: that row already carries the
-- project, the evidence type, the underlying Survey/Conversation Search id,
-- and its simulated provenance (research_project_evidence.is_simulated), so
-- nothing about the source needs to be re-derived or trusted from client
-- input. Nullable: every existing row (and every future project-wide row
-- from the old scenario-template/Duplicate flow) keeps this NULL —
-- untouched, still exactly the shape six existing call sites already
-- assume ("one row per project, take the most recent"), which now filter
-- explicitly on IS NULL to stay provably unaffected.
--
-- The partial unique index enforces one simulation record per attached
-- source (research_project_evidence row) — not "one active" — the same
-- record persists through its whole lifecycle (generating → ready, or
-- generating → failed → retried back to generating → ready). A NULL
-- research_project_evidence_id never participates in the uniqueness check,
-- so any number of legacy project-wide rows can keep coexisting.
--
-- error_message: set on a failed run so the source card can show
-- "Research Failed" with the real reason and a Retry action, instead of a
-- silent/opaque failure.

ALTER TABLE evidence_simulations
  ADD COLUMN IF NOT EXISTS research_project_evidence_id uuid
    REFERENCES research_project_evidence(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_simulations_one_per_evidence_row
  ON evidence_simulations (research_project_evidence_id)
  WHERE research_project_evidence_id IS NOT NULL;

-- Rollback:
--   DROP INDEX IF EXISTS idx_evidence_simulations_one_per_evidence_row;
--   ALTER TABLE evidence_simulations
--     DROP COLUMN IF EXISTS error_message,
--     DROP COLUMN IF EXISTS research_project_evidence_id;
