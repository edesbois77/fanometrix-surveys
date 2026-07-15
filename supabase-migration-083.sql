-- Migration 083: Simulation — reserved campaign_id slug namespace
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Phase 2 (6 of 6) of the Demo Projects blueprint. campaign_id slugs
-- are deterministic, human-readable, and derived from ordinary business
-- fields (topic/brand/type/country/publisher — see lib/naming.ts) —
-- exactly the fields a simulated demo of a real client would reuse.
-- This reserves the 'sim-' prefix exclusively for simulated campaigns,
-- so a simulated campaign can never collide with, or be mistaken for,
-- a real one's identity, and a real campaign can never accidentally
-- land in the reserved namespace.
--
-- ADD CONSTRAINT validates every existing row against the check —
-- this only succeeds if no campaign_id already starts with 'sim-'.
-- Confirm that before running (see the verification checklist).

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_simulated_slug_namespace
    CHECK (is_simulated = true OR campaign_id NOT LIKE 'sim-%');

-- Rollback:
--   ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_simulated_slug_namespace;
