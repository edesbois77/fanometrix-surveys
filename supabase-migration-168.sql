-- Migration 168 — ORG-005 IW-7: Security Audit & Mandatory-Audit Fail-Closed.
--
-- Governed by the frozen ORG-005 Architecture (Q-29 audit event requirements,
-- Q-30 audit integrity & privacy) and Programme Plan IW-7 (Concern 8). Builds the
-- durable, attributable, TAMPER-EVIDENT, access-protected, content-MINIMISED
-- security audit store. Additive / non-destructive. Idempotent.
--
-- Q-30 properties enforced HERE (not merely by convention):
--   • attributable + survives deletion of referenced objects — actor_user_id is
--     FK ON DELETE SET NULL (id nulls but the captured actor_label + row remain);
--     organisation_id is a captured value (no cascade);
--   • not silently rewritten / protected from alteration — an append-only trigger
--     RAISES on any UPDATE/DELETE (immutability, even for the service role);
--   • tamper-EVIDENT — a hash chain (content_hash + prev_hash → entry_hash) is
--     computed in a BEFORE INSERT trigger under an advisory lock, so removing,
--     reordering or altering any row breaks every subsequent entry_hash;
--   • access-protected — RLS blanket anon lockout (reads gated by Platform
--     Authorisation at the app layer, like every other domain table);
--   • minimised — `detail` is jsonb for references/meaning only; the application
--     never writes Reports/Documents/Data/request-bodies/secrets (enforced in
--     lib/authz/audit.ts).
-- F048 (RETAIN): this store is security EVIDENCE only; permission is NEVER read
-- back from it (no authz path imports the audit reader).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS security_audit_events (
  seq              bigserial   PRIMARY KEY,
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  actor_user_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  actor_label      text,                                  -- captured attribution snapshot
  organisation_id  uuid,                                  -- captured context (no cascade)
  event_type       text        NOT NULL,
  action           text        NOT NULL,
  outcome          text        NOT NULL,                  -- e.g. authorised | denied | changed
  resource_type    text,
  resource_id      uuid,
  origin           text,
  detail           jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- minimised references/meaning only
  content_hash     text        NOT NULL,
  prev_hash        text,
  entry_hash       text        NOT NULL
);

ALTER TABLE security_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON security_audit_events;
CREATE POLICY deny_all_anon ON security_audit_events USING (false);

-- Tamper-evidence: content_hash over the canonical fields, entry_hash chained to
-- the previous row. Serialized by a transaction advisory lock so the chain is
-- consistent under concurrency. The canonical form MUST match lib/authz/audit.ts.
CREATE OR REPLACE FUNCTION security_audit_chain() RETURNS trigger AS $$
DECLARE prev text; canonical text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('security_audit_events'));
  SELECT entry_hash INTO prev FROM security_audit_events ORDER BY seq DESC LIMIT 1;
  canonical := concat_ws('|',
    NEW.event_type,
    coalesce(NEW.actor_user_id::text, ''),
    coalesce(NEW.organisation_id::text, ''),
    NEW.action,
    coalesce(NEW.resource_type, ''),
    coalesce(NEW.resource_id::text, ''),
    NEW.outcome,
    coalesce(NEW.detail::text, '{}')
  );
  NEW.content_hash := encode(digest(canonical, 'sha256'), 'hex');
  NEW.prev_hash    := prev;
  NEW.entry_hash   := encode(digest(coalesce(prev, '') || NEW.content_hash, 'sha256'), 'hex');
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_audit_chain ON security_audit_events;
CREATE TRIGGER trg_security_audit_chain
  BEFORE INSERT ON security_audit_events
  FOR EACH ROW EXECUTE FUNCTION security_audit_chain();

-- Append-only immutability (Q-30 "not silently rewritten"): forbid mutation.
CREATE OR REPLACE FUNCTION security_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_events is append-only (tamper-evident); % is forbidden', TG_OP;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_audit_immutable ON security_audit_events;
CREATE TRIGGER trg_security_audit_immutable
  BEFORE UPDATE OR DELETE ON security_audit_events
  FOR EACH ROW EXECUTE FUNCTION security_audit_immutable();

CREATE INDEX IF NOT EXISTS idx_sae_org_time  ON security_audit_events (organisation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sae_actor     ON security_audit_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_sae_type_time ON security_audit_events (event_type, occurred_at DESC);

-- ============================================================
-- ROLLBACK (manual, before decommission):
--   DROP TABLE IF EXISTS security_audit_events CASCADE;
--   DROP FUNCTION IF EXISTS security_audit_chain();
--   DROP FUNCTION IF EXISTS security_audit_immutable();
-- No other table is touched; audit is never an authority source (F048), so
-- removing it cannot change any permission outcome.
-- ============================================================
