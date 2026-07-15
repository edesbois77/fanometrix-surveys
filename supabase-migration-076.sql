-- Migration 076: Simulation — is_simulated on campaigns, surveys, social_searches
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 2 (1 of 6) of the Demo Projects blueprint. Propagates the
-- provenance flag one level down from research_projects.research_mode
-- (migration 075) onto the three source-bearing tables that will later
-- hold simulated content. All defaults are 'false' — nothing simulated
-- exists yet, so every existing row stays exactly as it is.
--
-- campaigns also gets a CHECK forbidding a standalone simulated
-- campaign: is_simulated = true is only ever valid when
-- research_project_id is set, per the blueprint's "no standalone
-- simulated campaigns" rule. Every existing campaign row already has
-- is_simulated = false (the new default), so this constraint is
-- trivially satisfied for all of them regardless of whether
-- research_project_id is set — it only starts constraining future
-- writes.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_simulated_requires_project
    CHECK (is_simulated = false OR research_project_id IS NOT NULL);

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;

ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false;

-- Rollback:
--   ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_simulated_requires_project;
--   ALTER TABLE campaigns DROP COLUMN IF EXISTS is_simulated;
--   ALTER TABLE surveys DROP COLUMN IF EXISTS is_simulated;
--   ALTER TABLE social_searches DROP COLUMN IF EXISTS is_simulated;
