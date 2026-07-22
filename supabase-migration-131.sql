-- Migration 131 — Engagement Context (docs/commissioning-journey.md, engagement-types.md)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- The commissioning flow now has THREE artefacts, not two, mirroring how a
-- consultant actually begins:
--
--   Situation           the raw reality the user hands over (assembled material)
--   Engagement Context  Fanometrix's STRUCTURED read of that reality, built in the
--                       Orient stage BEFORE any document is interpreted. It is the
--                       standing LENS through which every later stage is read.
--   Understanding       Fanometrix's first OPINION, formed through that lens.
--
-- Engagement Context is its own artefact (not folded into understanding) precisely
-- so it can be corrected once and have everything downstream re-interpret through
-- the fix. The Adidas failure was an ORIENTATION error (US market assumed where
-- Europe was meant); making the lens a first-class, correctable object is what
-- prevents that class of error.
--
--   engagement_context (jsonb): {
--     orientation,                     -- the spoken one/two-sentence orientation
--     engagement_type, organisation, commissioner, decision,
--     commercial_objective, market, intended_audience,
--     available_materials[{label,type,note}],
--     missing_information[...],
--     confidence,                      -- confidence in the CONTEXT (not the read)
--     generated_at, model }
--
-- Additive & nullable: existing projects keep working (engagement_context = NULL
-- until a situation is oriented). Readable through the existing GET (select *) and
-- writable on insert alongside understanding.

alter table research_projects
  add column if not exists engagement_context jsonb;

comment on column research_projects.engagement_context is
  'Fanometrix''s structured read of the situation (the Orient stage): the standing lens through which Understanding and every later stage is interpreted. See docs/commissioning-journey.md.';
