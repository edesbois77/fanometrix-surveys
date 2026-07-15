-- Migration 086: Fix — restore research_projects.research_mode's DEFAULT
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 6 validation caught this: a direct insert into research_projects
-- omitting research_mode fails with a NOT NULL violation, even though
-- migration 075 specified DEFAULT 'real' and every existing row is
-- correctly 'real' (the default clearly applied once, at column
-- creation/backfill time). No migration between 075 and 085 touches
-- this column. Root cause isn't fully diagnosable from here without
-- direct SQL introspection access — this migration is the fix
-- regardless of mechanism: explicitly (re)set the default on the live
-- column. Idempotent, safe to run even if the default already exists.

ALTER TABLE research_projects
  ALTER COLUMN research_mode SET DEFAULT 'real';

-- Rollback:
--   ALTER TABLE research_projects ALTER COLUMN research_mode DROP DEFAULT;
