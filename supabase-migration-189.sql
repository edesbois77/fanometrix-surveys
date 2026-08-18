-- Migration 189: Survey Studio — Request clarification metadata.
--
-- The Manage → Requests "Needs clarification" action now emails the requester a
-- clarification message and only then moves the Request to 'needs_clarification'.
-- That message needs durable persistence with a lightweight audit trail. There is
-- no correct existing home for it: additional_context belongs to the original
-- research brief, and reviewed_at/reviewed_by carry no message. So this adds THREE
-- nullable columns to research_requests holding the LATEST clarification only —
-- V1 deliberately has NO clarification history/thread table.
--
--   • clarification_message      — the admin's message emailed to the requester.
--   • clarification_requested_at — when it was sent.
--   • clarification_requested_by — the admin work_email who sent it (identity
--                                   model already used by reviewed_by).
--
-- SAFETY: purely additive and non-destructive.
--   • New nullable columns only; every existing row is unaffected (all NULL).
--   • No backfill, no data transformation, no change to migration 188.
--   • Idempotent (ADD COLUMN IF NOT EXISTS) — safe to run more than once.
--   • NOT auto-applied — hand-applied per the DB-ahead-of-code practice.
--
-- ROLLBACK:
--   ALTER TABLE research_requests
--     DROP COLUMN IF EXISTS clarification_message,
--     DROP COLUMN IF EXISTS clarification_requested_at,
--     DROP COLUMN IF EXISTS clarification_requested_by;

ALTER TABLE research_requests
  ADD COLUMN IF NOT EXISTS clarification_message      text,
  ADD COLUMN IF NOT EXISTS clarification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS clarification_requested_by text;
