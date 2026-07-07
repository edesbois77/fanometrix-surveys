-- Migration 063: Add organisation_id to surveys
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Opens Surveys up to publisher accounts (previously admin-only). A survey
-- now belongs to the organisation of whoever created it, and publisher
-- users only ever see/manage surveys created by someone at their own
-- organisation (never another publisher's, never an admin's) — matching
-- the same organisation-scoping already applied to Campaigns, Campaign
-- Groups, and Research Projects.
--
-- Existing surveys were all created by admins and are left with
-- organisation_id = NULL, which correctly keeps them invisible to
-- publishers under the new scoping (admins still see everything,
-- unrestricted, as today). Dashboard/reporting data is unaffected — it's
-- scoped by campaign/response visibility, not survey ownership, so
-- publishers still see aggregate response data for admin-authored surveys
-- used on campaigns they can already see.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_surveys_organisation_id ON surveys (organisation_id);

-- Rollback:
--   DROP INDEX IF EXISTS idx_surveys_organisation_id;
--   ALTER TABLE surveys DROP COLUMN IF EXISTS organisation_id;
