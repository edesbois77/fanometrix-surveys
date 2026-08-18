-- Migration 181: Survey Studio Create — refreshed "Studio Classic" creative.
--
-- Additive + idempotent. Introduces a NEW creative_designs row for the refreshed
-- Classic used by NEW Survey Studio Create. STRANGLER: the historical `classic`
-- row and ClassicSurvey are UNTOUCHED and continue to serve existing campaigns.
-- The refreshed identity is distinguished by config.renderer = 'studio-classic'
-- (NEVER by layout) — the embed + preview dispatch route ONLY this identity to
-- StudioClassicSurvey; everything else (incl. historical `classic`) keeps
-- rendering via ClassicSurvey.
--
-- SAFETY: no historical row is modified; no campaign/project/evidence reference
-- is rewritten; ON CONFLICT (slug) DO NOTHING makes it safe to run more than once.
-- layout stays 'classic' so it groups under the Classic type and resolves through
-- the existing creative_designs layout path; the renderer selector lives in config.
--
-- builder_state carries a valid palette (required NOT NULL column) and provides
-- the card's colour swatch; the refreshed renderer takes its accent from config
-- (defaulting to Fanometrix gold) rather than baking brand into the mechanic.

INSERT INTO creative_designs (slug, name, theme, sub_theme, layout, is_system, status, builder_state, config, rules, created_by)
VALUES (
  'studio-classic',
  'Fanometrix Classic',
  'fanometrix',
  'Studio Classic',
  'classic',
  true,
  'active',
  '{"mode":"gradient","name":"Fanometrix Classic","text":"#FFFFFF","timer":"#D7B87A","border":"#D7B87A","glowHex":"#000000","glowAlpha":0.6,"background":"#0B1E33","headerText":"#0B1E33","headerColor":"#D7B87A","quadrantBase":"#0B1929","selectedText":"#0B1E33","selectedColor":"#D7B87A","useThirdColor":false,"gradientColor1":"#D7B87A","gradientColor2":"#A8864A","gradientColor3":"#7C3AED","gradientDirection":"180deg","mirrorTopQuadrants":true}'::jsonb,
  '{"renderer":"studio-classic"}'::jsonb,
  '{"introSupported":true,"minQuestions":1,"maxQuestions":3,"thankYouSupported":true,"maxOptions":4,"maxQChars":70,"maxOptChars":32}'::jsonb,
  'migration'
)
ON CONFLICT (slug) DO NOTHING;
