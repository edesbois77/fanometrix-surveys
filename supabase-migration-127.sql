-- Migration 127 — Conversation Advisor (docs/conversation-advisor.md)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- The Conversation Advisor fronts Conversation Intelligence with a consultant
-- briefing generated from the Research Question. Two of its outputs become the
-- research design of record ON the search (alongside search_strategy from 119);
-- keywords stay a derived implementation detail in social_keywords.
--
--   information_needs (jsonb): the durable research structure —
--     { themes: [ { aspect, description, needs: [ { need, method_fit, rationale } ] } ] }
--     method_fit ∈ primary | supporting | conditional | not_suitable.
--     Themes are Research Aspects; evidence is judged against the NEEDS.
--
--   recommendation (jsonb): the consultant verdict + platform rationale +
--     limitations + actionable challenges —
--     { state, headline, rationale, can_answer, cannot_answer,
--       complementary_method, platforms[], limitations[], challenges[],
--       generated_at, model, edited }.
--     state ∈ proceed | proceed_plus_complement | reframe_first | redirect
--     (internal; the UI shows consultancy language, never the raw state).
--
-- Kept as jsonb (not columns) because these are generated content that evolves
-- with the research, same as search_strategy (119) and the aspect synthesis.

ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS information_needs jsonb,
  ADD COLUMN IF NOT EXISTS recommendation    jsonb;

-- Make the new columns visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';

-- Rollback:
--   ALTER TABLE social_searches
--     DROP COLUMN IF EXISTS information_needs,
--     DROP COLUMN IF EXISTS recommendation;
