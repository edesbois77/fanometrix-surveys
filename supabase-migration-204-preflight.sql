-- Preflight for Migration 204. READ-ONLY. Run BEFORE the migration.
--
-- Confirms `public.responses` carries every column the typed function's INSERT
-- targets, with the expected type. A missing or retyped column would make the
-- migration fail at CREATE time rather than silently, but this turns a plpgsql
-- parse error into a readable list.

WITH required(col, expected_type) AS (VALUES
  ('campaign_id',               'text'),
  ('session_id',                'uuid'),
  ('survey_id',                 'text'),
  ('question_set_id',           'text'),
  ('q1',                        'text'),
  ('q2',                        'text'),
  ('q3',                        'text'),
  ('country',                   'text'),
  ('fan_segment',               'text'),
  ('gender',                    'text'),
  ('age_band',                  'text'),
  ('publisher',                 'text'),
  ('placement',                 'text'),
  ('placement_id',              'text'),
  ('creative_id',               'text'),
  ('club',                      'text'),
  ('competition',               'text'),
  ('device',                    'text'),
  ('browser',                   'text'),
  ('response_duration_seconds', 'integer'),
  ('is_demo',                   'boolean'),
  ('group_id',                  'text'),
  ('country_code',              'text'),
  ('market',                    'text'),
  ('survey_language',           'text')
)
SELECT
  r.col,
  r.expected_type,
  COALESCE(c.data_type, '—')            AS actual_type,
  CASE
    WHEN c.column_name IS NULL          THEN 'MISSING'
    WHEN c.data_type <> r.expected_type THEN 'TYPE MISMATCH'
    ELSE 'ok'
  END                                    AS status
FROM required r
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public'
      AND c.table_name   = 'responses'
      AND c.column_name  = r.col
ORDER BY (CASE WHEN c.column_name IS NULL OR c.data_type <> r.expected_type THEN 0 ELSE 1 END), r.col;

-- Expect 25 rows, every status = 'ok'.
-- Also confirm id/created_at still default, since the typed function relies on
-- them defaulting rather than being supplied:
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='responses'
   AND column_name IN ('id','created_at');
-- Expect: id → gen_random_uuid(),  created_at → now()
