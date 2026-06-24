-- Migration 042: Survey event tracking
-- Creates survey_events table for render/start/funnel/completion/exit tracking.
-- Adds placement_id and creative_id to responses.

-- ── survey_events ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS survey_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    UUID NOT NULL,
  event_type    TEXT NOT NULL,
  -- event_type values: SURVEY_RENDER | SURVEY_START | QUESTION_2_REACHED | QUESTION_3_REACHED | SURVEY_COMPLETED | SURVEY_EXIT
  campaign_id   TEXT,
  publisher     TEXT,
  placement     TEXT,
  placement_id  TEXT,
  creative_id   TEXT,
  country       TEXT,
  device        TEXT,
  browser       TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS survey_events_campaign_id_idx ON survey_events (campaign_id);
CREATE INDEX IF NOT EXISTS survey_events_event_type_idx  ON survey_events (event_type);
CREATE INDEX IF NOT EXISTS survey_events_created_at_idx  ON survey_events (created_at);
CREATE INDEX IF NOT EXISTS survey_events_session_id_idx  ON survey_events (session_id);

ALTER TABLE survey_events ENABLE ROW LEVEL SECURITY;

-- Anonymous inserts — embeds fire events directly from the browser
CREATE POLICY "events_insert_anon" ON survey_events
  FOR INSERT TO anon WITH CHECK (true);

-- Select denied to anon — dashboard reads via service role key in API routes
CREATE POLICY "events_select_authenticated" ON survey_events
  FOR SELECT TO authenticated USING (true);

-- ── responses: placement_id and creative_id ─────────────────────────────────

ALTER TABLE responses ADD COLUMN IF NOT EXISTS placement_id TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS creative_id  TEXT;
