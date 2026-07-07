-- Migration 057: Add organisation FK columns to Campaigns, Campaign
-- Groups, and Research Projects
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Converts the free-text publisher/brand_name fields on these 3 tables to
-- real organisation_id foreign keys (Publisher, Brand, and Agency
-- relationships), backfilled by matching against the organisations table
-- seeded in supabase-migration-053.sql. The original text columns
-- (publisher, brand_name, publishers) are left in place — application
-- code is updated to read/write the new *_org_id columns in a following
-- change; the text columns are dropped in a later cleanup migration once
-- that rollout is verified. Review the organisations table for
-- near-duplicate names (e.g. "FotMob" vs "Fotmob") before that cleanup
-- runs, since a typo would otherwise have backfilled to two different
-- organisations instead of one.

-- ── campaigns ──────────────────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS publisher_org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_org_id     uuid REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agency_org_id    uuid REFERENCES organisations(id) ON DELETE SET NULL;

UPDATE campaigns c SET publisher_org_id = o.id
FROM organisations o
WHERE c.publisher_org_id IS NULL AND c.publisher IS NOT NULL AND trim(c.publisher) <> ''
  AND LOWER(o.name) = LOWER(c.publisher) AND o.deleted_at IS NULL;

UPDATE campaigns c SET brand_org_id = o.id
FROM organisations o
WHERE c.brand_org_id IS NULL AND c.brand_name IS NOT NULL AND trim(c.brand_name) <> ''
  AND LOWER(o.name) = LOWER(c.brand_name) AND o.deleted_at IS NULL;
-- agency_org_id has no prior source data on campaigns — starts null,
-- assigned going forward through the app.

CREATE INDEX IF NOT EXISTS idx_campaigns_publisher_org_id ON campaigns (publisher_org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_brand_org_id     ON campaigns (brand_org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_agency_org_id    ON campaigns (agency_org_id);

-- ── campaign_groups ────────────────────────────────────────────────────
ALTER TABLE campaign_groups
  ADD COLUMN IF NOT EXISTS publisher_org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_org_id     uuid REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agency_org_id    uuid REFERENCES organisations(id) ON DELETE SET NULL;

UPDATE campaign_groups g SET publisher_org_id = o.id
FROM organisations o
WHERE g.publisher_org_id IS NULL AND g.publisher IS NOT NULL AND trim(g.publisher) <> ''
  AND LOWER(o.name) = LOWER(g.publisher) AND o.deleted_at IS NULL;

UPDATE campaign_groups g SET brand_org_id = o.id
FROM organisations o
WHERE g.brand_org_id IS NULL AND g.brand_name IS NOT NULL AND trim(g.brand_name) <> ''
  AND LOWER(o.name) = LOWER(g.brand_name) AND o.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_groups_publisher_org_id ON campaign_groups (publisher_org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_groups_brand_org_id     ON campaign_groups (brand_org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_groups_agency_org_id    ON campaign_groups (agency_org_id);

-- ── research_projects ──────────────────────────────────────────────────
-- publishers is plural (a project can target several publishers before
-- per-publisher campaigns are generated), so it becomes an array of FKs
-- rather than a single one. Postgres can't enforce element-level FK
-- constraints on an array column — validity is enforced at the
-- application layer (research-projects API / lib/access.ts), same as the
-- current text[] column already is today.
ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS publisher_org_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brand_org_id      uuid REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agency_org_id     uuid REFERENCES organisations(id) ON DELETE SET NULL;

UPDATE research_projects rp SET publisher_org_ids = sub.ids
FROM (
  SELECT rp2.id, array_agg(DISTINCT o.id) AS ids
  FROM research_projects rp2, unnest(rp2.publishers) AS p
  JOIN organisations o ON LOWER(o.name) = LOWER(p) AND o.deleted_at IS NULL
  GROUP BY rp2.id
) sub
WHERE rp.id = sub.id AND rp.publisher_org_ids = '{}';

UPDATE research_projects rp SET brand_org_id = o.id
FROM organisations o
WHERE rp.brand_org_id IS NULL AND rp.brand_name IS NOT NULL AND trim(rp.brand_name) <> ''
  AND LOWER(o.name) = LOWER(rp.brand_name) AND o.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_research_projects_brand_org_id     ON research_projects (brand_org_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_agency_org_id    ON research_projects (agency_org_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_publisher_org_ids ON research_projects USING gin (publisher_org_ids);

-- Rollback:
--   ALTER TABLE campaigns DROP COLUMN IF EXISTS publisher_org_id, DROP COLUMN IF EXISTS brand_org_id, DROP COLUMN IF EXISTS agency_org_id;
--   ALTER TABLE campaign_groups DROP COLUMN IF EXISTS publisher_org_id, DROP COLUMN IF EXISTS brand_org_id, DROP COLUMN IF EXISTS agency_org_id;
--   ALTER TABLE research_projects DROP COLUMN IF EXISTS publisher_org_ids, DROP COLUMN IF EXISTS brand_org_id, DROP COLUMN IF EXISTS agency_org_id;
