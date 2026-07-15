-- Migration 082: Simulation — scenario_templates table, seeded
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 5 of the Demo Projects blueprint. Database-backed records, not
-- application config — GET /api/scenario-templates (built in Phase 6)
-- will read this table live; there is no hardcoded or duplicate copy
-- of template data anywhere in the application. V1 seeds exactly the
-- two templates already designed in the Demo Projects UX review
-- (Launch a Scenario gallery) rather than inventing new ones here.
-- Adding a third later is a further migration — a plain, reviewed
-- INSERT — never a schema change.
--
-- source_config is the same shape the Custom-wizard creation path
-- (Phase 6) will also produce, so both creation paths feed the
-- generation engine one input contract, not two:
--   { sources: ("survey"|"conversation_search")[], topic: string,
--     tone_preset: "positive_momentum"|"mixed_reaction"|
--       "concerned_fanbase"|"balanced",
--     markets: string[], survey_response_target: int, mention_target: int }

CREATE TABLE IF NOT EXISTS scenario_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  description    text,
  tags           text[]      NOT NULL DEFAULT '{}',
  source_config  jsonb       NOT NULL DEFAULT '{}',
  is_active      boolean     NOT NULL DEFAULT true,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evidence_simulations
  ADD CONSTRAINT evidence_simulations_scenario_template_fk
    FOREIGN KEY (scenario_template_id) REFERENCES scenario_templates(id) ON DELETE SET NULL;

ALTER TABLE scenario_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_scenario_templates" ON scenario_templates USING (false);

INSERT INTO scenario_templates (name, description, tags, source_config) VALUES
(
  'Premier League Sponsorship Pulse',
  'Fan sentiment toward a new shirt-sleeve sponsor, three EU markets.',
  ARRAY['UK · DE · FR', 'Survey + Conversation', 'Great for: Sponsorship pitches'],
  '{
    "sources": ["survey", "conversation_search"],
    "topic": "Sponsorship & Brand Partnerships",
    "tone_preset": "positive_momentum",
    "markets": ["GB", "DE", "FR"],
    "survey_response_target": 600,
    "mention_target": 450
  }'::jsonb
),
(
  'Publisher Onboarding — Football News',
  'Full research lifecycle on a football news vertical, ready to walk through end to end.',
  ARRAY['UK · US', 'Survey + Conversation', 'Great for: Publisher onboarding'],
  '{
    "sources": ["survey", "conversation_search"],
    "topic": "Publisher Engagement & Content",
    "tone_preset": "balanced",
    "markets": ["GB", "US"],
    "survey_response_target": 500,
    "mention_target": 400
  }'::jsonb
);

-- Rollback:
--   DELETE FROM scenario_templates WHERE name IN ('Premier League Sponsorship Pulse', 'Publisher Onboarding — Football News');
--   ALTER TABLE evidence_simulations DROP CONSTRAINT IF EXISTS evidence_simulations_scenario_template_fk;
--   DROP TABLE IF EXISTS scenario_templates;
