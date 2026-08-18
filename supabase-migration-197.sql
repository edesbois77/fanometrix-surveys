-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 197 — User-created Dashboard Studies (Discover → Dashboards)
--
-- ADDITIVE ONLY. Introduces an organisation-owned, many-to-many "analysis grouping"
-- so a user can group surveys THEY ARE ALREADY AUTHORISED TO SEE and open them in
-- the existing Study Dashboard. This is NOT entitlement and NOT the canonical
-- research Study:
--   • It never reads or writes `surveys.study_id` (canonical research relationship).
--   • Membership is intersected with the caller's governed authorised universe at
--     read time (dataVisibleCampaignIds) — a grouping can never grant access.
--   • A survey may belong to many user studies (m2m); canonical studies are 0-or-1
--     via surveys.study_id and are untouched.
--
-- Nothing here mutates existing rows/relationships. No data backfill. Safe to apply
-- to production without altering any existing research data, campaigns, or scopes.
-- Rollback: DROP TABLE dashboard_study_surveys; DROP TABLE dashboard_studies;
-- ─────────────────────────────────────────────────────────────────────────────

-- The grouping itself — owned by the organisation, not the individual user.
CREATE TABLE IF NOT EXISTS dashboard_studies (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  -- Audit only (who created it); ownership is the organisation, not this user.
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_studies_org
  ON dashboard_studies (organisation_id);

-- Many-to-many membership. Deleting a study removes its membership (CASCADE);
-- deleting a survey removes only its membership rows (the survey/campaigns/answers
-- are never affected by, and never affect, this grouping's existence).
CREATE TABLE IF NOT EXISTS dashboard_study_surveys (
  study_id   uuid        NOT NULL REFERENCES dashboard_studies(id) ON DELETE CASCADE,
  survey_id  uuid        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (study_id, survey_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_study_surveys_survey
  ON dashboard_study_surveys (survey_id);

-- Same posture as `studies`: deny anon; all access is via service_role behind the
-- authenticated Discover routes (requireUser + governed scope resolver).
ALTER TABLE dashboard_studies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON dashboard_studies;
CREATE POLICY deny_all_anon ON dashboard_studies USING (false);

ALTER TABLE dashboard_study_surveys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON dashboard_study_surveys;
CREATE POLICY deny_all_anon ON dashboard_study_surveys USING (false);

DROP TRIGGER IF EXISTS dashboard_studies_updated_at ON dashboard_studies;
CREATE TRIGGER dashboard_studies_updated_at BEFORE UPDATE ON dashboard_studies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
