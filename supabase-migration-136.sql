-- Migration 136: event rollup tables (M2, minimum durable slice)
--
-- The dashboard's impression metrics cannot be served by counting raw events.
-- Migration 135's composite index made a project-scoped SURVEY_RENDER count run
-- as a clean index-only scan (Heap Fetches: 131 of 784k, fully cached) and it
-- still costs ~8.7us per index entry, which is 4-7s today and grows with every
-- one of the ~440k renders inserted per day. That is a modelling problem, not an
-- indexing one: exact COUNT(*) scales linearly with matched rows.
--
-- These tables precompute the counts. The dashboard then sums a small number of
-- rollup rows for sealed history and counts raw events only for the unsealed
-- tail, which is bounded by the sealing lag rather than by the size of history.
--
-- Raw survey_events remains the source of truth. Everything here is derived and
-- disposable: drop a bucket and re-run the function to rebuild it exactly.
-- See docs/event-analytics-architecture.md.
--
-- Keyed by campaign_id TEXT to match today's schema. M1 re-keys to campaign UUID,
-- at which point these tables are recomputed rather than migrated, which is the
-- flexibility the derived layer exists to provide.
--
-- Safe in the Supabase SQL editor (no CONCURRENTLY).

-- ── Hourly, full dimensions ──────────────────────────────────────────────────
-- Serves short ranges, hour-granularity charts, and any dimension-filtered query.
-- Dimensions are NOT NULL with '' for absent: NULLs in a primary key would make
-- otherwise-identical buckets distinct and silently duplicate counts.

CREATE TABLE IF NOT EXISTS event_agg_hourly (
  bucket_hour  timestamptz NOT NULL,
  campaign_id  text        NOT NULL,
  event_type   text        NOT NULL,
  publisher    text        NOT NULL DEFAULT '',
  placement    text        NOT NULL DEFAULT '',
  country      text        NOT NULL DEFAULT '',
  device       text        NOT NULL DEFAULT '',
  browser      text        NOT NULL DEFAULT '',
  event_count  bigint      NOT NULL,
  PRIMARY KEY (bucket_hour, campaign_id, event_type, publisher, placement, country, device, browser)
);

-- The dashboard's access path: campaign scope + event type + time range.
CREATE INDEX IF NOT EXISTS event_agg_hourly_campaign_type_bucket_idx
  ON event_agg_hourly (campaign_id, event_type, bucket_hour) INCLUDE (event_count);

-- ── Daily, same dimensions ───────────────────────────────────────────────────
-- ~24x smaller than hourly while keeping every filter usable. This is what makes
-- "All Time" instant, and it is the table that is retained indefinitely.

CREATE TABLE IF NOT EXISTS event_agg_daily (
  bucket_day   date        NOT NULL,
  campaign_id  text        NOT NULL,
  event_type   text        NOT NULL,
  publisher    text        NOT NULL DEFAULT '',
  placement    text        NOT NULL DEFAULT '',
  country      text        NOT NULL DEFAULT '',
  device       text        NOT NULL DEFAULT '',
  browser      text        NOT NULL DEFAULT '',
  event_count  bigint      NOT NULL,
  PRIMARY KEY (bucket_day, campaign_id, event_type, publisher, placement, country, device, browser)
);

CREATE INDEX IF NOT EXISTS event_agg_daily_campaign_type_bucket_idx
  ON event_agg_daily (campaign_id, event_type, bucket_day) INCLUDE (event_count);

-- ── Watermark ────────────────────────────────────────────────────────────────
-- How far the rollups are trusted. The query layer sums rollups strictly below
-- sealed_through and counts raw events at or above it, so the two never overlap
-- and never leave a gap.

