-- Migration 172 — ORG-005 G-2: replacement authority persistence (activate IW-5).
--
-- Additive / non-destructive / idempotent. Introduces the persistent stores the
-- accepted IW-5 model + approved §4.2 Option (a) require, so the live
-- `role === "admin" → null` resource super-ALLOW can later be replaced ATOMICALLY
-- (the cut-over is a SEPARATE authority; this migration switches nothing on).
--
-- THREE DELIBERATELY DISTINCT axes (administer ≠ possess; all DENY-subordinate):
--   • platform_admin_authorities  — Scoped Platform Administration Authority grants
--     (Q-27): a bounded privileged OPERATION within a scope. Grants NO resource access.
--   • platform_operator_entitlements — the approved Platform-Operator standing
--     resource entitlement (§4.2 a): explicit, per-domain, revocable routine resource
--     ACCESS. Grants NO administrative-operation authority.
--   • exceptional_resource_access — bounded, invoked, time-boxed break-glass (Q-19).
-- App-layer authoritative; RLS = blanket anon lockout.

-- Scoped Platform Administration Authority (Q-27). operation ∈ the code catalogue
-- (lib/authz/admin-operations.ts). organisation_id NULL = the operation's own scope
-- (never global-by-default; internal status alone confers nothing).
CREATE TABLE IF NOT EXISTS platform_admin_authorities (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation        text        NOT NULL,
  organisation_id  uuid        REFERENCES organisations(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paa_subject_op ON platform_admin_authorities (subject_user_id, operation) WHERE status = 'active';
ALTER TABLE platform_admin_authorities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON platform_admin_authorities;
CREATE POLICY deny_all_anon ON platform_admin_authorities USING (false);

-- Platform-Operator standing resource entitlement (§4.2 a). One row per
-- (operator, resource_domain): explicit, granular, revocable routine resource access.
-- NOT customer ORE, NOT admin authority, NOT exceptional access, NOT a super-ALLOW.
CREATE TABLE IF NOT EXISTS platform_operator_entitlements (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_domain  text        NOT NULL CHECK (resource_domain IN ('study','data','finding','report','campaign','campaign_group','insight')),
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poe_unique_active UNIQUE (subject_user_id, resource_domain)
);
CREATE INDEX IF NOT EXISTS idx_poe_subject ON platform_operator_entitlements (subject_user_id) WHERE status = 'active';
ALTER TABLE platform_operator_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON platform_operator_entitlements;
CREATE POLICY deny_all_anon ON platform_operator_entitlements USING (false);

-- Exceptional Resource Access (Q-19) — bounded, invoked, time-boxed break-glass.
-- expires_at enforces time-boxing; every use is IW-7 audited by the caller.
CREATE TABLE IF NOT EXISTS exceptional_resource_access (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_user_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eligible           boolean     NOT NULL DEFAULT false,
  invoked            boolean     NOT NULL DEFAULT false,
  purpose            text,
  resource_type      text        NOT NULL,
  resource_id        uuid,
  scope_id           uuid,
  operation          text        NOT NULL,
  expires_at         timestamptz NOT NULL,
  status             text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT era_one_target CHECK ((resource_id IS NOT NULL) <> (scope_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_era_principal ON exceptional_resource_access (principal_user_id) WHERE status = 'active';
ALTER TABLE exceptional_resource_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON exceptional_resource_access;
CREATE POLICY deny_all_anon ON exceptional_resource_access USING (false);

-- updated_at triggers (set_updated_at from migration 008).
DROP TRIGGER IF EXISTS paa_updated_at ON platform_admin_authorities;
CREATE TRIGGER paa_updated_at BEFORE UPDATE ON platform_admin_authorities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS poe_updated_at ON platform_operator_entitlements;
CREATE TRIGGER poe_updated_at BEFORE UPDATE ON platform_operator_entitlements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS era_updated_at ON exceptional_resource_access;
CREATE TRIGGER era_updated_at BEFORE UPDATE ON exceptional_resource_access FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- NON-AUTHORITATIVE ON APPLY: creates empty tables only. No grant is created here
-- (operator/authority backfill is a separate presented step), nothing is wired, and
-- the live `role === "admin" → null` super-ALLOW is UNCHANGED. G-3 behaviour intact.
--
-- ROLLBACK (manual, before cut-over):
--   DROP TABLE IF EXISTS exceptional_resource_access;
--   DROP TABLE IF EXISTS platform_operator_entitlements;
--   DROP TABLE IF EXISTS platform_admin_authorities;
-- ============================================================
