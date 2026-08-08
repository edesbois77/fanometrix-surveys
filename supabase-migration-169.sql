-- Migration 169 — ORG-005 IW-9: Session/Token Lifecycle & Currency.
--
-- Governed by Q-31/Q-33 and Programme Plan IW-9 (Concern 10). Additive /
-- non-destructive / idempotent. Introduces a per-user "token version" (session
-- epoch): the identity JWT carries the version at issue; requireUser compares it
-- to this current value. Incrementing it revokes every session issued before the
-- bump — the mechanism for session/token revocation (F058) and for enforcing a
-- forced-password-change on live sessions (F059), while RETAINING F003/F057/F060/
-- F061 (live authority, immediate dependency-scoped revocation, anti-resurrection,
-- no uncontrolled cascade). It is NOT an authority claim (F001 identity-only JWT).
--
-- Default 0 so every existing session (which carries no version, treated as
-- "current") remains valid until its natural expiry — no forced mass logout on
-- application. A bump thereafter revokes that user's live sessions.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- ============================================================
-- ROLLBACK (manual, before decommission):
--   ALTER TABLE users DROP COLUMN IF EXISTS token_version;
-- No other table is touched. token_version is a session-currency epoch, never an
-- authorisation source, so rollback cannot change any permission outcome.
-- ============================================================
