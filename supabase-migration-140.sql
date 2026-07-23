-- Migration 140: report audience
--
-- The same campaign data supports more than one report. A publisher wants to
-- know what their audience said and what to sell next; a brand wants to know
-- what the research means for the brief; an agency wants both plus delivery
-- accountability; internally we want the unvarnished version including the
-- caveats we would not lead with externally.
--
-- The measurement engine is identical for all of them — the numbers are the
-- numbers. What changes is which sections appear, in what order, what is
-- emphasised, and who the copy addresses. This column selects that narrative
-- profile (see lib/reports/narrative.ts).
--
-- Only 'publisher' is implemented today. The others are accepted by the schema
-- so that adding one is a narrative profile plus a value here, never a
-- migration and never a change to how anything is computed.
--
-- Safe in the Supabase SQL editor. Additive, idempotent.

ALTER TABLE partner_reports
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'publisher';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_reports_audience_check'
  ) THEN
    ALTER TABLE partner_reports
      ADD CONSTRAINT partner_reports_audience_check
      CHECK (audience IN ('publisher', 'brand', 'agency', 'internal'));
  END IF;
END $$;

COMMENT ON COLUMN partner_reports.audience IS
  'Who the report is written for. Selects a narrative profile; never changes how anything is calculated.';
