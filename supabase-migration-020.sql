-- Migration 020: Localise survey questions
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Transforms the surveys.questions JSONB column from the legacy flat shape:
--   [{ "id": "q...", "text": "string", "options": ["str1", "str2"] }]
-- to the new localised shape:
--   [{ "id": "q...", "text": {"en": "string"}, "options": [{"id": 1, "text": {"en": "str1"}}, ...] }]
--
-- The transformation is IDEMPOTENT — it only modifies rows where text is still a
-- plain string.  Running it twice is safe.
--
-- ROLLBACK (run this to revert to the old shape if needed):
-- UPDATE surveys
-- SET questions = (
--   SELECT COALESCE(jsonb_agg(
--     jsonb_build_object(
--       'id',      q->>'id',
--       'text',    q->'text'->>'en',
--       'options', (
--         SELECT COALESCE(jsonb_agg(o->>'text'->>'en' ORDER BY (o->>'id')::int), '[]'::jsonb)
--         FROM jsonb_array_elements(q->'options') AS o
--       )
--     )
--   ), '[]'::jsonb)
--   FROM jsonb_array_elements(questions) AS q
-- )
-- WHERE jsonb_array_length(questions) > 0
--   AND jsonb_typeof(questions->0->'text') = 'object';

UPDATE surveys
SET questions = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',      q->>'id',
        'text',    jsonb_build_object('en', q->>'text'),
        'options', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',   ordinality::int,
                'text', jsonb_build_object('en', opt_text)
              )
              ORDER BY ordinality
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements_text(q->'options')
          WITH ORDINALITY AS t(opt_text, ordinality)
        )
      )
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(questions) AS q
)
WHERE jsonb_array_length(questions) > 0
  AND jsonb_typeof(questions->0->'text') = 'string';
