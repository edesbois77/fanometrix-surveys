-- Migration 174 — ORG-005 IW-11 destructive-decommission (step 2: zero-consumer items).
--
-- Removes legacy authorisation artefacts that have ZERO remaining code consumers
-- (verified by grep + census at commit 9197be0) and whose replacements are live:
--   • user_access_grants — Selected Access migrated to governed Study User Resource
--     Authorisation (DEC-1 Option A); 0 rows; no code reader/writer remains.
--   • users.legacy_username — F019 vestigial identity; no code consumer (6 values
--     preserved in ~/Downloads/ORG-005-IW-11-pre-drop-snapshot.json).
-- Also prepares users.role for its writer removal by dropping its NOT NULL
-- constraint (the contextual role in user_organisation_access.role is authoritative;
-- users.role becomes write-optional ahead of its own drop in a later migration).
--
-- allowed_campaign_ids / allowed_publisher_ids: VERIFIED ABSENT on users — nothing
-- to drop (do not infer existence). users.organisation_id and users.role columns are
-- RETAINED here and dropped only after their remaining code consumers are removed
-- (separate migration).
--
-- DESTRUCTIVE. Snapshots taken; rollback below.

DROP TABLE IF EXISTS user_access_grants;

ALTER TABLE users DROP COLUMN IF EXISTS legacy_username;

ALTER TABLE users ALTER COLUMN role DROP NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (from ~/Downloads/ORG-005-IW-11-pre-drop-snapshot.json):
--   ALTER TABLE users ALTER COLUMN role SET NOT NULL;   -- (all rows still populated)
--   ALTER TABLE users ADD COLUMN legacy_username text;  -- then restore the 6 values
--   CREATE TABLE user_access_grants ( ... );            -- recreate schema (0 rows)
-- Retained/untouched: users.organisation_id, users.role (columns), remembered_
-- organisation_id, user_organisation_access, URA/ORE/resource-scopes, operator/
-- admin-authority/exceptional-access tables, decision.ts, insights.tags.
-- ============================================================
