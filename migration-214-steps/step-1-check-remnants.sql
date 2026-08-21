select
  c.relname                      as index_name,
  x.indisvalid                   as is_valid,
  x.indisready                   as is_ready,
  pg_size_pretty(pg_relation_size(c.oid)) as size
from pg_index x
join pg_class c on c.oid = x.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (c.relname in ('idx_survey_events_revision_render',
                     'idx_response_answers_revision',
                     'idx_responses_revision')
       or not x.indisvalid
       or not x.indisready)
order by c.relname;