CREATE TABLE IF NOT EXISTS rollup_watermark (
  rollup_name    text        PRIMARY KEY,
  sealed_through timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rollup_watermark (rollup_name, sealed_through)
VALUES ('event_agg', '1970-01-01T00:00:00Z')
ON CONFLICT (rollup_name) DO NOTHING;

-- ── Audit ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rollup_runs (
  id           bigserial   PRIMARY KEY,
  rollup_name  text        NOT NULL,
  bucket_from  timestamptz NOT NULL,
  bucket_to    timestamptz NOT NULL,
  rows_written bigint      NOT NULL,
  duration_ms  integer     NOT NULL,
  ran_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rollup_runs_name_ran_at_idx ON rollup_runs (rollup_name, ran_at DESC);

-- ── UTC truncation helper ────────────────────────────────────────────────────
-- date_trunc() on a timestamptz resolves in the session TimeZone. Every bucket
-- boundary in this pipeline must be UTC regardless of who is connected, or the
-- hourly and daily grains can disagree and buckets can double count at the seam.

CREATE OR REPLACE FUNCTION utc_trunc(p_unit text, p_ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$ SELECT (date_trunc(p_unit, p_ts AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC' $$;

-- ── Rebuild functions ────────────────────────────────────────────────────────
-- Both REPLACE whole windows rather than incrementing. Incrementing is not
-- idempotent: a retry after partial failure double-counts, and the jobs framework
-- retries by design. Delete-then-insert inside one transaction means running a
-- window twice produces exactly the same result as running it once, which is what
-- makes the pipeline self-healing and the rollups safely disposable.

CREATE OR REPLACE FUNCTION rollup_events_hourly(p_from timestamptz, p_to timestamptz)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_from timestamptz := utc_trunc('hour', p_from);
  v_rows bigint;
  v_started timestamptz := clock_timestamp();
BEGIN
  DELETE FROM event_agg_hourly WHERE bucket_hour >= v_from AND bucket_hour < p_to;

  INSERT INTO event_agg_hourly
    (bucket_hour, campaign_id, event_type, publisher, placement, country, device, browser, event_count)
  SELECT utc_trunc('hour', created_at),
         campaign_id,
         event_type,
         coalesce(publisher, ''), coalesce(placement, ''), coalesce(country, ''),
         coalesce(device, ''),    coalesce(browser, ''),
         count(*)
  FROM survey_events
  WHERE created_at >= v_from AND created_at < p_to
    AND campaign_id IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO rollup_runs (rollup_name, bucket_from, bucket_to, rows_written, duration_ms)
  VALUES ('event_agg_hourly', v_from, p_to, v_rows,
          (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::integer);

  RETURN v_rows;
END;
$$;

-- Daily is derived from hourly, not from raw: one pass over a table that is
-- already ~20x smaller, and it guarantees the two grains can never disagree.
CREATE OR REPLACE FUNCTION rollup_events_daily(p_from timestamptz, p_to timestamptz)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_from date := (utc_trunc('day', p_from) AT TIME ZONE 'UTC')::date;
  v_to   date := (utc_trunc('day', p_to)   AT TIME ZONE 'UTC')::date;
  v_rows bigint;
  v_started timestamptz := clock_timestamp();
BEGIN
  DELETE FROM event_agg_daily WHERE bucket_day >= v_from AND bucket_day < v_to;

  INSERT INTO event_agg_daily
    (bucket_day, campaign_id, event_type, publisher, placement, country, device, browser, event_count)
  SELECT (bucket_hour AT TIME ZONE 'UTC')::date,
         campaign_id, event_type, publisher, placement, country, device, browser,
         sum(event_count)
  FROM event_agg_hourly
  WHERE bucket_hour >= (v_from::timestamp AT TIME ZONE 'UTC') AND bucket_hour < (v_to::timestamp AT TIME ZONE 'UTC')
  GROUP BY 1, 2, 3, 4, 5, 6, 7, 8;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO rollup_runs (rollup_name, bucket_from, bucket_to, rows_written, duration_ms)
  VALUES ('event_agg_daily', v_from, v_to, v_rows,
          (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::integer);

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION rollup_events_hourly(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION rollup_events_daily(timestamptz, timestamptz)  TO service_role;

ALTER TABLE event_agg_hourly  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_agg_daily   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollup_watermark  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rollup_runs       ENABLE ROW LEVEL SECURITY;
-- Reads go through API routes on the service role key, as survey_events does.

-- ── Query layer ──────────────────────────────────────────────────────────────
-- One round trip returning every funnel stage. Replaces the six separate exact
-- COUNT(*) queries the dashboard issues today, two of which currently fail.
--
-- The range is split into four regions so that sealed history is never counted
-- from raw and the live tail is never missed:
--
--   [lo, h_lo)      raw   -- partial leading hour, rollups only cover whole hours
--   [h_lo, d_lo)    hourly
--   [d_lo, d_hi)    daily -- the bulk: whole UTC days, ~24x fewer rows
--   [d_hi, s_hi)    hourly
--   [s_hi, hi)      raw   -- the unsealed tail, bounded by the sealing lag
--
-- Regions are half-open and contiguous, so no event is double counted or lost.
-- Passing NULL for a dimension means "no filter"; '' would mean "absent", which
-- is a different question.

CREATE OR REPLACE FUNCTION dashboard_event_counts(
  p_campaign_ids text[]     DEFAULT NULL,
  p_from         timestamptz DEFAULT NULL,
  p_to           timestamptz DEFAULT NULL,
  p_publisher    text        DEFAULT NULL,
  p_placement    text        DEFAULT NULL,
  p_country      text        DEFAULT NULL,
  p_device       text        DEFAULT NULL,
  p_browser      text        DEFAULT NULL
)
RETURNS TABLE (event_type text, event_count bigint)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  lo    timestamptz := coalesce(p_from, '-infinity'::timestamptz);
  hi    timestamptz := coalesce(p_to,    'infinity'::timestamptz);
  seal  timestamptz;
  h_lo  timestamptz;   -- first whole hour at or after lo
  s_hi  timestamptz;   -- end of the rollup-covered region (whole hours only)
  d_lo  timestamptz;   -- first whole day in the rollup region
  d_hi  timestamptz;   -- last whole day boundary in the rollup region
BEGIN
  SELECT sealed_through INTO seal FROM rollup_watermark WHERE rollup_name = 'event_agg';
  seal := coalesce(seal, '-infinity'::timestamptz);

  -- Clamp an unbounded lower bound to the first event, so date_trunc has a value.
  IF lo = '-infinity'::timestamptz THEN
    SELECT coalesce(min(bucket_hour), seal) INTO lo FROM event_agg_hourly;
  END IF;

  -- Boundaries are computed in UTC explicitly. date_trunc() on a timestamptz
  -- follows the session TimeZone, so relying on the default would silently shift
  -- every day boundary if a connection ever arrived with a different setting,
  -- and the daily and hourly grains would then disagree.
  h_lo := CASE WHEN lo = utc_trunc('hour', lo) THEN lo ELSE utc_trunc('hour', lo) + interval '1 hour' END;
  s_hi := utc_trunc('hour', least(hi, seal));
  IF s_hi < h_lo THEN s_hi := h_lo; END IF;

  d_lo := CASE WHEN h_lo = utc_trunc('day', h_lo) THEN h_lo ELSE utc_trunc('day', h_lo) + interval '1 day' END;
  d_hi := utc_trunc('day', s_hi);
  IF d_hi < d_lo THEN d_lo := s_hi; d_hi := s_hi; END IF;

  RETURN QUERY
  WITH parts AS (
    -- daily core
    SELECT a.event_type, sum(a.event_count) AS n
    FROM event_agg_daily a
    WHERE a.bucket_day >= (d_lo AT TIME ZONE 'UTC')::date AND a.bucket_day < (d_hi AT TIME ZONE 'UTC')::date
      AND (p_campaign_ids IS NULL OR a.campaign_id = ANY(p_campaign_ids))
      AND (p_publisher IS NULL OR a.publisher = p_publisher)
      AND (p_placement IS NULL OR a.placement = p_placement)
      AND (p_country   IS NULL OR a.country   = p_country)
      AND (p_device    IS NULL OR a.device    = p_device)
      AND (p_browser   IS NULL OR a.browser   = p_browser)
    GROUP BY 1

    UNION ALL
    -- hourly edges, before and after the daily core
    SELECT a.event_type, sum(a.event_count)
    FROM event_agg_hourly a
    WHERE ((a.bucket_hour >= h_lo AND a.bucket_hour < d_lo)
        OR (a.bucket_hour >= d_hi AND a.bucket_hour < s_hi))
      AND (p_campaign_ids IS NULL OR a.campaign_id = ANY(p_campaign_ids))
      AND (p_publisher IS NULL OR a.publisher = p_publisher)
      AND (p_placement IS NULL OR a.placement = p_placement)
      AND (p_country   IS NULL OR a.country   = p_country)
      AND (p_device    IS NULL OR a.device    = p_device)
      AND (p_browser   IS NULL OR a.browser   = p_browser)
    GROUP BY 1

    UNION ALL
    -- raw: the partial leading hour and the unsealed tail
    SELECT e.event_type, count(*)
    FROM survey_events e
    WHERE ((e.created_at >= lo AND e.created_at < h_lo)
        OR (e.created_at >= s_hi AND e.created_at < hi))
      AND (p_campaign_ids IS NULL OR e.campaign_id = ANY(p_campaign_ids))
      AND (p_publisher IS NULL OR e.publisher = p_publisher)
      AND (p_placement IS NULL OR e.placement = p_placement)
      AND (p_country   IS NULL OR e.country   = p_country)
      AND (p_device    IS NULL OR e.device    = p_device)
      AND (p_browser   IS NULL OR e.browser   = p_browser)
    GROUP BY 1
  )
  SELECT p.event_type, sum(p.n)::bigint FROM parts p GROUP BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION dashboard_event_counts(text[], timestamptz, timestamptz, text, text, text, text, text) TO service_role;
