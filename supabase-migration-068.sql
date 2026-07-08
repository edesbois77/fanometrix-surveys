-- Migration 068: research_summaries — the AI Intelligence Layer's output table
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- First persisted AI-generated output in the app. Until now, Social
-- Listening's "Generate Insights" report (a GPT-4o call over classified
-- mentions, app/api/social/insights/route.ts) was computed on click and
-- thrown away the moment the admin navigated away — no draft, no
-- history, no review step. This table gives it a durable home and a
-- review workflow: draft → edited → approved → published.
--
-- Deliberately one generic table rather than separate ai_outputs /
-- insight_cards / research_summaries tables — source_type/output_type
-- carry the polymorphism, so the same table can hold Survey Intelligence
-- and other future analyst outputs later without a schema rewrite.
-- source_type/output_type CHECKs are intentionally narrow (only what
-- app code produces today) — widen them in a future migration once a
-- second analyst function ships, rather than pre-approving values
-- nothing writes yet.
--
-- No separate intelligence_jobs table: nothing in this app runs
-- outside a single request today (see collect-reddit's own comment),
-- so there's nothing to queue. generated_at/model/generated_by carry
-- the minimal job metadata directly on the output row instead.

CREATE TABLE IF NOT EXISTS research_summaries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  source_type     text        NOT NULL CHECK (source_type IN ('conversation_search')),
  source_id       uuid        NOT NULL,
  output_type     text        NOT NULL DEFAULT 'research_summary'
                  CHECK (output_type IN ('research_summary')),

  -- The AI draft, exactly as generated — never mutated, so an admin's
  -- edits are always comparable back to what the model actually said.
  content         jsonb       NOT NULL,
  edited_content  jsonb,

  status          text        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'edited', 'approved', 'published')),

  model           text,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  generated_by    text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  published_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One summary per (source, output type) — generating again overwrites
-- this same row rather than accumulating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_summaries_source
  ON research_summaries (source_type, source_id, output_type);

CREATE INDEX IF NOT EXISTS idx_research_summaries_status ON research_summaries (status);

CREATE OR REPLACE FUNCTION set_research_summaries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS research_summaries_updated_at ON research_summaries;
CREATE TRIGGER research_summaries_updated_at
  BEFORE UPDATE ON research_summaries
  FOR EACH ROW EXECUTE FUNCTION set_research_summaries_updated_at();

ALTER TABLE research_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_research_summaries" ON research_summaries USING (false);

-- Rollback:
--   DROP TRIGGER IF EXISTS research_summaries_updated_at ON research_summaries;
--   DROP FUNCTION IF EXISTS set_research_summaries_updated_at();
--   DROP TABLE IF EXISTS research_summaries;
