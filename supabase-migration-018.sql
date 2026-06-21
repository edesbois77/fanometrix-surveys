-- Migration 018: One Campaign = One Publisher
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- Changes campaigns.publishers (text[]) to campaigns.publisher (text).
-- A campaign now belongs to exactly one publisher.
-- Campaign Groups remain the orchestration layer for multi-publisher scenarios.
--
-- Migration strategy:
--   For campaigns with one publisher  → preserve it as the singular value.
--   For campaigns with zero publishers → publisher = NULL.
--   For campaigns with multiple publishers → take the first element.
--     (These will need manual duplication into separate per-publisher campaigns.)

-- 1. Add the new singular column
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS publisher text;

-- 2. Populate from the first element of the existing array
UPDATE campaigns
SET publisher = publishers[1]
WHERE array_length(publishers, 1) >= 1;

-- 3. Drop the old array column
ALTER TABLE campaigns DROP COLUMN IF EXISTS publishers;
