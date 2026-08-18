-- Migration 183: Survey Studio Phase 3 — widen response_answers to 1–5 questions.
--
-- Additive + idempotent. `response_answers` is the forward-looking generic response
-- model (one row per (session, question_index), migration 147). It was capped at
-- three questions purely by a CHECK constraint; Phase 3 raises the product maximum
-- to five, so the generic model must accept question_index 0–4. NOT auto-applied.
--
-- COMPATIBILITY:
--   • Purely a WIDENING of the existing CHECK (0–2 → 0–4). Every historical row
--     (question_index 0–2) remains valid; nothing is rewritten or backfilled.
--   • The positional legacy `responses.q1/q2/q3` columns are intentionally NOT
--     extended — q4/q5 answers live only in `response_answers`, which is the
--     authoritative per-question store for surveys with more than three questions.
--   • The inline CHECK from migration 147 is unnamed (auto-named
--     response_answers_question_index_check); we drop-if-exists then re-add so this
--     migration is safe to run more than once.

ALTER TABLE response_answers
  DROP CONSTRAINT IF EXISTS response_answers_question_index_check;

ALTER TABLE response_answers
  ADD CONSTRAINT response_answers_question_index_check
  CHECK (question_index BETWEEN 0 AND 4);
