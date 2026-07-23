-- Migration 137: render time-series from the rollups
--
-- /api/dashboard/events/series builds the "Renders" line of the Responses Over
-- Time chart. It currently pages survey_events up to 100 times sequentially,
-- 1000 rows per request, with a growing OFFSET over the same filter, then counts
-- in JavaScript. At 794k render rows that is slow, it runs concurrently with the
-- funnel counts on every dashboard load (a large part of why the funnel counts
-- were timing out in production but not in isolation), and it silently truncates
-- at 100k events, so the chart was wrong regardless.
--
-- This returns hour-grain buckets in one round trip: rollup buckets for sealed
-- history, raw only for the unsealed tail. The route folds hours into days for
-- the day view, so the two granularities can never disagree.
--
-- Safe in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION dashboard_event_series(
  p_event_type   text        DEFAULT 'SURVEY_RENDER',
  p_campaign_ids text[]      DEFAULT NULL,
  p_from         timestamptz DEFAULT NULL,
  p_to           timestamptz DEFAULT NULL,
  p_publisher    text        DEFAULT NULL,
  p_placement    text        DEFAULT NULL,
  p_country      text        DEFAULT NULL,
  p_device       text        DEFAULT NULL,
  p_browser      text        DEFAULT NULL
)
RETURNS TABLE (bucket_hour timestamptz, event_count bigint)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  lo   timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  hi   timestamptz := coalesce(p_to,    'infinity'::timestamptz);
  seal timestamptz;
  h_lo timestamptz;
  s_hi timestamptz;
BEGIN
  SELECT sealed_through INTO seal FROM rollup_watermark WHERE rollup_name = 'event_agg';
  seal := coalesce(seal, '-infinity'::timestamptz);

  IF lo = '-infinity'::timestamptz THEN
    SELECT coalesce(min(a.bucket_hour), seal) INTO lo FROM event_agg_hourly a;
  END IF;

  h_lo := CASE WHEN lo = utc_trunc('hour', lo) THEN lo ELSE utc_trunc('hour', lo) + interval '1 hour' END;
  s_hi := utc_trunc('hour', least(hi, seal));
  IF s_hi < h_lo THEN s_hi := h_lo; END IF;

  RETURN QUERY
  WITH parts AS (
    SELECT a.bucket_hour AS b, sum(a.event_count) AS n
    FROM event_agg_hourly a
    WHERE a.bucket_hour >= h_lo AND a.bucket_hour < s_hi
      AND a.event_type = p_event_type
      AND (p_campaign_ids IS NULL OR a.campaign_id = ANY(p_campaign_ids))
      AND (p_publisher IS NULL OR a.publisher = p_publisher)
      AND (p_placement IS NULL OR a.placement = p_placement)
      AND (p_country   IS NULL OR a.country   = p_country)
      AND (p_device    IS NULL OR a.device    = p_device)
      AND (p_browser   IS NULL OR a.browser   = p_browser)
    GROUP BY 1

    UNION ALL

    SELECT utc_trunc('hour', e.created_at), count(*)
    FROM survey_events e
    WHERE ((e.created_at >= lo AND e.created_at < h_lo)
        OR (e.created_at >= s_hi AND e.created_at < hi))
      AND e.event_type = p_event_type
      AND (p_campaign_ids IS NULL OR e.campaign_id = ANY(p_campaign_ids))
      AND (p_publisher IS NULL OR e.publisher = p_publisher)
      AND (p_placement IS NULL OR e.placement = p_placement)
      AND (p_country   IS NULL OR e.country   = p_country)
      AND (p_device    IS NULL OR e.device    = p_device)
      AND (p_browser   IS NULL OR e.browser   = p_browser)
    GROUP BY 1
  )
  SELECT p.b, sum(p.n)::bigint FROM parts p GROUP BY 1 ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_event_series(text, text[], timestamptz, timestamptz, text, text, text, text, text) TO service_role;
