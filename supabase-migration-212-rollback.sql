-- Rollback for Migration 212. Drops the edit functions.
-- Nothing else references them; configuration simply becomes uneditable until
-- they are restored.
BEGIN;
DROP FUNCTION IF EXISTS public.fx_campaign_group_edit(uuid, timestamptz, text, jsonb, text, text, text, integer, boolean, uuid);
DROP FUNCTION IF EXISTS public.fx_campaign_group_cancel_revision(uuid, text);
COMMIT;
