-- Migration 060: Repoint creative_designs.publisher_id to organisations
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- creative_designs.publisher_id (supabase-migration-048.sql) is a FK to the
-- old publishers registry table, the last remaining reference to it. The
-- "Publisher" theme picker in Creative Designs (app/creative-lab/designs)
-- was already switched to source its options from /api/organisations, so
-- new saves have been submitting an organisation id into a column FK'd to
-- publishers — that only works by accident (or fails outright) since the
-- two tables use different generated ids. This migration adds the correct
-- publisher_org_id column, backfills it from the existing publisher_id by
-- matching publisher/organisation name, then drops the old column.
--
-- Must run BEFORE migration 061 (drops the publishers table itself).

ALTER TABLE creative_designs
  ADD COLUMN IF NOT EXISTS publisher_org_id uuid REFERENCES organisations(id) ON DELETE SET NULL;

UPDATE creative_designs cd
SET publisher_org_id = o.id
FROM publishers p
JOIN organisations o ON LOWER(o.name) = LOWER(p.name) AND o.type = 'publisher'
WHERE cd.publisher_id = p.id
  AND cd.publisher_org_id IS NULL;

-- Drop the old theme/publisher_id CHECK before dropping the column it references
-- (the table-level, unnamed CHECK from migration 048 — Postgres auto-named it
-- creative_designs_check; the separate theme IN (...) column check is untouched).
ALTER TABLE creative_designs DROP CONSTRAINT IF EXISTS creative_designs_check;

ALTER TABLE creative_designs DROP COLUMN IF EXISTS publisher_id;

ALTER TABLE creative_designs
  ADD CONSTRAINT creative_designs_check CHECK ((theme = 'publisher') = (publisher_org_id IS NOT NULL));

-- Rollback:
--   ALTER TABLE creative_designs DROP CONSTRAINT IF EXISTS creative_designs_check;
--   ALTER TABLE creative_designs ADD COLUMN publisher_id uuid REFERENCES publishers(id) ON DELETE SET NULL;
--   UPDATE creative_designs cd SET publisher_id = p.id FROM organisations o JOIN publishers p ON LOWER(p.name) = LOWER(o.name) WHERE cd.publisher_org_id = o.id;
--   ALTER TABLE creative_designs DROP COLUMN publisher_org_id;
--   ALTER TABLE creative_designs ADD CONSTRAINT creative_designs_check CHECK ((theme = 'publisher') = (publisher_id IS NOT NULL));
