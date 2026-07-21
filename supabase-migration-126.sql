-- Migration 126: "Fan Invitation" built-in creative (extends the Countdown Clock)
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Adds a third creative layout, 'invitation', alongside the existing
-- 'timer' (Countdown Clock) and 'classic' (plain list) layouts introduced in
-- migration 049. The invitation layout renders the exact same timer creative
-- (app/embed/ThemedSurvey.tsx) but fronts it with a welcome/invitation screen:
-- the countdown is held until the fan presses "Share Your Voice", then the
-- questions + countdown proceed exactly as the Countdown Clock does today.
--
-- Seeds one system built-in, "Fan Invitation", reusing the Fanometrix Premium
-- palette so it looks like the flagship Countdown Clock with an intro.

-- 1. Widen the layout CHECK constraint to allow 'invitation'.
--    Migration 049 added `layout` with an inline CHECK, which Postgres names
--    creative_designs_layout_check — drop and recreate it.
ALTER TABLE creative_designs
  DROP CONSTRAINT IF EXISTS creative_designs_layout_check;

ALTER TABLE creative_designs
  ADD CONSTRAINT creative_designs_layout_check
  CHECK (layout IN ('timer', 'classic', 'invitation'));

-- 2. Seed the built-in. is_system = true (matches migration 050's treatment of
--    the original built-ins) so it's protected: edits fork an editable variant.
INSERT INTO creative_designs (slug, name, theme, sub_theme, layout, is_system, builder_state, created_by)
VALUES
  ('fan-invitation', 'Fan Invitation', 'fanometrix', 'Fan Invitation', 'invitation', true,
   '{"mode":"gradient","name":"Fan Invitation","gradientColor1":"#D7B87A","gradientColor2":"#A8864A","gradientColor3":"#7C3AED","useThirdColor":false,"gradientDirection":"180deg","mirrorTopQuadrants":true,"background":"#041B33","quadrantBase":"#0B1929","border":"#D7B87A","glowHex":"#000000","glowAlpha":0.6,"text":"#FFFFFF","selectedText":"#041B33","timer":"#D7B87A","headerText":"#041B33","headerColor":"#D7B87A","selectedColor":"#D7B87A"}'::jsonb,
   'migration')
ON CONFLICT (slug) DO NOTHING;
