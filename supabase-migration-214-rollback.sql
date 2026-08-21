-- Rollback for Migration 214. Indexes hold no data, so this is always safe.
-- DROP INDEX CONCURRENTLY also cannot run in a transaction block.
--
-- Rolling this back does not lose anything, but Results queries revert to the
-- 16.5-second plan measured in 214's header. Prefer disabling the feature.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_responses_revision;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_response_answers_revision;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_survey_events_revision_render;
