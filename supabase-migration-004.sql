-- Migration 004: Reporting view, indexes and read-only access
-- Run in: supabase.com → your project → SQL Editor → New query → Run

-- ── Performance indexes ───────────────────────────────────────────────────────
-- These speed up filtering on the most common query dimensions.

create index if not exists idx_responses_campaign_id   on responses (campaign_id);
create index if not exists idx_responses_submitted_at  on responses (created_at desc);
create index if not exists idx_responses_country       on responses (country);
create index if not exists idx_responses_publisher     on responses (publisher);
create index if not exists idx_responses_placement     on responses (placement);
create index if not exists idx_responses_campaign_date on responses (campaign_id, created_at desc);

-- ── Reporting view ────────────────────────────────────────────────────────────
-- One row per response, with normalised dimensions and pre-built date fields.
-- Looker Studio can connect directly to this view via the PostgreSQL connector.

create or replace view vw_campaign_responses as
select
  -- ── Response identity
  r.id                                              as response_id,

  -- ── Campaign (joined from campaigns table)
  r.campaign_id                                     as campaign_slug,
  c.id::text                                        as campaign_id,
  c.campaign_name,
  c.brand_name                                      as brand,

  -- ── Survey (joined from surveys table)
  r.survey_id::text                                 as survey_id,
  s.id::text                                        as survey_slug,
  s.name                                            as survey_name,

  -- ── Publisher (normalised)
  case lower(trim(coalesce(r.publisher, '')))
    when 'fot mob'         then 'FotMob'
    when 'fotmob'          then 'FotMob'
    when 'forzafootball'   then 'Forza Football'
    when 'forza-football'  then 'Forza Football'
    else nullif(trim(r.publisher), '')
  end                                               as publisher,

  -- ── Placement (normalised)
  case lower(trim(coalesce(r.placement, '')))
    when 'homepage mpu'       then 'homepage-mpu'
    when 'homepage_mpu'       then 'homepage-mpu'
    when 'match centre mpu'   then 'match-centre-mpu'
    when 'match center mpu'   then 'match-centre-mpu'
    when 'match_centre_mpu'   then 'match-centre-mpu'
    when 'lineups mpu'        then 'lineups-mpu'
    when 'lineups_mpu'        then 'lineups-mpu'
    when 'article inline'     then 'article-inline'
    when 'article_inline'     then 'article-inline'
    when 'article footer'     then 'article-footer'
    when 'article_footer'     then 'article-footer'
    when 'team page mpu'      then 'team-page-mpu'
    when 'team_page_mpu'      then 'team-page-mpu'
    when 'league page mpu'    then 'league-page-mpu'
    when 'league_page_mpu'    then 'league-page-mpu'
    else nullif(trim(r.placement), '')
  end                                               as placement,

  -- ── Other dimensions
  r.club,
  r.competition,

  -- ── Country (normalised)
  case lower(trim(coalesce(r.country, '')))
    when 'gb'                       then 'United Kingdom'
    when 'uk'                       then 'United Kingdom'
    when 'g.b.'                     then 'United Kingdom'
    when 'gbr'                      then 'United Kingdom'
    when 'united kingdom'           then 'United Kingdom'
    when 'us'                       then 'United States'
    when 'usa'                      then 'United States'
    when 'u.s.'                     then 'United States'
    when 'u.s.a.'                   then 'United States'
    when 'united states'            then 'United States'
    when 'united states of america' then 'United States'
    when 'fr'                       then 'France'
    when 'fra'                      then 'France'
    when 'france'                   then 'France'
    when 'de'                       then 'Germany'
    when 'deu'                      then 'Germany'
    when 'germany'                  then 'Germany'
    when 'deutschland'              then 'Germany'
    when 'es'                       then 'Spain'
    when 'esp'                      then 'Spain'
    when 'spain'                    then 'Spain'
    when 'it'                       then 'Italy'
    when 'ita'                      then 'Italy'
    when 'italy'                    then 'Italy'
    when 'br'                       then 'Brazil'
    when 'bra'                      then 'Brazil'
    when 'brazil'                   then 'Brazil'
    when 'ar'                       then 'Argentina'
    when 'arg'                      then 'Argentina'
    when 'argentina'                then 'Argentina'
    when 'au'                       then 'Australia'
    when 'aus'                      then 'Australia'
    when 'australia'                then 'Australia'
    when 'jp'                       then 'Japan'
    when 'jpn'                      then 'Japan'
    when 'japan'                    then 'Japan'
    when 'nl'                       then 'Netherlands'
    when 'ned'                      then 'Netherlands'
    when 'netherlands'              then 'Netherlands'
    when 'holland'                  then 'Netherlands'
    when 'be'                       then 'Belgium'
    when 'bel'                      then 'Belgium'
    when 'belgium'                  then 'Belgium'
    when 'pt'                       then 'Portugal'
    when 'por'                      then 'Portugal'
    when 'portugal'                 then 'Portugal'
    when 'mx'                       then 'Mexico'
    when 'mex'                      then 'Mexico'
    when 'mexico'                   then 'Mexico'
    when 'za'                       then 'South Africa'
    when 'rsa'                      then 'South Africa'
    when 'south africa'             then 'South Africa'
    when 'ng'                       then 'Nigeria'
    when 'nga'                      then 'Nigeria'
    when 'nigeria'                  then 'Nigeria'
    when 'in'                       then 'India'
    when 'ind'                      then 'India'
    when 'india'                    then 'India'
    when 'ca'                       then 'Canada'
    when 'can'                      then 'Canada'
    when 'canada'                   then 'Canada'
    when 'ie'                       then 'Ireland'
    when 'irl'                      then 'Ireland'
    when 'ireland'                  then 'Ireland'
    when 'sa'                       then 'Saudi Arabia'
    when 'ksa'                      then 'Saudi Arabia'
    when 'saudi arabia'             then 'Saudi Arabia'
    when 'ae'                       then 'United Arab Emirates'
    when 'uae'                      then 'United Arab Emirates'
    when 'united arab emirates'     then 'United Arab Emirates'
    else nullif(trim(r.country), '')
  end                                               as country,

  r.fan_segment,
  r.device,
  r.browser,

  -- ── Question responses
  r.q1,
  r.q2,
  r.q3,

  -- ── Performance
  r.response_duration_seconds,

  -- ── Measures (use these in Looker Studio calculated fields)
  -- total_responses  = COUNT(response_id)
  -- completion_rate  = AVG(is_complete) * 100
  -- avg_response_time = AVG(response_duration_seconds)
  case when r.q1 is not null and r.q2 is not null and r.q3 is not null
    then 1 else 0 end                              as is_complete,

  -- ── Date dimensions
  r.created_at                                     as submitted_at,
  r.created_at::date                               as response_date,
  date_trunc('week',  r.created_at)::date          as response_week,
  date_trunc('month', r.created_at)::date          as response_month,
  extract(year  from r.created_at)::int            as response_year,
  extract(month from r.created_at)::int            as response_month_num,
  to_char(r.created_at, 'YYYY-MM')                 as response_month_label,
  to_char(r.created_at, 'Day')                     as response_day_of_week

from responses r
left join campaigns c on c.campaign_id = r.campaign_id
left join surveys   s on s.id::text    = r.survey_id;  -- cast uuid→text to match responses.survey_id (text)

-- ── Grant read access to Supabase roles ──────────────────────────────────────
-- Required for the Supabase JS client (anon key) to query the view.

grant select on vw_campaign_responses to anon;
grant select on vw_campaign_responses to authenticated;

-- ── Direct PostgreSQL access for Looker Studio ────────────────────────────────
-- To connect Looker Studio directly to Postgres, create a read-only database user:
--
--   create user looker_reader with password 'CHOOSE_A_STRONG_PASSWORD';
--   grant connect on database postgres to looker_reader;
--   grant usage on schema public to looker_reader;
--   grant select on vw_campaign_responses to looker_reader;
--
-- Then use the connection string from:
--   supabase.com → your project → Settings → Database → Connection Pooling
-- with the looker_reader credentials.
