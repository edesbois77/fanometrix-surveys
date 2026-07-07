-- Migration 066: Standardize naming fields — study_type + Brand/Agency on Surveys
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Part of consolidating the Name Builder across Campaigns, Campaign Groups,
-- Surveys, and Research Projects onto one identical pattern: Topic, Brand,
-- Agency, Type. Two changes:
--
-- 1. campaigns.research_theme and campaign_groups.research_theme and
--    surveys.research_theme are renamed to study_type and constrained to
--    the same 12-value enum research_projects.study_type already uses
--    (lib/naming.ts's STUDY_TYPES). Existing free-text values are
--    best-effort matched to a label (case-insensitive) before the
--    constraint is added; anything that doesn't match becomes 'custom' —
--    verified against live data (campaigns: "Fan Understanding" and
--    "Event/Tournament" match cleanly, "Test" and "Women's World Cup" and
--    nulls fall to custom; surveys: "Fan Understanding" matches, "Women's
--    World Cup"/"Consumption Habits"/"WWC"/nulls fall to custom;
--    campaign_groups has no rows yet).
--
-- 2. surveys gets brand_org_id/agency_org_id (previously Brand was free
--    text and Agency didn't exist at all on Surveys). brand_org_id is
--    backfilled by case-insensitive name match against the existing
--    brand_name text where a type='brand' organisation exists with that
--    name; for the two rows that don't match ("Gen Alpha / Gen Z",
--    "UEFA Champions League" — not real brands, verified against live
--    data), the value is moved into topic instead of silently discarded,
--    since it was functioning as a topic anyway. brand_name is then
--    dropped — only ~8 survey rows exist, low risk.
--
-- IMPORTANT — run this promptly alongside deploying the code that reads
-- study_type/brand_org_id/agency_org_id instead of research_theme/
-- brand_name: old code paths reference columns this migration renames
-- or drops.

-- ── 1a. campaigns.research_theme → study_type ───────────────────────────────
ALTER TABLE campaigns RENAME COLUMN research_theme TO study_type;
UPDATE campaigns SET study_type = CASE lower(trim(study_type))
  WHEN 'fan understanding'        THEN 'fan_understanding'
  WHEN 'brand health'             THEN 'brand_health'
  WHEN 'sponsorship'              THEN 'sponsorship'
  WHEN 'rules & regulations'      THEN 'rules_regulations'
  WHEN 'event/tournament'         THEN 'event_tournament'
  WHEN 'product research'         THEN 'product_research'
  WHEN 'media consumption'        THEN 'media_consumption'
  WHEN 'purchase intent'          THEN 'purchase_intent'
  WHEN 'attitudes & behaviours'   THEN 'attitudes_behaviours'
  WHEN 'creative testing'         THEN 'creative_testing'
  WHEN 'audience profiling'       THEN 'audience_profiling'
  ELSE 'custom'
END;
ALTER TABLE campaigns ALTER COLUMN study_type SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN study_type SET DEFAULT 'custom';
ALTER TABLE campaigns ADD CONSTRAINT campaigns_study_type_check CHECK (study_type IN (
  'fan_understanding','brand_health','sponsorship','rules_regulations',
  'event_tournament','product_research','media_consumption','purchase_intent',
  'attitudes_behaviours','creative_testing','audience_profiling','custom'
));

-- ── 1b. campaign_groups.research_theme → study_type ─────────────────────────
ALTER TABLE campaign_groups RENAME COLUMN research_theme TO study_type;
UPDATE campaign_groups SET study_type = CASE lower(trim(study_type))
  WHEN 'fan understanding'        THEN 'fan_understanding'
  WHEN 'brand health'             THEN 'brand_health'
  WHEN 'sponsorship'              THEN 'sponsorship'
  WHEN 'rules & regulations'      THEN 'rules_regulations'
  WHEN 'event/tournament'         THEN 'event_tournament'
  WHEN 'product research'         THEN 'product_research'
  WHEN 'media consumption'        THEN 'media_consumption'
  WHEN 'purchase intent'          THEN 'purchase_intent'
  WHEN 'attitudes & behaviours'   THEN 'attitudes_behaviours'
  WHEN 'creative testing'         THEN 'creative_testing'
  WHEN 'audience profiling'       THEN 'audience_profiling'
  ELSE 'custom'
END;
ALTER TABLE campaign_groups ALTER COLUMN study_type SET NOT NULL;
ALTER TABLE campaign_groups ALTER COLUMN study_type SET DEFAULT 'custom';
ALTER TABLE campaign_groups ADD CONSTRAINT campaign_groups_study_type_check CHECK (study_type IN (
  'fan_understanding','brand_health','sponsorship','rules_regulations',
  'event_tournament','product_research','media_consumption','purchase_intent',
  'attitudes_behaviours','creative_testing','audience_profiling','custom'
));

-- ── 1c. surveys.research_theme → study_type ─────────────────────────────────
ALTER TABLE surveys RENAME COLUMN research_theme TO study_type;
UPDATE surveys SET study_type = CASE lower(trim(study_type))
  WHEN 'fan understanding'        THEN 'fan_understanding'
  WHEN 'brand health'             THEN 'brand_health'
  WHEN 'sponsorship'              THEN 'sponsorship'
  WHEN 'rules & regulations'      THEN 'rules_regulations'
  WHEN 'event/tournament'         THEN 'event_tournament'
  WHEN 'product research'         THEN 'product_research'
  WHEN 'media consumption'        THEN 'media_consumption'
  WHEN 'purchase intent'          THEN 'purchase_intent'
  WHEN 'attitudes & behaviours'   THEN 'attitudes_behaviours'
  WHEN 'creative testing'         THEN 'creative_testing'
  WHEN 'audience profiling'       THEN 'audience_profiling'
  ELSE 'custom'
END;
ALTER TABLE surveys ALTER COLUMN study_type SET NOT NULL;
ALTER TABLE surveys ALTER COLUMN study_type SET DEFAULT 'custom';
ALTER TABLE surveys ADD CONSTRAINT surveys_study_type_check CHECK (study_type IN (
  'fan_understanding','brand_health','sponsorship','rules_regulations',
  'event_tournament','product_research','media_consumption','purchase_intent',
  'attitudes_behaviours','creative_testing','audience_profiling','custom'
));

-- ── 2. surveys: brand_org_id + agency_org_id, backfill, drop brand_name ─────
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS brand_org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agency_org_id uuid REFERENCES organisations(id) ON DELETE SET NULL;

UPDATE surveys s SET brand_org_id = o.id
FROM organisations o
WHERE s.brand_org_id IS NULL
  AND s.brand_name IS NOT NULL AND trim(s.brand_name) <> ''
  AND lower(trim(s.brand_name)) = lower(o.name)
  AND o.type = 'brand';

-- Anything that didn't match a real brand org was functioning as a topic
-- anyway (verified against live data) — preserve it there instead of
-- discarding it when brand_name is dropped below.
UPDATE surveys SET topic = brand_name
WHERE brand_org_id IS NULL
  AND brand_name IS NOT NULL AND trim(brand_name) <> ''
  AND (topic IS NULL OR trim(topic) = '');

ALTER TABLE surveys DROP COLUMN IF EXISTS brand_name;

-- Rollback:
--   ALTER TABLE campaigns ADD COLUMN research_theme text;
--   UPDATE campaigns SET research_theme = study_type;
--   ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_study_type_check;
--   ALTER TABLE campaigns DROP COLUMN study_type;
--   (repeat the equivalent for campaign_groups and surveys)
--   ALTER TABLE surveys ADD COLUMN brand_name text;
--   UPDATE surveys s SET brand_name = o.name FROM organisations o WHERE s.brand_org_id = o.id;
--   ALTER TABLE surveys DROP COLUMN brand_org_id, DROP COLUMN agency_org_id;
--   -- Note: topic values merged in from brand_name during backfill are not distinguishable and won't un-merge.
