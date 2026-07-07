-- Migration 062: Drop legacy publisher/brand text columns
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Completes the Organisations cutover. campaigns.publisher/brand_name,
-- campaign_groups.publisher/brand_name, and research_projects.publishers/
-- brand_name were the free-text fields organisations (migration 052) and
-- the *_org_id / publisher_org_ids FK columns (migration 057) replaced.
-- Every read across Campaigns, Campaign Groups, Research Projects, the
-- Generate Deployments flow, the embed/submit endpoints, Creative Designs,
-- Surveys' "campaigns using this survey" list, and the campaign detail page
-- has been migrated to resolve organisation names from the FK columns
-- instead, and the app no longer writes these text columns anywhere.
--
-- IMPORTANT — run this promptly after deploying the code that stops writing
-- these columns: campaigns.brand_name is NOT NULL with no default, so until
-- this migration runs, creating a new Campaign will fail (the app no longer
-- supplies a value for it). The other four columns are nullable or have a
-- default, so they carry no such urgency, but are dropped together here
-- since they're all part of the same cutover.
--
-- Two views depend on the columns being dropped from campaigns and must be
-- repointed at the FK columns first, or the DROP COLUMN statements below
-- fail with "cannot drop column ... because other objects depend on it":
--   vw_campaign_responses      (migration 006) selects c.brand_name as brand
--   vw_research_project_stats  (migration 043) does COUNT(DISTINCT c.publisher)
-- Both are CREATE OR REPLACE VIEW, so this only swaps what feeds the
-- existing "brand" / "publisher_count" output columns — nothing consuming
-- these views (dashboard, Looker, Research Projects stats) needs to change.

CREATE OR REPLACE VIEW vw_campaign_responses AS
SELECT
  r.id                                              AS response_id,
  r.campaign_id                                     AS campaign_slug,
  c.id::text                                        AS campaign_id,
  c.campaign_name,
  ob.name                                           AS brand,
  r.survey_id::text                                 AS survey_id,
  s.id::text                                        AS survey_slug,
  s.name                                            AS survey_name,
  CASE lower(trim(coalesce(r.publisher, '')))
    WHEN 'fot mob'        THEN 'FotMob'
    WHEN 'fotmob'         THEN 'FotMob'
    WHEN 'forzafootball'  THEN 'Forza Football'
    WHEN 'forza-football' THEN 'Forza Football'
    ELSE nullif(trim(r.publisher), '')
  END                                                AS publisher,
  CASE lower(trim(coalesce(r.placement, '')))
    WHEN 'homepage mpu'     THEN 'homepage-mpu'
    WHEN 'homepage_mpu'     THEN 'homepage-mpu'
    WHEN 'match centre mpu' THEN 'match-centre-mpu'
    WHEN 'match center mpu' THEN 'match-centre-mpu'
    WHEN 'lineups mpu'      THEN 'lineups-mpu'
    WHEN 'article inline'   THEN 'article-inline'
    WHEN 'article footer'   THEN 'article-footer'
    WHEN 'team page mpu'    THEN 'team-page-mpu'
    WHEN 'league page mpu'  THEN 'league-page-mpu'
    ELSE nullif(trim(r.placement), '')
  END                                                AS placement,
  r.club, r.competition,
  CASE lower(trim(coalesce(r.country, '')))
    WHEN 'gb'  THEN 'United Kingdom'  WHEN 'uk'  THEN 'United Kingdom'
    WHEN 'gbr' THEN 'United Kingdom'  WHEN 'united kingdom' THEN 'United Kingdom'
    WHEN 'us'  THEN 'United States'   WHEN 'usa' THEN 'United States'
    WHEN 'united states' THEN 'United States'
    WHEN 'fr'  THEN 'France'     WHEN 'fra' THEN 'France'     WHEN 'france' THEN 'France'
    WHEN 'de'  THEN 'Germany'    WHEN 'deu' THEN 'Germany'    WHEN 'germany' THEN 'Germany'
    WHEN 'es'  THEN 'Spain'      WHEN 'esp' THEN 'Spain'      WHEN 'spain' THEN 'Spain'
    WHEN 'it'  THEN 'Italy'      WHEN 'ita' THEN 'Italy'      WHEN 'italy' THEN 'Italy'
    WHEN 'br'  THEN 'Brazil'     WHEN 'bra' THEN 'Brazil'     WHEN 'brazil' THEN 'Brazil'
    WHEN 'ar'  THEN 'Argentina'  WHEN 'arg' THEN 'Argentina'  WHEN 'argentina' THEN 'Argentina'
    WHEN 'au'  THEN 'Australia'  WHEN 'aus' THEN 'Australia'  WHEN 'australia' THEN 'Australia'
    WHEN 'jp'  THEN 'Japan'      WHEN 'jpn' THEN 'Japan'      WHEN 'japan' THEN 'Japan'
    WHEN 'nl'  THEN 'Netherlands' WHEN 'ned' THEN 'Netherlands' WHEN 'netherlands' THEN 'Netherlands'
    WHEN 'be'  THEN 'Belgium'    WHEN 'bel' THEN 'Belgium'    WHEN 'belgium' THEN 'Belgium'
    WHEN 'pt'  THEN 'Portugal'   WHEN 'por' THEN 'Portugal'   WHEN 'portugal' THEN 'Portugal'
    WHEN 'mx'  THEN 'Mexico'     WHEN 'mex' THEN 'Mexico'     WHEN 'mexico' THEN 'Mexico'
    WHEN 'za'  THEN 'South Africa' WHEN 'rsa' THEN 'South Africa' WHEN 'south africa' THEN 'South Africa'
    WHEN 'ng'  THEN 'Nigeria'    WHEN 'nga' THEN 'Nigeria'    WHEN 'nigeria' THEN 'Nigeria'
    WHEN 'in'  THEN 'India'      WHEN 'ind' THEN 'India'      WHEN 'india' THEN 'India'
    WHEN 'ca'  THEN 'Canada'     WHEN 'can' THEN 'Canada'     WHEN 'canada' THEN 'Canada'
    WHEN 'ie'  THEN 'Ireland'    WHEN 'irl' THEN 'Ireland'    WHEN 'ireland' THEN 'Ireland'
    ELSE nullif(trim(r.country), '')
  END                                                AS country,
  r.fan_segment, r.device, r.browser,
  r.q1, r.q2, r.q3,
  r.response_duration_seconds,
  CASE WHEN r.q1 IS NOT NULL AND r.q2 IS NOT NULL AND r.q3 IS NOT NULL
    THEN 1 ELSE 0 END                               AS is_complete,
  r.is_demo,

  r.created_at                                      AS submitted_at,
  r.created_at::date                                AS response_date,
  date_trunc('week',  r.created_at)::date           AS response_week,
  date_trunc('month', r.created_at)::date           AS response_month,
  extract(year  FROM r.created_at)::int             AS response_year,
  extract(month FROM r.created_at)::int             AS response_month_num,
  to_char(r.created_at, 'YYYY-MM')                  AS response_month_label,
  to_char(r.created_at, 'Day')                      AS response_day_of_week,

  extract(hour FROM r.created_at)::int              AS response_hour,
  CASE
    WHEN extract(hour FROM r.created_at) BETWEEN  5 AND 11 THEN 'Morning'
    WHEN extract(hour FROM r.created_at) BETWEEN 12 AND 16 THEN 'Afternoon'
    WHEN extract(hour FROM r.created_at) BETWEEN 17 AND 21 THEN 'Evening'
    ELSE 'Night'
  END                                                AS response_daypart

