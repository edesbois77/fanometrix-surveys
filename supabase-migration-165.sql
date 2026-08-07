-- Migration 165 — ORG-005 IW-1: User–Organisation Access + Active Organisation Context
--
-- Governed by the frozen ORG-005 Implementation Programme Plan v1.0, workstream
-- IW-1 (Organisation Model & Active Context). Strangler migration: this is
-- ADDITIVE and non-destructive. It introduces the multi-organisation model
-- ALONGSIDE the existing scalar users.organisation_id, which is RETAINED as the
-- authoritative fallback until the final decommission workstream (IW-11). No
-- column is dropped and no existing behaviour changes by applying this migration.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT) so it is safe to hand-apply
-- regardless of current live schema state ("DB ahead of code" practice —
-- verify before running). Access control remains at the API layer via
-- requireUser()/lib/access.ts; RLS here is a blanket anon lockout, consistent
-- with every other domain table.
--
-- Architecture: Q-03 (User–Organisation Access), Q-04 (terminology — this is
-- Access, not Membership/Authority), Q-05 (zero/one/many, no implicit
-- propagation), Q-06/Q-07 (Active Organisation Context + remembered/preferred
-- convenience state that must remain currently authorised).

-- ============================================================
-- USER–ORGANISATION ACCESS  (the platform-native fact that a User may use an
-- Organisation as a Fanometrix context — Q-03/Q-04). Zero, one or many rows per
-- user (Q-05). This is NOT canonical Membership/Relationship/Authority/Role.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_organisation_access (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  organisation_id  uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'revoked')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_uoa_user            ON user_organisation_access (user_id);
CREATE INDEX IF NOT EXISTS idx_uoa_org             ON user_organisation_access (organisation_id);
CREATE INDEX IF NOT EXISTS idx_uoa_user_active     ON user_organisation_access (user_id) WHERE status = 'active';

ALTER TABLE user_organisation_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON user_organisation_access;
CREATE POLICY deny_all_anon ON user_organisation_access USING (false);

-- updated_at trigger (reuses the shared set_updated_at() from migration 008).
DROP TRIGGER IF EXISTS user_organisation_access_updated_at ON user_organisation_access;
CREATE TRIGGER user_organisation_access_updated_at
  BEFORE UPDATE ON user_organisation_access
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ACTIVE ORGANISATION CONTEXT — remembered/preferred convenience state (Q-07).
-- Nullable. This is NOT authority: it is a convenience pointer that the
-- application MUST validate against the live User–Organisation Access set on
-- every use (a remembered context that is no longer authorised is ignored).
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS remembered_organisation_id uuid REFERENCES organisations(id) ON DELETE SET NULL;

-- ============================================================
-- BACKFILL (idempotent) — each org-bearing user gets exactly one active Access
-- fact mirroring their current scalar organisation_id (strict 1:1; multiplicity
-- is 0 or 1 today). Single-org users therefore behave identically. The scalar
-- users.organisation_id is left in place as the authoritative fallback.
-- ============================================================
INSERT INTO user_organisation_access (user_id, organisation_id, created_by)
  SELECT id, organisation_id, 'migration-165-backfill'
  FROM users
  WHERE organisation_id IS NOT NULL
ON CONFLICT (user_id, organisation_id) DO NOTHING;

UPDATE users
  SET remembered_organisation_id = organisation_id
  WHERE organisation_id IS NOT NULL
    AND remembered_organisation_id IS NULL;

-- ============================================================
-- ROLLBACK (manual, if ever required BEFORE decommission):
--   DROP TABLE IF EXISTS user_organisation_access;
--   ALTER TABLE users DROP COLUMN IF EXISTS remembered_organisation_id;
-- users.organisation_id is untouched by this migration, so rollback restores
-- the prior state exactly. Do NOT drop users.organisation_id here — that is the
-- decommission workstream (IW-11), only after read cut-over is verified.
-- ============================================================
