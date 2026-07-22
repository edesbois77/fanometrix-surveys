-- Migration 134 — the Research Design (lib/research-design.ts, docs/planning-page.md §9b)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- Fanometrix decides WHAT EVIDENCE IS WORTH COLLECTING before it collects
-- anything. The Research Design is the artefact that makes that decision, and it
-- is owned by the project, not generated on the fly per search:
--
--   Commission → Research Design → Evidence Strategy → Searches → Collection → Analysis
--
-- SOURCE-AGNOSTIC by construction. Conversation Intelligence is the only consumer
-- today, but a requirement owns METHOD RECOMMENDATIONS (conversation, survey,
-- document, news, trends) rather than owning searches, so survey studies and
-- document research slot in later without reshaping the artefact.
--
--   research_design (jsonb): {
--     research_question, research_objective, commercial_context,
--     evidence_strategy,
--     requirements[{ role, requirement, why_it_matters, aspect,
--                    information_needs[], expected_availability,
--                    availability_note, comparators[{name,why}],
--                    methods[{ method, fit, rationale, conversation_searches[] }] }],
--     not_worth_attempting[],
--     status, approved_at, approved_by, generated_at, model }
--
--   status ∈ draft | approved. The user approves the STRATEGY, never the search
--   terms. Approval is the gate that permits searches to be generated.
--
-- Additive & nullable, matching how understanding / engagement_context / brief
-- are stored (migrations 129 / 131 / 132). Existing projects keep working with
-- research_design = NULL until a design is generated.

alter table research_projects
  add column if not exists research_design jsonb;

comment on column research_projects.research_design is
  'The project''s Research Design: what evidence is worth collecting, in which Evidence Role, by which method, and whether it plausibly exists. Source-agnostic; Conversation Intelligence consumes it today. See lib/research-design.ts.';
