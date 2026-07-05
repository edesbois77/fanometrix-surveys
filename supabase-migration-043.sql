-- Migration 043: Research Projects
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Introduces Research Projects as a new parent layer above Campaigns:
--   Survey Template → Research Project → Campaign Deployments → Responses
--
-- A Research Project is a pure organisational/generation layer: it groups
-- deployments, supplies default field values at generation time, and lets
-- fields be inherited (campaign column NULL) or overridden (non-NULL) per
-- deployment. It does not change embed resolution, status lifecycle, or
-- response collection — those remain entirely campaign-level, unchanged.
--
-- Non-destructive: existing campaigns get research_project_id = NULL
-- (standalone), no backfill required, no response data touched.
--
-- Rollback:
--   DROP VIEW IF EXISTS vw_research_project_stats;
--   ALTER TABLE campaigns DROP COLUMN IF EXISTS research_project_id, DROP COLUMN IF EXISTS tags;
--   DROP TABLE IF EXISTS research_projects;
--   -- Restoring archive_after_days NOT NULL DEFAULT 90 requires backfilling
--   -- any NULLs first: UPDATE campaigns SET archive_after_days = 90 WHERE archive_after_days IS NULL;

-- ── 1. research_projects table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS research_projects (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             text        NOT NULL UNIQUE,   -- slug used as stable identifier
  project_name           text        NOT NULL,
  brand_name             text,
  study_type             text        NOT NULL
                         CHECK (study_type IN (
                           'fan_understanding', 'brand_health', 'sponsorship',
                           'rules_regulations', 'event_tournament', 'product_research',
                           'media_consumption', 'purchase_intent',
                           'attitudes_behaviours', 'creative_testing',
                           'audience_profiling', 'custom'
                         )),
  topic                  text,
  tags                   text[]      NOT NULL DEFAULT '{}',
  description            text,
  year                   text,
  start_date             date,
  end_date               date,
  survey_id              uuid        REFERENCES surveys(id) ON DELETE SET NULL,
  target_responses       integer,
  archive_after_days     integer,
  status                 text        NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'scheduled', 'live', 'paused', 'closed', 'archived')),
  created_by             text,
  deleted_at             timestamptz,
  deleted_by             text,
  delete_reason          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_projects_study_type ON research_projects (study_type);
CREATE INDEX IF NOT EXISTS idx_research_projects_tags       ON research_projects USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_research_projects_deleted_at ON research_projects (deleted_at);

ALTER TABLE research_projects ENABLE ROW LEVEL SECURITY;

-- Admin/service-role only — matches publishers, campaign_notifications, insights.
-- Brand/agency read scoping happens at the API layer (service-role client),
-- since it depends on users.associated_brand/associated_projects matching.
CREATE POLICY "deny_all_anon" ON research_projects USING (false);

-- ── 2. campaigns: link to research_projects, add tags, relax archive_after_days ──

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS research_project_id uuid REFERENCES research_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[];

CREATE INDEX IF NOT EXISTS idx_campaigns_research_project_id ON campaigns (research_project_id);

-- NULL now means "inherit archive_after_days from the linked research project."
-- Existing rows keep whatever value they already have; this only permits
-- future inserts/updates to store NULL.
ALTER TABLE campaigns ALTER COLUMN archive_after_days DROP NOT NULL;
ALTER TABLE campaigns ALTER COLUMN archive_after_days DROP DEFAULT;

-- ── 3. Rollup stats view for the Research Project dashboard ─────────────────
-- Mirrors vw_campaign_stats' purpose (migration 009): a cheap aggregate for
-- a list page. Field-level inheritance resolution (survey/dates/target/
-- archive/tags) stays in the API layer, not here.

CREATE OR REPLACE VIEW vw_research_project_stats AS
SELECT
  p.id                                  AS project_db_id,
  p.project_id,
  COUNT(DISTINCT c.id)                  AS deployment_count,
  COUNT(DISTINCT c.publisher)           AS publisher_count,
  COUNT(DISTINCT c.country_code)        AS country_count,
  COALESCE(SUM(vcs.response_count), 0)  AS total_responses
FROM research_projects p
LEFT JOIN campaigns c
  ON c.research_project_id = p.id AND c.deleted_at IS NULL
LEFT JOIN vw_campaign_stats vcs
  ON vcs.campaign_id = c.campaign_id
GROUP BY p.id, p.project_id;

GRANT SELECT ON vw_research_project_stats TO anon, authenticated;
