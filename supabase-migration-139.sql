-- Migration 139: partner_reports cover fields
--
-- Migration 138 was applied before these two columns were added to it. 138 is
-- CREATE TABLE IF NOT EXISTS, so re-running it is a no-op on a database that
-- already has the table: the columns have to arrive on their own. Both files
-- are now correct, so a fresh environment gets them from 138 and this migration
-- is the no-op there instead.
--
-- Safe in the Supabase SQL editor. Additive, idempotent, no data movement.

-- The partner's mark for the report cover. Optional: the cover sets the
-- organisation name in display type when absent, which is a deliberate design
-- rather than a fallback.
ALTER TABLE partner_reports ADD COLUMN IF NOT EXISTS logo_url text;

-- Revision of the report, shown on the cover. A partner who receives a
-- corrected report needs to know at a glance which one they are reading;
-- "the latest one" is not something an inbox can tell you. Existing rows
-- backfill to 1, which is correct: they are the first issue.
ALTER TABLE partner_reports ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN partner_reports.logo_url IS 'Optional partner mark for the report cover.';
COMMENT ON COLUMN partner_reports.version  IS 'Report revision shown on the cover. Bumped by scripts/issue-partner-report.ts on every re-issue.';
