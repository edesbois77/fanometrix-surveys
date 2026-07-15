-- Migration 081: Simulation — evidence_simulations table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 5 of the Demo Projects blueprint. The generation-job record for
-- one run of the Simulation engine against a project: what was
-- configured, what it's made of, and where it's up to. V1 is Instant
-- generation only (per the blueprint's scope cut — no scheduled drip
-- delivery), so status only ever moves generating → ready|failed, once.
--
-- scenario_template_id is a bare uuid here, no REFERENCES yet —
-- scenario_templates doesn't exist until migration 082. The FK gets
-- added there, completing the same deferred-FK pattern already used
-- for research_summaries.evidence_simulation_id and
-- research_project_activity.evidence_simulation_id (migrations 079,
-- 080) — both of which get their FK to THIS table added below, now
-- that it exists.
--
-- A gap surfaced while building the generators this table exists to
-- support: neither responses nor social_mentions ever gained an
-- evidence_simulation_id column in the earlier migrations, but the
-- Reset design (blueprint §14) explicitly depends on being able to
-- query "every row belonging to this run" — impossible without it.
-- Added here rather than a new migration number, since it's the same
-- change as the FK completions above: wiring child tables up to the
-- table this migration introduces.

CREATE TABLE IF NOT EXISTS evidence_simulations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_project_id   uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  scenario_template_id  uuid,
  label                 text,
  source_config         jsonb       NOT NULL DEFAULT '{}',
  markets               text[]      NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'generating'
                        CHECK (status IN ('generating', 'ready', 'failed')),
  presented_count       integer     NOT NULL DEFAULT 0,
  generated_at          timestamptz,
  created_by            text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_simulations_project ON evidence_simulations (research_project_id);

ALTER TABLE evidence_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_evidence_simulations" ON evidence_simulations USING (false);

-- Complete the deferred FKs from migrations 079/080, now that the
-- target table exists.
ALTER TABLE research_summaries
  ADD CONSTRAINT research_summaries_evidence_simulation_fk
    FOREIGN KEY (evidence_simulation_id) REFERENCES evidence_simulations(id) ON DELETE SET NULL;

ALTER TABLE research_project_activity
  ADD CONSTRAINT research_project_activity_evidence_simulation_fk
    FOREIGN KEY (evidence_simulation_id) REFERENCES evidence_simulations(id) ON DELETE SET NULL;

-- responses/social_mentions — the missing run-scoping link (see note above).
ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS evidence_simulation_id uuid
    REFERENCES evidence_simulations(id) ON DELETE SET NULL;

ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS evidence_simulation_id uuid
    REFERENCES evidence_simulations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_responses_evidence_simulation ON responses (evidence_simulation_id) WHERE evidence_simulation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_mentions_evidence_simulation ON social_mentions (evidence_simulation_id) WHERE evidence_simulation_id IS NOT NULL;

-- Rollback:
--   DROP INDEX IF EXISTS idx_social_mentions_evidence_simulation;
--   DROP INDEX IF EXISTS idx_responses_evidence_simulation;
--   ALTER TABLE social_mentions DROP COLUMN IF EXISTS evidence_simulation_id;
--   ALTER TABLE responses DROP COLUMN IF EXISTS evidence_simulation_id;
--   ALTER TABLE research_project_activity DROP CONSTRAINT IF EXISTS research_project_activity_evidence_simulation_fk;
--   ALTER TABLE research_summaries DROP CONSTRAINT IF EXISTS research_summaries_evidence_simulation_fk;
--   DROP TABLE IF EXISTS evidence_simulations;
