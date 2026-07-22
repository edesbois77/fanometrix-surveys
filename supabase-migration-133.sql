-- Migration 133 — Evidence Role (lib/evidence-role.ts)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- Fanometrix does not treat every conversation as one undifferentiated stream.
-- Evidence is collected for a PURPOSE, and each purpose has its own relevance
-- test and its own attribution rules in Analysis:
--
--   direct       evidence specifically about the client / their sponsorship
--   comparative  evidence about comparable brands, sponsors or campaigns
--   strategic    wider evidence about the market, audience or behaviour
--
-- Two columns, because the role must both CONFIGURE collection and TRAVEL WITH
-- THE EVIDENCE into synthesis, so Analysis always knows what kind of evidence it
-- is reasoning from and never attributes a competitor's conversation to the
-- client.
--
--   social_searches.evidence_role  the purpose this search collects for
--   social_mentions.evidence_role  stamped at collection, carried into Analysis
--
-- Defaults to 'direct', the STRICTEST test, so an unconfigured search can never
-- silently admit competitor or market chatter as evidence about the client.
-- Existing rows are backfilled to 'direct', which matches how they were judged.

alter table social_searches
  add column if not exists evidence_role text not null default 'direct';

alter table social_mentions
  add column if not exists evidence_role text not null default 'direct';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_searches_evidence_role_check') then
    alter table social_searches add constraint social_searches_evidence_role_check
      check (evidence_role in ('direct','comparative','strategic'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'social_mentions_evidence_role_check') then
    alter table social_mentions add constraint social_mentions_evidence_role_check
      check (evidence_role in ('direct','comparative','strategic'));
  end if;
end $$;

create index if not exists idx_social_mentions_evidence_role on social_mentions (evidence_role);

comment on column social_searches.evidence_role is
  'Why this search collects: direct | comparative | strategic. Drives the relevance test applied at classification. See lib/evidence-role.ts.';
comment on column social_mentions.evidence_role is
  'The role of the search that collected this evidence, stamped so it travels into Analysis and governs how the finding may attribute it.';
