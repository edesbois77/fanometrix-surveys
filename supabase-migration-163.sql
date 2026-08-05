-- Migration 163: Stack creative — first-class layout + config column + seed row.
--
-- Fully additive and idempotent. Existing designs, campaigns, and the
-- timer/classic/invitation creatives are unaffected. Per the project's
-- "DB ahead of code" practice, apply this to the shared Supabase BEFORE
-- deploying the accompanying code. Verify the live constraint first
-- (\d creative_designs) in case prod was partially migrated already.

-- 1) Allow layout = 'stack'. Mirrors migration 126's drop/recreate of the
--    Postgres-auto-named check constraint.
ALTER TABLE creative_designs DROP CONSTRAINT IF EXISTS creative_designs_layout_check;
ALTER TABLE creative_designs
  ADD CONSTRAINT creative_designs_layout_check
  CHECK (layout IN ('timer', 'classic', 'invitation', 'stack'));

-- 2) Stack configuration column. Deliberately separate from the colour-only
--    builder_state jsonb. Nullable, so every existing (non-stack) row stays NULL
--    and is untouched. Shape: { hoverVariant, completionMode, topic, panelUrl }.
ALTER TABLE creative_designs ADD COLUMN IF NOT EXISTS config jsonb;

-- 3) Seed the built-in system Stack design so it appears in the Creative Designs
--    gallery and can be duplicated into editable variants (matching how other
--    designs are created). is_system = protected (edits fork a new variant).
INSERT INTO creative_designs
  (slug, name, theme, sub_theme, layout, is_system, status, builder_state, config, created_by)
VALUES (
  'fanometrix-stack', 'Fanometrix Stack', 'fanometrix', 'Stack',
  'stack', true, 'active',
  '{}'::jsonb,  -- Stack has no colour theme; builder_state is intentionally empty
  '{"hoverVariant":"fade","completionMode":"standard","topic":null,"panelUrl":null}'::jsonb,
  'migration'
)
ON CONFLICT (slug) DO NOTHING;
