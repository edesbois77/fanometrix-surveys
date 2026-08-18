-- Migration 186: Campaign target behaviour (continue vs stop)
-- Purpose: Survey Studio Create -> Campaigns needs "target mode" as a persisted
--          Campaign property (continue collecting vs stop collecting at target).
-- Status: ADDITIVE + BEHAVIOUR-PRESERVING. PROPOSAL ONLY. Do NOT auto-apply.
--
-- Why the backfill matters (historical/live compatibility):
--   Today lib/campaign-status.ts auto-closes ANY campaign once
--   response_count >= target_responses, regardless of intent. Introducing
--   target_mode with a naive default of 'continue' would silently FLIP every
--   existing targeted campaign from stop-at-target to collect-past-target.
--   The backfill below preserves current semantics exactly:
--     - existing rows WITH a target  -> 'stop'      (unchanged behaviour)
--     - existing rows WITHOUT a target -> 'continue' (no ceiling either way)
--   Verified 2026-08-12: 0 currently-LIVE campaigns have a target, so the live
--   blast radius of the accompanying campaign-status.ts change is zero; the
--   backfill protects the 23 non-live targeted rows.

BEGIN;

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS target_mode text;

UPDATE campaigns
   SET target_mode = CASE
         WHEN target_responses IS NOT NULL THEN 'stop'
         ELSE 'continue'
       END
 WHERE target_mode IS NULL;

ALTER TABLE campaigns
  ALTER COLUMN target_mode SET DEFAULT 'continue';

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_target_mode_chk
  CHECK (target_mode IN ('continue', 'stop'));

-- 'stop' is only meaningful with a target to stop at. Safe given the backfill
-- (no 'stop' row can exist without a target). Enforced in-app as well.
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_stop_requires_target
  CHECK (target_mode <> 'stop' OR target_responses IS NOT NULL);

COMMIT;

-- Verify (run after apply):
--   SELECT target_mode, count(*), count(target_responses) AS with_target
--     FROM campaigns WHERE deleted_at IS NULL GROUP BY target_mode;
--   Expect: no 'stop' row with with_target < count; no NULL target_mode.
