-- Migration 142: partner_report_visits
--
-- One row per time a report is opened, so the cover can show how much the
-- report has actually been read.
--
-- "Unique" here means a distinct browser, not a distinct person. A reader who
-- opens the report on a laptop and again on a phone counts twice; two people
-- sharing a machine count once. There is no way to do better without asking
-- readers to identify themselves, which would be a worse trade on a document
-- whose whole subject is treating an audience's data carefully. The cover says
-- "readers" and the methodology says what is actually counted.
--
-- visitor_id is a random identifier minted in an httpOnly cookie on first view.
-- It carries no personal data, is not derived from anything about the reader,
-- and is meaningless outside this table.
--
-- Safe in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS partner_report_visits (
  id         bigserial   PRIMARY KEY,
  report_id  uuid        NOT NULL REFERENCES partner_reports(id) ON DELETE CASCADE,
  visitor_id text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The count query is always "for this report", both totals at once.
CREATE INDEX IF NOT EXISTS partner_report_visits_report_idx
  ON partner_report_visits (report_id, visitor_id);

ALTER TABLE partner_report_visits ENABLE ROW LEVEL SECURITY;
-- No policies: written and read only through the service role in a server
-- route, behind the report's own password. An anon client must never be able to
-- read one partner's engagement with their report, or write to another's.

COMMENT ON TABLE partner_report_visits IS
  'One row per report view. visitor_id is a random cookie identifier, not a person.';
