-- Migration 006: Add response_hour and response_daypart to vw_campaign_responses
-- Run in: supabase.com → your project → SQL Editor → New query → Run
-- Safe to run: CREATE OR REPLACE VIEW is idempotent.

create or replace view vw_campaign_responses as
select
  r.id                                              as response_id,
  r.campaign_id                                     as campaign_slug,
  c.id::text                                        as campaign_id,
  c.campaign_name,
  c.brand_name                                      as brand,
  r.survey_id::text                                 as survey_id,
  s.id::text                                        as survey_slug,
  s.name                                            as survey_name,
  case lower(trim(coalesce(r.publisher, '')))
    when 'fot mob'        then 'FotMob'
    when 'fotmob'         then 'FotMob'
    when 'forzafootball'  then 'Forza Football'
    when 'forza-football' then 'Forza Football'
    else nullif(trim(r.publisher), '')
  end                                               as publisher,
  case lower(trim(coalesce(r.placement, '')))
    when 'homepage mpu'     then 'homepage-mpu'
    when 'homepage_mpu'     then 'homepage-mpu'
    when 'match centre mpu' then 'match-centre-mpu'
    when 'match center mpu' then 'match-centre-mpu'
    when 'lineups mpu'      then 'lineups-mpu'
    when 'article inline'   then 'article-inline'
    when 'article footer'   then 'article-footer'
    when 'team page mpu'    then 'team-page-mpu'
    when 'league page mpu'  then 'league-page-mpu'
    else nullif(trim(r.placement), '')
  end                                               as placement,
  r.club, r.competition,
  case lower(trim(coalesce(r.country, '')))
    when 'gb'  then 'United Kingdom'  when 'uk'  then 'United Kingdom'
    when 'gbr' then 'United Kingdom'  when 'united kingdom' then 'United Kingdom'
    when 'us'  then 'United States'   when 'usa' then 'United States'
    when 'united states' then 'United States'
    when 'fr'  then 'France'     when 'fra' then 'France'     when 'france' then 'France'
    when 'de'  then 'Germany'    when 'deu' then 'Germany'    when 'germany' then 'Germany'
    when 'es'  then 'Spain'      when 'esp' then 'Spain'      when 'spain' then 'Spain'
    when 'it'  then 'Italy'      when 'ita' then 'Italy'      when 'italy' then 'Italy'
    when 'br'  then 'Brazil'     when 'bra' then 'Brazil'     when 'brazil' then 'Brazil'
    when 'ar'  then 'Argentina'  when 'arg' then 'Argentina'  when 'argentina' then 'Argentina'
    when 'au'  then 'Australia'  when 'aus' then 'Australia'  when 'australia' then 'Australia'
    when 'jp'  then 'Japan'      when 'jpn' then 'Japan'      when 'japan' then 'Japan'
    when 'nl'  then 'Netherlands' when 'ned' then 'Netherlands' when 'netherlands' then 'Netherlands'
    when 'be'  then 'Belgium'    when 'bel' then 'Belgium'    when 'belgium' then 'Belgium'
    when 'pt'  then 'Portugal'   when 'por' then 'Portugal'   when 'portugal' then 'Portugal'
    when 'mx'  then 'Mexico'     when 'mex' then 'Mexico'     when 'mexico' then 'Mexico'
    when 'za'  then 'South Africa' when 'rsa' then 'South Africa' when 'south africa' then 'South Africa'
    when 'ng'  then 'Nigeria'    when 'nga' then 'Nigeria'    when 'nigeria' then 'Nigeria'
    when 'in'  then 'India'      when 'ind' then 'India'      when 'india' then 'India'
    when 'ca'  then 'Canada'     when 'can' then 'Canada'     when 'canada' then 'Canada'
    when 'ie'  then 'Ireland'    when 'irl' then 'Ireland'    when 'ireland' then 'Ireland'
    else nullif(trim(r.country), '')
  end                                               as country,
  r.fan_segment, r.device, r.browser,
  r.q1, r.q2, r.q3,
  r.response_duration_seconds,
  case when r.q1 is not null and r.q2 is not null and r.q3 is not null
    then 1 else 0 end                              as is_complete,
  r.is_demo,

  -- ── Date dimensions
  r.created_at                                     as submitted_at,
  r.created_at::date                               as response_date,
  date_trunc('week',  r.created_at)::date          as response_week,
  date_trunc('month', r.created_at)::date          as response_month,
  extract(year  from r.created_at)::int            as response_year,
  extract(month from r.created_at)::int            as response_month_num,
  to_char(r.created_at, 'YYYY-MM')                 as response_month_label,
  to_char(r.created_at, 'Day')                     as response_day_of_week,

  -- ── Behavioural time dimensions (UTC)
  extract(hour from r.created_at)::int             as response_hour,
  case
    when extract(hour from r.created_at) between  5 and 11 then 'Morning'
    when extract(hour from r.created_at) between 12 and 16 then 'Afternoon'
    when extract(hour from r.created_at) between 17 and 21 then 'Evening'
    else 'Night'
  end                                              as response_daypart

from responses r
left join campaigns c on c.campaign_id = r.campaign_id
left join surveys   s on s.id::text    = r.survey_id;

grant select on vw_campaign_responses to anon;
grant select on vw_campaign_responses to authenticated;
