-- Migration 176 — ORG-006 WP-02 / IS-02: Social Listening Organisation Context
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Adds the operating-Organisation scope to Social Listening searches. `social_searches`
-- is the ownership root; dependent Social Listening records (social_keywords,
-- social_mentions, social_reports, collection_runs, evidence_observations,
-- research_summaries) inherit scope through search_id and get NO Organisation column
-- of their own.
--
-- Governed decisions (ORG-006 WP-02 authorisation, evidence determination C):
--   • NULLABLE organisation_id — NOT NULL is deferred and NOT part of WP-02.
--   • ON DELETE RESTRICT — an Organisation with Social Listening searches is protected.
--   • NO backfill — existing rows keep organisation_id = NULL (unknown historical
--     operating Organisation; legacy rows generally lack deterministic provenance).
--     NULL is NOT a global/shared scope: the application excludes NULL rows from every
--     ordinary Organisation-scoped Social Listening operation.
--   • New ordinary real searches are stamped with the creator's Current Organisation
--     by the application (POST /api/social/searches), not by this migration.
--
-- Uses the standard organisations(id) uuid key and the *_org_id index convention.

ALTER TABLE social_searches
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_social_searches_organisation_id
  ON social_searches (organisation_id);

NOTIFY pgrst, 'reload schema';

-- ── Rollback ────────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS idx_social_searches_organisation_id;
--   ALTER TABLE social_searches DROP COLUMN IF EXISTS organisation_id;
--   (No data was written by this migration; existing rows are unaffected.)
