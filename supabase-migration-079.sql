-- Migration 079: Simulation — is_simulated on research_summaries
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 2 (4 of 6) of the Demo Projects blueprint. Every AI-generated
-- summary or report (Survey Intelligence, Conversation Intelligence,
-- the Executive Report — all rows in this one generic table) now
-- carries its own provenance flag, set server-side by the analyst from
-- the source project/evidence it was generated from — never accepted
-- from a request body (blueprint §04/§13).
--
-- evidence_simulation_id is intentionally a bare uuid here, with no
-- REFERENCES constraint yet: the evidence_simulations table it will
-- point at doesn't exist until Phase 5 (migration 081). The FK gets
-- added there once the target table exists — nothing writes to this
-- column before Phase 5 in any case.

ALTER TABLE research_summaries
  ADD COLUMN IF NOT EXISTS is_simulated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_simulation_id uuid;

-- Rollback:
--   ALTER TABLE research_summaries DROP COLUMN IF EXISTS is_simulated,
--     DROP COLUMN IF EXISTS evidence_simulation_id;
