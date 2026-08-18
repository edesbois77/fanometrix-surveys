-- Migration 180: Survey Studio Create Phase 2 — Creative rules model + draft's
-- selected Creative.
--
-- Two additive nullable columns + a data-only seed. SAFETY: non-destructive,
-- idempotent (IF NOT EXISTS + WHERE rules IS NULL), no backfill of existing
-- surveys, no foreign keys, no behaviour change.
--
-- 1) creative_designs.rules jsonb — the per-Creative allowable-structure model
--    (Survey Studio Create). Separate from the Stack-only `config` jsonb. V1
--    fields ONLY: introSupported, minQuestions, maxQuestions, thankYouSupported,
--    maxOptions, maxQChars, maxOptChars. Null ⇒ code falls back to the global
--    SURVEY_LIMITS, so a Creative without rules behaves exactly as today.
--
-- 2) surveys.creative_design text — the Creative a Survey Studio Create DRAFT has
--    selected. Plain text slug into creative_designs.slug, matching the EXISTING
--    convention (campaigns.creative_design / research_projects.creative_design /
--    research_project_evidence.creative_design are all plain-text slugs — NOT a
--    new id/reference model, and deliberately NOT stored inside surveys.about).
--    Nullable; existing surveys are unaffected. How a Campaign later inherits
--    this selection is Phase 4 (Campaigns/Deploy) — NOT changed here.

ALTER TABLE creative_designs
  ADD COLUMN IF NOT EXISTS rules jsonb;

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS creative_design text;

-- Data-only seed: every existing Creative gets rules that mirror TODAY'S
-- behaviour EXACTLY. Derived from `layout` so it covers every built-in (and any
-- existing custom) row without enumerating slugs. `introSupported` is true only
-- for the layouts that already show an intro frame (invitation / stack). 4–5
-- question behaviour is NOT enabled here — maxQuestions stays 3 (Phase 6).
-- `WHERE rules IS NULL` keeps it idempotent and never overwrites edited rules.
UPDATE creative_designs
SET rules = jsonb_build_object(
  'introSupported',    (layout IN ('invitation', 'stack')),
  'minQuestions',      1,
  'maxQuestions',      3,
  'thankYouSupported', true,
  'maxOptions',        4,
  'maxQChars',         70,
  'maxOptChars',       32
)
WHERE rules IS NULL;
