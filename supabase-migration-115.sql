-- Migration 115 — question-anchored relevance judging (Stage 2 of collection)
--
-- Conversation collection becomes two-stage:
--   Stage 1 — retrieve candidate conversations by keyword + connector (unchanged).
--   Stage 2 — run each candidate through an AI relevance classifier that judges,
--             against the search's Research Question, whether it GENUINELY helps
--             answer the question. Keyword presence is not relevance: a video
--             "FedEx driver falls into a swimming pool" mentions FedEx but says
--             nothing about football, sponsorship or fan opinion, so it scores ~0
--             for "How do fans perceive FedEx's UCL sponsorship?".
--
-- The 0–1 relevance_score column (added in 112, numeric(4,3)) now carries this
-- question relevance and is presented as 0–100 in the UI. Two new columns record
-- WHY and HOW SURE. Nothing is discarded — low-relevance evidence is still stored
-- and simply hidden from the default Evidence view (toggle to include it).
--
-- Rows collected before this migration have NULL relevance_rationale — they were
-- never question-judged, so the Evidence view treats them as unscored and always
-- shows them (never hidden by the threshold).

ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS relevance_rationale  text,   -- one line: why it does / doesn't help answer the question
  ADD COLUMN IF NOT EXISTS relevance_confidence text;   -- 'High' | 'Medium' | 'Low' — classifier's certainty in the judgement

-- Per-search relevance threshold (0–100). Conversations scoring below it are
-- hidden from the default Evidence view. Configurable per search; default 50.
ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS relevance_threshold smallint NOT NULL DEFAULT 50;
