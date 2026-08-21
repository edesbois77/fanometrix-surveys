create index concurrently if not exists idx_responses_revision
  on public.responses (configuration_revision_id)
  where configuration_revision_id is not null;
