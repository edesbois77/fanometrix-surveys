-- Migration 129 — Overview "Our Understanding" (docs/overview-page.md)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- The Overview page is the commissioning stage: it analyses the client brief and
-- reflects back Fanometrix's understanding of the problem. That understanding is
-- LIVING ENGAGEMENT CONTEXT on the Research Project (not a versioned Research
-- Design — see docs/research-project-domain.md §4), so it lives as a jsonb column
-- on the project.
--
--   understanding (jsonb): {
--     reflection, business_challenge{value,provenance,source}, objectives{...},
--     research_question{...proposed}, target_audience{...}, markets{...},
--     deliverables{...}, constraints{...}, stakeholders{...},
--     tensions[{kind,message}], source_label, generated_at, model,
--     confirmed, confirmed_at }
--   provenance ∈ stated | inferred | proposed. The research_question is PROPOSED
--   here; it is owned/approved later by the Research Design.
--
-- Additive & nullable: existing projects keep working (understanding = NULL until
-- a brief is analysed). Readable through the existing GET (select *) and writable
-- via a dedicated route.

ALTER TABLE research_projects
  ADD COLUMN IF NOT EXISTS understanding jsonb;

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   ALTER TABLE research_projects DROP COLUMN IF EXISTS understanding;
