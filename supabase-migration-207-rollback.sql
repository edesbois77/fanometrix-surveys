-- Rollback for Migration 207 (campaign preview grants)
--
-- 207 was purely additive: one new table and its policy/grants. Dropping it
-- removes every grant, so any shared ad-ops review link stops working
-- immediately. That is the intended effect of a rollback here.
--
-- No other table, column, policy or function was touched by 207, so nothing else
-- needs restoring.

BEGIN;
DROP TABLE IF EXISTS public.campaign_preview_grants;
COMMIT;
