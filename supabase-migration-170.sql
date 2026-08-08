-- Migration 170 — ORG-005 IW-6: Resource Authorisation & Entitlement.
--
-- Governed by Q-13–Q-19/Q-26 and Programme Plan IW-6. Additive / non-destructive /
-- idempotent. Introduces the two governed entities as durable Platform
-- Authorisation state, ALONGSIDE the existing user_access_grants (retained; the
-- grants→User Resource Authorisation mapping + read cut-over are the governed
-- ACTIVATION, dual-run, after this migration is applied — not performed here):
--
--   • Organisation Resource Entitlement (Q-14) — the ORGANISATION is entitled to a
--     specific protected resource OR a governed Resource Scope, per class. NOT
--     ownership (ownership/participation are Policy Inputs, never entitlement).
--   • User Resource Authorisation (Q-15) — whether a User may EXERCISE the org's
--     entitlement; may NARROW (restrict) but never expand it.
--
-- The four governed classes only (Q-16): study | finding | report | data. §38
-- RESERVED and NOT encoded here: concrete product-specific resource identifiers,
-- Resource Scope membership schemas, and any richer entitlement-storage semantics
-- — resource_id / scope_id are opaque uuids the application resolves via governed
-- (later) scope membership; this migration encodes only the governed generic
-- entities. Access control stays at the app layer (RLS = blanket anon lockout).

-- Organisation Resource Entitlement (Q-14). Exactly one of resource_id / scope_id.
CREATE TABLE IF NOT EXISTS organisation_resource_entitlements (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  resource_class   text        NOT NULL CHECK (resource_class IN ('study','finding','report','data')),
  resource_id      uuid,
  scope_id         uuid,
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ore_one_target CHECK ((resource_id IS NOT NULL) <> (scope_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_ore_org_class ON organisation_resource_entitlements (organisation_id, resource_class) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ore_resource  ON organisation_resource_entitlements (resource_class, resource_id) WHERE resource_id IS NOT NULL;

ALTER TABLE organisation_resource_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON organisation_resource_entitlements;
CREATE POLICY deny_all_anon ON organisation_resource_entitlements USING (false);

-- User Resource Authorisation (Q-15) — allow (exercise) or restrict (narrow).
CREATE TABLE IF NOT EXISTS user_resource_authorisations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_class   text        NOT NULL CHECK (resource_class IN ('study','finding','report','data')),
  resource_id      uuid,
  scope_id         uuid,
  effect           text        NOT NULL CHECK (effect IN ('allow','restrict')),
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ura_one_target CHECK ((resource_id IS NOT NULL) <> (scope_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_ura_user_class ON user_resource_authorisations (user_id, resource_class) WHERE status = 'active';

ALTER TABLE user_resource_authorisations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON user_resource_authorisations;
CREATE POLICY deny_all_anon ON user_resource_authorisations USING (false);

-- Shared updated_at trigger (from migration 008).
DROP TRIGGER IF EXISTS ore_updated_at ON organisation_resource_entitlements;
CREATE TRIGGER ore_updated_at BEFORE UPDATE ON organisation_resource_entitlements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS ura_updated_at ON user_resource_authorisations;
CREATE TRIGGER ura_updated_at BEFORE UPDATE ON user_resource_authorisations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROLLBACK (manual, before decommission):
--   DROP TABLE IF EXISTS organisation_resource_entitlements;
--   DROP TABLE IF EXISTS user_resource_authorisations;
-- user_access_grants is UNTOUCHED (retained until the grants→URA cut-over at a
-- later governed step, then IW-11). No existing behaviour changes on apply.
-- ============================================================
