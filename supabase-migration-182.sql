-- Migration 182: Survey Studio Phase 3 — Survey-level journey fields (Intro / Thank You).
--
-- Additive + idempotent. Introduces Survey-level Intro and an explicit Thank-You
-- enable flag so the journey (optional Intro → 1–5 Questions → optional Thank You)
-- is a SURVEY decision, not a Creative one. NOT auto-applied (hand-applied per the
-- project's DB-ahead-of-code practice).
--
-- COMPATIBILITY — the columns are NULLABLE with NO default, deliberately:
--   • intro_enabled     NULL  → this is not a Studio-journey survey; survey-level
--                                intro is OFF and the legacy Creative-driven intro
--                                (fan-invitation, layout='invitation') is unchanged.
--                          true → Studio survey with a Survey-level Intro frame.
--   • thank_you_enabled NULL  → treated as ENABLED (preserves the historical
--                                always-on Thank-You for every existing survey).
--                          false → Thank-You suppressed (only reachable via Studio).
--   Studio Create writes intro_enabled=true and thank_you_enabled=true explicitly on
--   new surveys; NO existing row is modified, so historical rendering is untouched.
--
-- intro_title / intro_body are localised jsonb maps ({"en": "...", ...}), mirroring
-- the existing thank_you_title / thank_you_body shape (migration 045).

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS intro_enabled     boolean,
  ADD COLUMN IF NOT EXISTS intro_title       jsonb,
  ADD COLUMN IF NOT EXISTS intro_body        jsonb,
  ADD COLUMN IF NOT EXISTS thank_you_enabled boolean;

COMMENT ON COLUMN surveys.intro_enabled     IS 'Survey-level Intro frame on/off. NULL = legacy (no Survey-level intro; Creative-driven intro unchanged). Studio sets true.';
COMMENT ON COLUMN surveys.intro_title       IS 'Localised Intro headline jsonb {"en": ...}. Mirrors thank_you_title.';
COMMENT ON COLUMN surveys.intro_body        IS 'Localised Intro short message jsonb {"en": ...}. Mirrors thank_you_body.';
COMMENT ON COLUMN surveys.thank_you_enabled IS 'Thank-You frame on/off. NULL = enabled (historical default preserved). false = suppressed (Studio only).';
