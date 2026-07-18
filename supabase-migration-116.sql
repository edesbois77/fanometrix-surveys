-- Migration 116 — structured research evidence (evolves Stage-2 classification)
--
-- Stage 2 no longer only answers "is this relevant?" — it explains WHY a
-- conversation matters and WHICH part of the research it contributes to. On top
-- of the relevance score / confidence / rationale added in 115, each conversation
-- now records a Research Aspect: the facet of the research question it informs
-- (e.g. Brand Perception, Sponsorship Awareness, Fan Benefits, Brand Fit,
-- Purchase Intent). The values are AI-generated, not a fixed vocabulary, so the
-- evidence organises naturally around the questions it helps answer — the
-- foundation for future synthesis and child Research Questions.
--
-- relevance_rationale (115) is repurposed as the richer "Why this matters"
-- explanation (1–2 sentences); no schema change needed for that.

ALTER TABLE social_mentions
  ADD COLUMN IF NOT EXISTS research_aspect text;  -- AI-generated facet of the research this conversation informs
