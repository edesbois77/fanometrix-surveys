-- Migration 184: Survey Studio Phase 3 — responses ↔ response_answers join key.
--
-- Additive + idempotent. NOT auto-applied (hand-applied per DB-ahead-of-code).
--
-- WHY: the Responses CSV is one row per completed `responses` record and must now
-- present the survey's ACTUAL question count (1–5, settled PA decision). Q1–Q3 live
-- on `responses` (q1/q2/q3); Q4/Q5 live ONLY in `response_answers` (keyed by
-- session_id). Implementation revealed `responses` had NO key to `response_answers`,
-- so per-row Q4/Q5 could not be attributed. This adds that key.
--
-- COMPATIBILITY:
--   • session_id is NULLABLE with no default — every historical `responses` row
--     stays valid (NULL). Those rows belong to ≤3-question surveys, whose CSV width
--     is ≤3, so a missing Q4/Q5 join is correct, not a gap.
--   • /api/submit now persists the embed's session_id (the same id it already sends
--     to /api/answer + /api/events); older cached embeds that omit it simply store
--     NULL — no error, no behaviour change for existing 1–3-question campaigns.
--   • The positional q1/q2/q3 columns are unchanged; no q4/q5 columns are added.

ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS session_id uuid;

-- Supports the per-response Q4/Q5 lookup (responses.session_id = response_answers.session_id).
CREATE INDEX IF NOT EXISTS idx_responses_session ON responses (session_id);

COMMENT ON COLUMN responses.session_id IS 'Embed session id; joins to response_answers for Q4/Q5 in >3-question surveys. NULL for legacy/≤3-question rows.';
