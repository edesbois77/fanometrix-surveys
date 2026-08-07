-- Migration 166 — ORG-005 IW-2: Contextual Role (permission profile) on User–Organisation Access
--
-- Governed by the frozen ORG-005 Implementation Programme Plan v1.0, workstream
-- IW-2 (Contextual Roles as Permission Profiles). Strangler / ADDITIVE /
-- NON-DESTRUCTIVE. It binds a security **Role (permission profile)** to each
-- User–Organisation Access row — i.e. a role contextual to the Organisation the
-- user is operating in — separating it from the Organisation's own
-- classification (`organisations.type`, "what the Organisation is").
--
-- The global `users.role` enum is RETAINED unchanged as the authoritative
-- fallback during the strangler migration and is NOT dropped here (decommission
-- is a later workstream governed by the plan; IW-2 does not remove it).
--
-- Idempotent (IF NOT EXISTS / conditional backfill) so it is safe to hand-apply.
-- Architecture: Q-11 (Role = reusable named permission profile, contextual, NOT
-- real-world organisational meaning). NOTE: the initial CHECK set mirrors the
-- legacy role values purely to preserve current permissions 1:1 during
-- migration (parity); refinement of the profile catalogue away from real-world
-- names is a later, separate concern and is NOT performed here.

ALTER TABLE user_organisation_access
  ADD COLUMN IF NOT EXISTS role text
    CHECK (role IN ('admin', 'brand', 'agency', 'publisher'));

-- Backfill (idempotent): each Access row's contextual Role is initialised to
-- the user's current global role — an exact 1:1 mapping that preserves current
-- permissions. Only fills rows that do not yet have a role.
UPDATE user_organisation_access uoa
  SET role = u.role
  FROM users u
  WHERE uoa.user_id = u.id
    AND uoa.role IS NULL;

CREATE INDEX IF NOT EXISTS idx_uoa_user_role ON user_organisation_access (user_id, role);

-- ============================================================
-- ROLLBACK (manual, if ever required BEFORE decommission):
--   ALTER TABLE user_organisation_access DROP COLUMN IF EXISTS role;
-- users.role is untouched by this migration, so rollback restores the prior
-- state exactly. Do NOT drop users.role here.
-- ============================================================