FROM responses r
LEFT JOIN campaigns c      ON c.campaign_id = r.campaign_id
LEFT JOIN surveys   s      ON s.id::text    = r.survey_id
LEFT JOIN organisations ob ON ob.id         = c.brand_org_id;

GRANT SELECT ON vw_campaign_responses TO anon, authenticated;

CREATE OR REPLACE VIEW vw_research_project_stats AS
SELECT
  p.id                                  AS project_db_id,
  p.project_id,
  COUNT(DISTINCT c.id)                  AS deployment_count,
  COUNT(DISTINCT c.publisher_org_id)    AS publisher_count,
  COUNT(DISTINCT c.country_code)        AS country_count,
  COALESCE(SUM(vcs.response_count), 0)  AS total_responses
FROM research_projects p
LEFT JOIN campaigns c
  ON c.research_project_id = p.id AND c.deleted_at IS NULL
LEFT JOIN vw_campaign_stats vcs
  ON vcs.campaign_id = c.campaign_id
GROUP BY p.id, p.project_id;

GRANT SELECT ON vw_research_project_stats TO anon, authenticated;

ALTER TABLE campaigns
  DROP COLUMN IF EXISTS publisher,
  DROP COLUMN IF EXISTS brand_name;

ALTER TABLE campaign_groups
  DROP COLUMN IF EXISTS publisher,
  DROP COLUMN IF EXISTS brand_name;

ALTER TABLE research_projects
  DROP COLUMN IF EXISTS publishers,
  DROP COLUMN IF EXISTS brand_name;

-- Rollback (recreates the columns empty — original text values are not
-- recoverable once this migration runs; re-derive from organisations/
-- *_org_id if needed; also reverts the two views back to migration 006's
-- and migration 043's original definitions):
--   ALTER TABLE campaigns ADD COLUMN publisher text, ADD COLUMN brand_name text NOT NULL DEFAULT '';
--   ALTER TABLE campaigns ALTER COLUMN brand_name DROP DEFAULT;
--   ALTER TABLE campaign_groups ADD COLUMN publisher text, ADD COLUMN brand_name text;
--   ALTER TABLE research_projects ADD COLUMN publishers text[] NOT NULL DEFAULT '{}', ADD COLUMN brand_name text;
--   (then re-run the CREATE OR REPLACE VIEW statements from migration 006 and 043 as-is)
