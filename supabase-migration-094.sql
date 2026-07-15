-- Migration 094: Research Target / Creative Design / "when target reached"
-- become survey-specific, not project-level.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- A Research Project (or Product Walkthrough) can now attach multiple
-- Surveys (Phase 1 of the multi-source correction). Research Target,
-- Creative Design and "when target reached" were still living only on
-- research_projects — one shared value for every attached survey, which is
-- wrong once there's more than one: different surveys can have different
-- response targets, different creative, different deployment plans.
--
-- These become per-survey by living on research_project_evidence — the row
-- that already uniquely represents "this survey, attached to this
-- project." Nullable, and only ever populated/read for evidence_type =
-- 'survey' rows (Conversation Search rows never use them — no CHECK
-- constraint added restricting that, matching the existing loose style of
-- this table, e.g. is_simulated from migration 078).
--
-- creative_design stays `text` — matching research_projects.creative_design
-- (migration 046) and campaigns.creative_design (migration 047) exactly,
-- a slug into creative_designs, not a new relationship or duplicate field.
--
-- research_projects.target_responses / creative_design / target_reached_action
-- / target_reached_at are deliberately NOT dropped here — kept temporarily
-- for backwards compatibility, but from this migration onward the UI, campaign
-- creation, and bulk deployment must all read/write the survey-scoped
-- columns below, never these. They are dead weight to be removed in a later
-- cleanup migration once nothing references them.

ALTER TABLE research_project_evidence
  ADD COLUMN IF NOT EXISTS target_responses      integer,
  ADD COLUMN IF NOT EXISTS creative_design        text,
  ADD COLUMN IF NOT EXISTS target_reached_action  text,
  ADD COLUMN IF NOT EXISTS target_reached_at      timestamptz;

-- Backfill: every project's current project-level values copy onto the
-- research_project_evidence row for its current primary survey
-- (research_projects.survey_id) — the one survey that was actually driving
-- Generate Deployments/Research Target/Creative Design before this
-- migration — so existing configuration isn't silently lost. Projects with
-- no survey_id (nothing was ever configured) or no matching evidence row
-- (shouldn't happen — survey_id is only ever set from an attached evidence
-- row — but guarded regardless) are simply skipped, left at NULL.
UPDATE research_project_evidence rpe
SET
  target_responses     = rp.target_responses,
  creative_design      = rp.creative_design,
  target_reached_action = rp.target_reached_action,
  target_reached_at    = rp.target_reached_at
FROM research_projects rp
WHERE rpe.research_project_id = rp.id
  AND rpe.evidence_type = 'survey'
  AND rpe.evidence_id = rp.survey_id
  AND rp.survey_id IS NOT NULL;

-- Rollback:
--   ALTER TABLE research_project_evidence
--     DROP COLUMN IF EXISTS target_responses,
--     DROP COLUMN IF EXISTS creative_design,
--     DROP COLUMN IF EXISTS target_reached_action,
--     DROP COLUMN IF EXISTS target_reached_at;
