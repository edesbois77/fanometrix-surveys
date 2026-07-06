-- Migration 049: Unify built-in creative designs into creative_designs
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Retires the hardcoded/DB split from migration 048. The 9 built-in designs
-- (previously only defined in lib/creative-designs.ts + ThemedSurvey.tsx's
-- EMBED_THEMES map) become real, editable rows in this table, using their
-- exact existing slugs — campaigns.creative_design / research_projects.creative_design
-- already store these slugs, so no data migration is needed there.
--
-- layout distinguishes the one classic (plain list) design from the 8
-- Timer-layout colour palettes — everything before this migration was
-- implicitly "timer" except "classic".
--
-- builder_state values below are reverse-engineered from the hardcoded
-- EMBED_THEMES entries to reproduce each design's core look (background,
-- gradient, text, accent) as closely as the generic formula allows. A
-- handful of hand-tuned secondary effects (hover tint, border/glow alpha)
-- will shift by a few percent — an accepted, one-time visual refresh in
-- exchange for a single unified, fully editable system.

ALTER TABLE creative_designs
  ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'timer' CHECK (layout IN ('timer', 'classic'));

INSERT INTO creative_designs (slug, name, theme, sub_theme, layout, builder_state, created_by)
VALUES
  ('classic', 'Fanometrix Default', 'fanometrix', 'Fanometrix Branded', 'classic',
   '{"mode":"gradient","name":"Fanometrix Default","gradientColor1":"#D7B87A","gradientColor2":"#A8864A","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#041B33","quadrantBase":"#0B1929","border":"#D7B87A","glowHex":"#000000","glowAlpha":0.6,"text":"#FFFFFF","selectedText":"#041B33","timer":"#D7B87A","headerText":"#041B33","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('fanometrix', 'Fanometrix Premium', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Fanometrix Premium","gradientColor1":"#D7B87A","gradientColor2":"#A8864A","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#041B33","quadrantBase":"#0B1929","border":"#D7B87A","glowHex":"#000000","glowAlpha":0.6,"text":"#FFFFFF","selectedText":"#041B33","timer":"#D7B87A","headerText":"#041B33","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('electric-football', 'Electric Football', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Electric Football","gradientColor1":"#00F5A0","gradientColor2":"#00C2FF","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#061A2F","quadrantBase":"#082038","border":"#00F5A0","glowHex":"#00F5A0","glowAlpha":0.15,"text":"#FFFFFF","selectedText":"#061A2F","timer":"#00F5A0","headerText":"#061A2F","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('fan-energy', 'Fan Energy', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Fan Energy","gradientColor1":"#FF4FA3","gradientColor2":"#A855F7","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#170B2E","quadrantBase":"#21103D","border":"#FF4FA3","glowHex":"#FF4FA3","glowAlpha":0.2,"text":"#FFFFFF","selectedText":"#FFFFFF","timer":"#FF4FA3","headerText":"#FFFFFF","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('electric-purple', 'Electric Purple', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Electric Purple","gradientColor1":"#D946EF","gradientColor2":"#7C3AED","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#140B2E","quadrantBase":"#1E0D36","border":"#D946EF","glowHex":"#D946EF","glowAlpha":0.2,"text":"#FFFFFF","selectedText":"#FFFFFF","timer":"#D946EF","headerText":"#FFFFFF","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('sky-pulse', 'Sky Pulse', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Sky Pulse","gradientColor1":"#7DD3FC","gradientColor2":"#3B82F6","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#071625","quadrantBase":"#0A2033","border":"#7DD3FC","glowHex":"#7DD3FC","glowAlpha":0.1,"text":"#FFFFFF","selectedText":"#071625","timer":"#7DD3FC","headerText":"#071625","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('ocean', 'Ocean', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Ocean","gradientColor1":"#7DD3FC","gradientColor2":"#2563EB","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#081421","quadrantBase":"#0B1C2D","border":"#72D4F1","glowHex":"#72D4F1","glowAlpha":0.1,"text":"#FFFFFF","selectedText":"#081421","timer":"#72D4F1","headerText":"#081421","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('lime-energy', 'Lime Energy', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Lime Energy","gradientColor1":"#F8F32B","gradientColor2":"#A3D92F","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#10120B","quadrantBase":"#1A1F0E","border":"#F8F32B","glowHex":"#F8F32B","glowAlpha":0.1,"text":"#FFFFFF","selectedText":"#0B1929","timer":"#F8F32B","headerText":"#10120B","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration'),

  ('stadium-green', 'Stadium Green', 'fanometrix', 'Count Down Clock', 'timer',
   '{"mode":"gradient","name":"Stadium Green","gradientColor1":"#64DD17","gradientColor2":"#0B5D1E","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#07150B","quadrantBase":"#10210F","border":"#64DD17","glowHex":"#64DD17","glowAlpha":0.12,"text":"#FFFFFF","selectedText":"#07150B","timer":"#64DD17","headerText":"#FFFFFF","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration')

ON CONFLICT (slug) DO NOTHING;
