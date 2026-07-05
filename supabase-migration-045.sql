-- Migration 045: Localised thank-you screen + per-survey language list
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- 1. thank_you_title / thank_you_body become localised jsonb objects
--    (matching questions[].text's {en: "...", de: "...", ...} shape), so the
--    thank-you screen can be translated per language like every other field.
--    Existing plain-text values are seeded into the "en" key so nothing
--    currently live changes behaviour.
--
-- 2. surveys.enabled_languages: which languages are relevant to a given
--    survey (drives which tabs the builder shows), independent of the
--    survey's actual translated content. Backfilled to the 4 languages the
--    builder already supported so no currently-visible tab disappears;
--    new surveys created after this migration default to just English and
--    grow via the builder's "+ Add Language" picker.

ALTER TABLE surveys ALTER COLUMN thank_you_title DROP DEFAULT;
ALTER TABLE surveys ALTER COLUMN thank_you_title TYPE jsonb USING jsonb_build_object('en', thank_you_title);
ALTER TABLE surveys ALTER COLUMN thank_you_title SET DEFAULT '{"en": "Thank you!"}'::jsonb;

ALTER TABLE surveys ALTER COLUMN thank_you_body DROP DEFAULT;
ALTER TABLE surveys ALTER COLUMN thank_you_body TYPE jsonb USING jsonb_build_object('en', thank_you_body);
ALTER TABLE surveys ALTER COLUMN thank_you_body SET DEFAULT '{"en": "Your response has been recorded."}'::jsonb;

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS enabled_languages text[] NOT NULL DEFAULT '{en}';
UPDATE surveys SET enabled_languages = '{en,de,sv,zh-CN}' WHERE enabled_languages = '{en}';
