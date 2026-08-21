create index concurrently if not exists idx_response_answers_revision
  on public.response_answers (configuration_revision_id, campaign_id, question_index)
  where configuration_revision_id is not null;
