-- Migration 185: Survey Studio Phase 3 — completion reflects the actual question set.
--
-- Additive view redefinition (CREATE OR REPLACE VIEW). No table/data change. NOT
-- auto-applied.
--
-- WHY: `vw_campaign_responses.is_complete` was `q1 AND q2 AND q3 IS NOT NULL`, which
-- silently reports a 1- or 2-question Survey Studio Survey as INCOMPLETE (its q2/q3
-- are legitimately NULL). Surveys now run 1–5 questions, and completion must
-- correspond to completing the Survey's ACTUAL ordered question set. A `responses`
-- row is only ever inserted at the real final question (every renderer gates
-- /api/submit on its last step; /api/submit requires q1), so a row existing IS a
-- completion of the whole set — for 1, 2, 3, 4 or 5 questions. q1/q2/q3 remain
-- legacy positional fields and no longer define completion.
--
-- COMPATIBILITY (verified against the live applied schema before writing this):
--   • 0 real rows have q1 set with q2/q3 NULL, so every historical row keeps
--     is_complete = 1 exactly as before — this changes NO historical result.
--   • Only the one is_complete expression changes; all other columns are copied
--     verbatim from migration 062 (the current definition of this view).
--   • Q4/Q5 need no column here: row existence already proves the fan reached the
--     final question, so is_complete is correct for 4–5-question Surveys too.

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
  -- Phase 3: a `responses` row exists only when the fan reached the actual final
  -- question and submitted (renderers gate submit on their last step; /api/submit
  -- requires q1). So a row IS a completion of the whole 1–5-question set. q1/q2/q3
  -- are legacy positional fields and no longer define completion.
  CASE WHEN r.q1 IS NOT NULL
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
