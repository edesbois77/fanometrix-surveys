-- Migration 191: Survey Studio — Study (lightweight Studio-native research container).
--
-- A Study is the overall research initiative that groups 1..N Surveys pursuing one
-- brief:  STUDY → SURVEYS → CAMPAIGNS → RESPONSES. It is Studio-native and MUST NOT be
-- confused with the legacy `research_projects` entity (deeply coupled to the reasoning
-- engine, analysis_runs, Information Needs, legacy findings/reports, research_mode and
-- simulation). This migration touches NEITHER research_projects NOR its pipeline.
--
-- SCOPE (deliberately minimal — the container only):
--   • Campaigns/Responses derive their Study THROUGH the Survey — so NO study_id is
--     added to campaigns / responses / survey_findings.
--   • Finding evolution, Study Results, AI and Reports are all DEFERRED — none here.
--   • Study membership is 0-or-1 Study per Survey → a single nullable FK, NOT a join
--     table. ON DELETE SET NULL: deleting a Study returns its Surveys to standalone
--     and NEVER deletes a Survey, Campaign, Response, Result or Finding.
--   • research_request_id links a commissioned Study back to its intake Request; a
--     partial UNIQUE index makes "create research from Request" idempotent (one Study
--     per Request). Study does NOT depend on Request (research_request_id is nullable).
--
-- SAFETY: additive, non-destructive, idempotent. NOT auto-applied — hand-applied per
-- the DB-ahead-of-code practice.
--
-- ROLLBACK:
--   ALTER TABLE surveys DROP COLUMN IF EXISTS study_id;
--   DROP TABLE IF EXISTS studies;

CREATE TABLE IF NOT EXISTS studies (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          text        NOT NULL,
  objective                     text,
  -- The commissioning client for commissioned research; NULL for a direct/internal
  -- Fanometrix Study. This is descriptive metadata, NOT access/entitlement.
  commissioning_organisation_id uuid        REFERENCES organisations(id),
  -- Provenance link to the intake Request, when the Study was created from one.
  research_request_id           uuid        REFERENCES research_requests(id),
  status                        text        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','active','closed')),
  created_by                    text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- One Study per Request → idempotent "create research from Request" (retry-safe).
CREATE UNIQUE INDEX IF NOT EXISTS uq_studies_research_request
  ON studies (research_request_id) WHERE research_request_id IS NOT NULL;

ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON studies;
CREATE POLICY deny_all_anon ON studies USING (false);

DROP TRIGGER IF EXISTS studies_updated_at ON studies;
CREATE TRIGGER studies_updated_at BEFORE UPDATE ON studies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Survey membership: 0-or-1 Study. ON DELETE SET NULL keeps Surveys (and everything
-- under them) intact if a Study is ever deleted — membership is metadata above the Survey.
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS study_id uuid REFERENCES studies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_surveys_study_id ON surveys (study_id) WHERE study_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
