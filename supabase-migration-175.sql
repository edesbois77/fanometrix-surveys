-- Migration 175 — ORG-005 IW-11 destructive-decommission (step 4: scalar columns).
--
-- Drops the legacy scalar authorisation columns on users. Their consumers were
-- eliminated at commit ecb24fa (verified: 0 code readers/writers; provisioning,
-- auth, and display all sourced from the governed model):
--   • Active Organisation Context (user_organisation_access) replaces
--     users.organisation_id (auth-server org record by context id; /me, org
--     counts, user list/detail display, org delete-guard all governed);
--   • contextual Role (user_organisation_access.role) replaces users.role
--     (requireUser role is contextual; display governed).
--
-- Pre-drop verification (immediately before, at ecb24fa): census 4/4 active users
-- resolve, 0 strand; new-user provisioning works with NO scalar write; contextual
-- Active Context + Role resolve; G-1/G-2/G-3 preserved; suite/typecheck green;
-- production healthy. Values snapshotted in ~/Downloads/ORG-005-IW-11-pre-drop-snapshot.json.
--
-- DESTRUCTIVE. Each column drop is separately identifiable and independently
-- rollback-capable (see ROLLBACK). Retained/untouched: remembered_organisation_id,
-- user_organisation_access (+ its role), URA/ORE/resource-scopes, operator/admin-
-- authority/exceptional-access tables, decision.ts, insights.tags.

-- (A) drop the scalar Organisation column (governed by Active Organisation Context).
ALTER TABLE users DROP COLUMN IF EXISTS organisation_id;

-- (B) drop the scalar global Role column (governed by the contextual role).
ALTER TABLE users DROP COLUMN IF EXISTS role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK (each independently, from ~/Downloads/ORG-005-IW-11-pre-drop-snapshot.json):
--   (A) ALTER TABLE users ADD COLUMN organisation_id uuid REFERENCES organisations(id);
--       -- then restore per-user values from the snapshot.
--   (B) ALTER TABLE users ADD COLUMN role text;   -- (was made nullable in migration 174)
--       -- then restore per-user values from the snapshot;
--       -- optionally ALTER COLUMN role SET NOT NULL once repopulated.
-- No code references either column post-ecb24fa, so rollback is data-only.
-- ============================================================
