-- Migration 179: Survey Studio Create — "About" research context.
--
-- Adds ONE nullable jsonb column to surveys holding the Create About stage's
-- research context (objective, ideal audience, purpose, markets), per the
-- approved Create V1 plan (single `surveys.about jsonb`, not a parallel Survey
-- Studio persistence model).
--
-- SAFETY: additive and non-destructive.
--   • Every existing survey row is unaffected (about IS NULL).
--   • No backfill. No data transformation.
--   • The legacy survey editor never reads or writes `about`.
--   • validateSurvey() ignores it, so it can never block a survey reaching Ready.
--   • Idempotent (IF NOT EXISTS) — safe to run more than once.
--
-- Deliberately NOT stored here (no duplication): Survey name stays on
-- surveys.name; required languages stay on surveys.enabled_languages.
--
-- Expected shape (all keys optional; the column may be NULL entirely):
--   {
--     "objective": "text — what are you trying to understand?",
--     "audience":  "text — who would you like to hear from?",
--     "purpose":   "editorial_audience | product_experience | first_party_business | third_party",
--     "markets":   ["GB", "DE", ...]   -- ISO alpha-2 country codes
--   }

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS about jsonb;
