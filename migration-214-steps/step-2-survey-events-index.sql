create index concurrently if not exists idx_survey_events_revision_render
  on public.survey_events (configuration_revision_id, created_at)
  where configuration_revision_id is not null and event_type = 'SURVEY_RENDER';
