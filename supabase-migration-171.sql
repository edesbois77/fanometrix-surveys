-- Migration 171 — ORG-005 P-1/§38 (W1): governed resource identity + Resource Scope.
--
-- Governed by the APPROVED/CLOSED §38 Resource & Scope Product Design (P-1 v1.0,
-- §9-A…§9-E) and the accepted IW-6 model (migration 170). ADDITIVE / NON-DESTRUCTIVE
-- / IDEMPOTENT. Introduces ONLY concrete resource identity + scope membership so the
-- already-accepted Organisation Resource Entitlement / User Resource Authorisation
-- model (migration 170) can be resolved. It is NON-AUTHORITATIVE: no enforcement is
-- switched on by this migration; the resolution wiring runs in SHADOW/dual-run and
-- current production authority is unchanged until a separately-authorised G-3.
--
-- Preserves: four classes only (study|finding|report|data); registry is IDENTITY
-- ONLY (never an authorisation surface); coverage-not-inheritance (membership is an
-- explicit fact, never a hierarchy); asset independence (a scope is single-class).
-- Access control stays at the app layer (RLS = blanket anon lockout).

-- (A) Governed resource identity registry.
--   Study/Finding are addressed by their OWN uuid PKs and are DELIBERATELY NOT
--   registered here (no duplicate id space). Only Report and Data need a governed
--   uuid: report natural_key = ReportConfig.access.id (§9-A: Report-FRAMEWORK
--   instances only — partner/social reports are NOT admitted); data natural_key =
--   research_project_id::text (§9-B: Data identity is per Study).
CREATE TABLE IF NOT EXISTS governed_resources (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_class text        NOT NULL CHECK (resource_class IN ('report','data')),
  natural_key    text        NOT NULL,
  status         text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_class, natural_key)   -- stable + idempotent identity (no re-mint)
);

ALTER TABLE governed_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON governed_resources;
CREATE POLICY deny_all_anon ON governed_resources USING (false);

-- (B) Resource Scope identity — a single-class, explicitly-membered coverage set.
CREATE TABLE IF NOT EXISTS resource_scopes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_class  text        NOT NULL CHECK (resource_class IN ('study','finding','report','data')),
  organisation_id uuid        REFERENCES organisations(id) ON DELETE CASCADE,  -- nullable = platform-level
  name            text        NOT NULL,
  status          text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resource_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON resource_scopes;
CREATE POLICY deny_all_anon ON resource_scopes USING (false);

-- (C) Explicit scope membership — coverage-not-inheritance (Q-18). One row per
--   member. resource_id = the study/finding PK, or governed_resources.id for
--   report/data. Member class MUST equal the scope's class (asset independence,
--   Q-17) — enforced in the membership-write path (single-class scope) since a
--   cross-table/derived CHECK is not expressible here.
CREATE TABLE IF NOT EXISTS resource_scope_members (
  scope_id        uuid        NOT NULL REFERENCES resource_scopes(id) ON DELETE CASCADE,
  resource_class  text        NOT NULL CHECK (resource_class IN ('study','finding','report','data')),
  resource_id     uuid        NOT NULL,
  added_by        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_rsm_lookup ON resource_scope_members (resource_class, resource_id);

ALTER TABLE resource_scope_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON resource_scope_members;
CREATE POLICY deny_all_anon ON resource_scope_members USING (false);

-- Shared updated_at triggers (set_updated_at from migration 008).
DROP TRIGGER IF EXISTS gr_updated_at ON governed_resources;
CREATE TRIGGER gr_updated_at BEFORE UPDATE ON governed_resources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS rs_updated_at ON resource_scopes;
CREATE TRIGGER rs_updated_at BEFORE UPDATE ON resource_scopes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- NON-AUTHORITATIVE ON APPLY: creates empty tables only. No backfill here
-- (W2/W3 backfill = separate, presented steps), no enforcement, no change to
-- migration-170 tables or any existing behaviour. migration 170 resource_id now
-- resolves as: study/finding PK directly; report/data -> governed_resources.id.
--
-- ROLLBACK (manual, before any decommission):
--   DROP TABLE IF EXISTS resource_scope_members;
--   DROP TABLE IF EXISTS resource_scopes;
--   DROP TABLE IF EXISTS governed_resources;
-- ============================================================
