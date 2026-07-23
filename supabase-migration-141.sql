-- Migration 141: partner_reports.subtitle
--
-- The cover's standfirst is editorial copy, not a derived string. It has to be
-- able to say things the data does not know: that the markets were European,
-- that the respondents were football fans, how the sponsorship is properly
-- named. Generating it from the report definition gets the shape right and the
-- specifics wrong, and the cover is the one sentence most likely to be read.
--
-- Reports without one fall back to a generated sentence in the same shape (see
-- coverSubtitle in app/reports/components/ReportDocument.tsx), so this is an
-- override rather than a requirement.
--
-- Safe in the Supabase SQL editor. Additive, idempotent.

ALTER TABLE partner_reports ADD COLUMN IF NOT EXISTS subtitle text;

COMMENT ON COLUMN partner_reports.subtitle IS
  'Cover standfirst. Editorial copy set per report; falls back to a generated sentence when null.';
