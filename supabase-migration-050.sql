-- Migration 050: Creative Gallery UX refactor — Archive lifecycle, protected
-- system designs, and simple logo/branding fields.
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- status: separates "Archive" (reversible, still fully intact and editable,
-- just excluded from the default active list) from the existing deleted_at
-- soft-delete (which stays the more destructive, in-use-blocked action).
-- Mirrors how lib/campaign-status.ts already separates a campaign's
-- "archived" status from its own deleted_at.
--
-- is_system: flags the 9 original built-in designs (seeded in migration 049
-- with created_by = 'migration'). Editing one now forks a new variant
-- instead of overwriting the protected master — enforced in the PUT route.
--
-- branding: simple logo-URL fields (no upload infrastructure exists in this
-- codebase yet) for white-labelled variants, e.g. "Fanometrix + Nike".

ALTER TABLE creative_designs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

ALTER TABLE creative_designs
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

ALTER TABLE creative_designs
  ADD COLUMN IF NOT EXISTS branding jsonb;

UPDATE creative_designs SET is_system = true WHERE created_by = 'migration';
