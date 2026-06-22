-- Migration 021: Add survey_language to campaigns
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Every campaign now declares which language its survey creative should render.
-- The embed reads this field and serves the matching translation, falling back
-- to English if the translation is missing for any question or option.
--
-- Allowed values (enforced in application, not DB constraint for easy extensibility):
--   en, de, sv, zh-CN
--
-- ROLLBACK: ALTER TABLE campaigns DROP COLUMN IF EXISTS survey_language;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS survey_language text NOT NULL DEFAULT 'en';
