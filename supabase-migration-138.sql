-- Migration 138: partner_reports — the Audience Intelligence Report registry
--
-- One row per report a publisher partner can open. The report itself is
-- generated entirely from live campaign data at request time; this table holds
-- only what makes a report *a* report: who it is for, which campaigns it covers,
-- what it is called, and the password that opens it.
--
-- This is deliberately the same shape the Organisations area will want later:
-- organisation_id is the real foreign key and the denormalised names exist only
-- so a report can render (and be reasoned about) without a join at read time.
-- When Organisations lands, the display fields become fallbacks, not the source.
--
-- Nothing about a specific campaign, publisher or brand is encoded in code —
-- adding the next partner report is an INSERT here, not a deploy.
--
-- Safe in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS partner_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- URL identity: /reports/<org_slug>/<report_slug>. Split in two so the
  -- organisation segment stays stable across every report that org receives.
  org_slug          text        NOT NULL,
  report_slug       text        NOT NULL,

  -- Who the report is for and about.
  organisation_id   uuid        REFERENCES organisations(id) ON DELETE RESTRICT,
  organisation_name text        NOT NULL,   -- display name in the hero
  brand_name        text        NOT NULL,   -- the client the study was run for

  -- What it is called.
  report_title      text        NOT NULL DEFAULT 'Fanometrix Audience Intelligence Report',
  campaign_title    text        NOT NULL,   -- the study's name, as the partner knows it
  research_question text,                   -- shown under the campaign title when set

  -- The partner's mark for the cover. Optional: the cover sets the organisation
  -- name in display type when absent, which is a deliberate design rather than a
  -- fallback. Lives here rather than on organisations because a report is issued
  -- with the artwork the partner approved at the time, and re-issuing is how you
  -- change it.
  logo_url          text,

  -- Revision of this report, shown on the cover. A partner who receives a
  -- corrected report needs to know at a glance which one they are reading;
  -- "the latest one" is not something an inbox can tell you. Bumped by
  -- scripts/issue-partner-report.ts on every re-issue.
  version           integer     NOT NULL DEFAULT 1,

  -- Scope. These are survey_events.campaign_id / responses.campaign_id keys —
  -- the text campaign_id, not the campaigns.id uuid — because that is what the
  -- event and response tables are keyed by today. M1's re-key changes this
  -- column's contents, not its meaning.
  campaign_ids      text[]      NOT NULL,

  -- Rows whose created_at is before this instant are excluded everywhere in the
  -- report. Pre-launch smoke tests are real rows in production and would
  -- otherwise be indistinguishable from fan responses.
  data_from         timestamptz,

  -- Access. bcrypt hash — never a plaintext password, never a shared secret.
  password_hash     text        NOT NULL,

  status            text        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),
  published_at      timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_slug, report_slug)
);

CREATE INDEX IF NOT EXISTS partner_reports_org_slug_idx ON partner_reports (org_slug);

ALTER TABLE partner_reports ENABLE ROW LEVEL SECURITY;
-- No policies: every read goes through the service role in a server route, the
-- same as survey_events. An anon client must never be able to enumerate reports
-- or read a password hash.

COMMENT ON TABLE  partner_reports          IS 'Registry of password-protected Audience Intelligence Reports issued to publisher partners.';
COMMENT ON COLUMN partner_reports.campaign_ids IS 'survey_events.campaign_id keys in report scope. Every figure in the report is computed from exactly these campaigns.';
COMMENT ON COLUMN partner_reports.data_from IS 'Exclusive lower bound on event/response created_at. Excludes pre-launch QA traffic.';
