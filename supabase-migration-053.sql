-- Migration 053: Seed organisations from existing free-text data
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Populates the organisations table (supabase-migration-052.sql) from
-- every distinct publisher/brand name currently scattered as free text
-- across the publishers registry, campaigns, campaign_groups,
-- research_projects, and users.organisation_name. This is a best-effort
-- reconciliation of historical string data, not a perfect one — after
-- running this, review the organisations table for near-duplicate names
-- (e.g. "FotMob" vs "Fotmob") and merge/fix them before
-- supabase-migration-057.sql's FK backfill runs, since a typo would
-- otherwise resolve to two different organisations instead of one.
--
-- Insert order matters where a name could plausibly appear in more than
-- one context: the dedicated `publishers` registry is treated as the most
-- authoritative source of truth for type='publisher', so it's inserted
-- first; everything else is ON CONFLICT DO NOTHING against the
-- case-insensitive unique name index, so later inserts never override an
-- earlier classification.

-- 1. The existing publishers registry (most authoritative for type='publisher').
INSERT INTO organisations (name, type)
SELECT DISTINCT name, 'publisher'
FROM publishers
WHERE name IS NOT NULL AND trim(name) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- 2. Publisher names referenced on campaigns.
INSERT INTO organisations (name, type)
SELECT DISTINCT publisher, 'publisher'
FROM campaigns
WHERE publisher IS NOT NULL AND trim(publisher) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- 3. Publisher names referenced on campaign_groups.
INSERT INTO organisations (name, type)
SELECT DISTINCT publisher, 'publisher'
FROM campaign_groups
WHERE publisher IS NOT NULL AND trim(publisher) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- 4. Publisher names referenced on research_projects (plural — a project
--    can target several publishers before per-publisher campaigns exist).
INSERT INTO organisations (name, type)
SELECT DISTINCT p, 'publisher'
FROM research_projects, unnest(publishers) AS p
WHERE p IS NOT NULL AND trim(p) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- 5. Brand names referenced on campaigns.
INSERT INTO organisations (name, type)
SELECT DISTINCT brand_name, 'brand'
FROM campaigns
WHERE brand_name IS NOT NULL AND trim(brand_name) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- 6. Brand names referenced on campaign_groups.
INSERT INTO organisations (name, type)
SELECT DISTINCT brand_name, 'brand'
FROM campaign_groups
WHERE brand_name IS NOT NULL AND trim(brand_name) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- 7. Brand names referenced on research_projects.
INSERT INTO organisations (name, type)
SELECT DISTINCT brand_name, 'brand'
FROM research_projects
WHERE brand_name IS NOT NULL AND trim(brand_name) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- 8. Existing users' own organisation_name, typed by their role
--    (admin accounts are treated as Internal — e.g. "The Football
--    Collective" — since they aren't a publisher/agency/brand).
INSERT INTO organisations (name, type)
SELECT DISTINCT organisation_name,
  CASE role
    WHEN 'publisher' THEN 'publisher'
    WHEN 'agency'    THEN 'agency'
    WHEN 'brand'     THEN 'brand'
    ELSE 'internal'
  END
FROM users
WHERE organisation_name IS NOT NULL AND trim(organisation_name) <> ''
ON CONFLICT (LOWER(name)) WHERE deleted_at IS NULL DO NOTHING;

-- Rollback:
--   Not reversible in isolation (organisations rows created here may
--   already be referenced by later migrations' FK backfills). To undo the
--   whole Phase 1 rollout, roll back in reverse order starting from the
--   highest-numbered migration in this set.
