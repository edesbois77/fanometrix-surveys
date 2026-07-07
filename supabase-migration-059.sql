-- Migration 059: Drop deprecated users columns
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Cutover for the User Management v2 / Organisations redesign
-- (supabase-migration-052 through -058). Every column dropped here has
-- been fully replaced by new columns/tables and verified (via a full
-- codebase grep) to have zero remaining application code reading it:
--
--   username               → superseded by work_email (login identifier)
--                            and legacy_username (kept, reference only)
--   organisation_name      → superseded by organisation_id (FK to organisations)
--   organisation_type      → was already unused since supabase-migration-008.sql
--   allowed_campaign_ids   → superseded by user_access_grants + lib/access.ts
--   allowed_publisher_ids  → superseded by user_access_grants + lib/access.ts
--   is_active               → superseded by status (pending_invitation/active/disabled)
--   associated_agency       ┐
--   associated_brand        │ superseded by organisation_id + user_access_grants
--   associated_publisher    │ (see the rewritten lib/insights-access.ts)
--   associated_projects     │
--   associated_markets      ┘
--
-- legacy_username is deliberately kept — it's the one column here users
-- explicitly asked to preserve as a historical reference, not used for
-- login or any access decision.

ALTER TABLE users
  DROP COLUMN IF EXISTS username,
  DROP COLUMN IF EXISTS organisation_name,
  DROP COLUMN IF EXISTS organisation_type,
  DROP COLUMN IF EXISTS allowed_campaign_ids,
  DROP COLUMN IF EXISTS allowed_publisher_ids,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS associated_agency,
  DROP COLUMN IF EXISTS associated_brand,
  DROP COLUMN IF EXISTS associated_publisher,
  DROP COLUMN IF EXISTS associated_projects,
  DROP COLUMN IF EXISTS associated_markets;

-- Rollback (data is not recoverable once this migration runs — this only
-- restores the columns, empty):
--   ALTER TABLE users
--     ADD COLUMN username text,
--     ADD COLUMN organisation_name text NOT NULL DEFAULT '',
--     ADD COLUMN organisation_type text NOT NULL DEFAULT '',
--     ADD COLUMN allowed_campaign_ids text[] NOT NULL DEFAULT '{}',
--     ADD COLUMN allowed_publisher_ids text[] NOT NULL DEFAULT '{}',
--     ADD COLUMN is_active boolean NOT NULL DEFAULT true,
--     ADD COLUMN associated_agency text,
--     ADD COLUMN associated_brand text,
--     ADD COLUMN associated_publisher text,
--     ADD COLUMN associated_projects text[] DEFAULT '{}',
--     ADD COLUMN associated_markets text[] DEFAULT '{}';
