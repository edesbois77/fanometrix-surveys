-- Migration 188: Survey Studio — Request (research intake + hand-off).
--
-- Adds ONE new table, `research_requests`, holding a Publisher's research BRIEF
-- (intake) before any Survey exists. A Request is deliberately NOT a Survey, a
-- Campaign, a Creative or a Research Project: it is an intake record that can
-- LATER seed a Survey Studio Create survey (the accepted→Create hand-off). It
-- reuses the platform's existing entities rather than duplicating them:
--   • organisation_id            → the Current Organisation (ORG-005/006 scope).
--   • brand_org_id / agency_org_id → the SAME governed organisations(id) columns
--     surveys/campaigns already use for commissioned attribution — stable ids,
--     never denormalised display text (preserves the attribution chain
--     Organisation → Request → Brand/Agency → Survey → Campaigns → Responses).
--   • survey_id                  → the resulting Survey once the hand-off runs;
--     NULL until then. This is the ONLY link between a Request and a Survey — a
--     Request never copies Survey questions/creative/campaign/deploy state.
--
-- The About-stage brief fields (objective / audience / markets / purpose) mirror
-- the shape stored in surveys.about (migration 179), so the hand-off is a direct
-- field copy with no transformation.
--
-- SAFETY: purely additive and non-destructive.
--   • New table only; no existing table/column/view/data is touched.
--   • Idempotent (CREATE TABLE IF NOT EXISTS / IF NOT EXISTS indexes).
--   • RLS enabled with a deny-anon-read policy (service role bypasses), matching
--     access_requests (migration 025). All application access is via the service
--     role behind requireUser(), which enforces Current-Organisation scoping.
--   • NOT auto-applied — hand-applied per the project's DB-ahead-of-code practice.
--
-- ROLLBACK: DROP TABLE IF EXISTS research_requests;

CREATE TABLE IF NOT EXISTS research_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership / scope — the Current Organisation the request belongs to.
  organisation_id    uuid        NOT NULL REFERENCES organisations(id),

  -- Lifecycle. V1: no saved drafts in the UX, so a row exists only once
  -- submitted. 'needs_clarification' returns it to the requester for more detail.
  status             text        NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted','accepted','needs_clarification','declined')),

  -- Research brief (mirrors surveys.name + surveys.about shape).
  name               text,                       -- short working title
  objective          text,                       -- what are you trying to understand?
  audience           text,                       -- who would you like to hear from?
  markets            jsonb       NOT NULL DEFAULT '[]',  -- governed country codes (lib/countries)
  purpose            text,                       -- lib/survey-purpose PurposeValue

  -- Commissioned attribution — SAME governed columns/semantics as surveys.
  -- Attribution, NOT access: these never grant the Brand/Agency any access.
  brand_org_id       uuid        REFERENCES organisations(id) ON DELETE SET NULL,
  agency_org_id      uuid        REFERENCES organisations(id) ON DELETE SET NULL,

  -- Lightweight requirements (all optional).
  desired_launch_date  date,
  desired_responses    integer     CHECK (desired_responses IS NULL OR desired_responses > 0),
  additional_context   text,

  -- Requester attribution — derived from the authenticated context at submit.
  requester_email    text        NOT NULL,       -- work_email
  requester_name     text,                        -- first + last snapshot (display only)

  -- Hand-off linkage — the Survey this accepted Request seeded, if any.
  survey_id          uuid        REFERENCES surveys(id) ON DELETE SET NULL,

  -- Review metadata (minimal; no large operational review system in V1).
  reviewed_at        timestamptz,
  reviewed_by        text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  submitted_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_read" ON research_requests FOR SELECT USING (false);

-- Org-scoped listing, newest first (the Request list query).
CREATE INDEX IF NOT EXISTS idx_research_requests_org_created
  ON research_requests (organisation_id, created_at DESC);

-- Attribution lookups (Discover: "all research for Brand X / via Agency Y").
CREATE INDEX IF NOT EXISTS idx_research_requests_brand_org_id  ON research_requests (brand_org_id);
CREATE INDEX IF NOT EXISTS idx_research_requests_agency_org_id ON research_requests (agency_org_id);

-- One Request seeds at most one Survey — a partial UNIQUE index makes a duplicate
-- hand-off impossible at the database level (belt-and-braces alongside the
-- application's survey_id-is-null guard). Multiple un-handed-off requests
-- (survey_id NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_research_requests_survey_id
  ON research_requests (survey_id) WHERE survey_id IS NOT NULL;
