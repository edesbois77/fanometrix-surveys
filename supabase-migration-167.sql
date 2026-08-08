-- Migration 167 — ORG-005 IW-4 (F033/G5): governed org-ID policy input for
-- restricted-insight access, replacing the org-NAME string match.
--
-- Governed by the frozen ORG-005 Architecture (Q-12 Policy Inputs: source-domain
-- fact → explicit governed policy → consequence) and Programme Plan IW-4. Closes
-- the EVOLVE disposition on F033 and addresses residual gap G5 (org-name
-- collisions). Strangler / ADDITIVE / NON-DESTRUCTIVE:
--   • adds insights.allowed_organisation_ids (uuid[]) — the id-anchored governed
--     policy input; the application prefers it authoritatively when present and
--     falls back to the legacy tag name-match only while it is NULL;
--   • backfills it, for restricted insights, from the CURRENT tag→org name match
--     so access is preserved EXACTLY (parity), INCLUDING existing name collisions
--     (a tag matching >1 organisation populates ALL of them — the migration does
--     NOT guess which was intended; that correction is the review in §2 below).
--
-- Idempotent (IF NOT EXISTS / conditional). The legacy `tags` column and the
-- name-match fallback are RETAINED — decommission is IW-11. No column dropped.

-- 1. The governed policy-input column (id-anchored).
ALTER TABLE insights
  ADD COLUMN IF NOT EXISTS allowed_organisation_ids uuid[];

-- 2. Parity-preserving backfill for RESTRICTED insights only. Populates the id
--    list from the orgs whose lower(name) equals a tag. Collisions are preserved
--    (all matching org ids included) so NO current access changes on cut-over.
UPDATE insights i
  SET allowed_organisation_ids = sub.ids
  FROM (
    SELECT i2.id, array_agg(DISTINCT o.id) AS ids
    FROM insights i2
    JOIN organisations o
      ON lower(o.name) = ANY (SELECT lower(t) FROM unnest(i2.tags) AS t)
    WHERE i2.visibility = 'restricted'
    GROUP BY i2.id
  ) sub
  WHERE i.id = sub.id
    AND i.allowed_organisation_ids IS NULL;

-- ============================================================
-- 2b. COLLISION REVIEW (business judgement — NOT performed by this migration).
-- Run read-only to identify restricted insights whose tag resolved to MORE THAN
-- ONE organisation (the G5 collision). These are backfilled with every matching
-- id (parity), but the intended single grant must be corrected by review — the
-- same disposition as the F040 existing-data item. DO NOT auto-resolve.
--   SELECT i.id, i.slug, t AS tag, array_agg(o.id) AS colliding_org_ids
--   FROM insights i, unnest(i.tags) t
--   JOIN organisations o ON lower(o.name) = lower(t)
--   WHERE i.visibility = 'restricted'
--   GROUP BY i.id, i.slug, t
--   HAVING count(o.id) > 1;
-- ============================================================

-- ============================================================
-- ROLLBACK (manual, before decommission):
--   ALTER TABLE insights DROP COLUMN IF EXISTS allowed_organisation_ids;
-- The tags column and the name-match fallback are untouched, so rollback restores
-- the prior behaviour exactly. Do NOT drop insights.tags here (IW-11).
-- ============================================================
