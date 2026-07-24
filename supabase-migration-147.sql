-- Migration 147: response_answers — every answer persisted the moment it is given
--
-- The Fanometrix evidence principle: an answer selected is a valid data point and
-- must be kept even if the respondent abandons later. `responses` stays exactly
-- as it is — one row per COMPLETED submission, the canonical record for
-- completion metrics and reporting — and this new table captures each individual
-- answer as it happens, so Findings can count every question independently from
-- everyone who actually answered it (partials included).
--
-- Additive and non-breaking: nothing existing reads or writes this table yet, and
-- `responses` is untouched. One row per (session, question); re-selecting upserts.

CREATE TABLE IF NOT EXISTS response_answers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The per-respondent key, the same session UUID survey_events uses.
  session_id     uuid        NOT NULL,
  -- Campaign slug (matches responses.campaign_id / survey_events.campaign_id).
  campaign_id    text        NOT NULL,
  survey_id      text,
  -- 0 = Q1, 1 = Q2, 2 = Q3 (surveys are capped at 3 questions).
  question_index smallint    NOT NULL CHECK (question_index BETWEEN 0 AND 2),
  -- The selected option id, stored as text exactly like responses.q1/q2/q3.
  answer_value   text        NOT NULL,
  country        text,
  fan_segment    text,
  market         text,
  is_demo        boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- One answer per question per session; changing an answer updates in place.
  UNIQUE (session_id, question_index)
);

-- Findings read by campaign + question; the session index supports reconstruction.
CREATE INDEX IF NOT EXISTS idx_response_answers_campaign ON response_answers (campaign_id, question_index);
CREATE INDEX IF NOT EXISTS idx_response_answers_session  ON response_answers (session_id);

-- Written only by the server endpoint (service role); never read/written by anon.
ALTER TABLE response_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS response_answers_no_anon ON response_answers;
CREATE POLICY response_answers_no_anon ON response_answers FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ──────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS response_answers;
