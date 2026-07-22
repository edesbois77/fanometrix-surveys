-- Migration 132 — the Brief artefact (docs/commissioning-journey.md)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- A project produces THREE distinct artefacts, and they must not be merged:
--   Brief            what the client actually asked for (factual synthesis)
--   Engagement       what we believe the real problem is (engagement_context, mig 131)
--   Research Design   how we propose to answer it (Planning)
--
-- The Brief is the only purely FACTUAL artefact: no opinion, it simply proves
-- Fanometrix has read the supplied material. It supports the Engagement rather than
-- replacing it, and surfaces (collapsed) on commissioning and the Overview.
--
--   brief (jsonb): {
--     client, commissioned_by, campaign, geography, audience,
--     objectives[], deliverables[], constraints[], summary,
--     generated_at, model }
--
-- Additive & nullable: existing projects keep working (brief = NULL until material
-- is recorded). Readable through the existing GET (select *), writable on insert.

alter table research_projects
  add column if not exists brief jsonb;

comment on column research_projects.brief is
  'The factual Brief: a neutral synthesis of the material the client supplied (what they asked for), distinct from the interpretive engagement_context. See docs/commissioning-journey.md.';
