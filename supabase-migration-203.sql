-- Migration 203: Study Findings — Research Intelligence provenance (Stage C2).
--
-- Lets a human-accepted Report Finding record that it ORIGINATED from a verified Research
-- Intelligence insight, WITHOUT changing how findings are reviewed or published. Research
-- Intelligence still becomes a Report finding ONLY through explicit human acceptance (a new
-- draft finding an admin then publishes) — this migration adds the provenance a candidate
-- carries, nothing more. The composer/verifier and existing origin semantics are unchanged.
--
-- WHAT: a third origin_type 'research_intelligence' + the provenance an accepted RI finding
-- needs (which artefact/insight it came from, so it is auditable and staleness-checkable).
--
-- SAFETY: additive, idempotent, NON-DESTRUCTIVE. Every existing study_findings row keeps its
-- origin_type ('manual' | 'analysis_proposal') and all data; the new columns are nullable and
-- populated ONLY for research_intelligence-origin findings. NOT auto-applied — hand-applied
-- per the DB-ahead-of-code practice. NOT applied anywhere by this change.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS study_findings_ri_identity_uidx;
--   ALTER TABLE study_findings DROP COLUMN IF EXISTS ri_source_kind, DROP COLUMN IF EXISTS ri_source_id,
--     DROP COLUMN IF EXISTS ri_evidence_fingerprint, DROP COLUMN IF EXISTS ri_insight_id, DROP COLUMN IF EXISTS ri_authority;
--   -- (the widened CHECKs are supersets and harmless to leave; to fully revert, re-add the 2-value forms)

-- 1) Widen origin_type to admit 'research_intelligence' (strict superset — no existing row invalidated).
ALTER TABLE study_findings DROP CONSTRAINT IF EXISTS study_findings_origin_type_check;
ALTER TABLE study_findings ADD CONSTRAINT study_findings_origin_type_check
  CHECK (origin_type IN ('manual','analysis_proposal','research_intelligence'));

-- 2) Extend the origin↔proposal coupling: an RI finding carries NO analysis proposal id
--    (it comes from a reasoner artefact, not a study_analysis_proposal). Existing 'manual'
--    and 'analysis_proposal' rules are preserved verbatim.
ALTER TABLE study_findings DROP CONSTRAINT IF EXISTS study_findings_origin_chk;
ALTER TABLE study_findings ADD CONSTRAINT study_findings_origin_chk CHECK (
  (origin_type = 'analysis_proposal'   AND origin_analysis_proposal_id IS NOT NULL) OR
  (origin_type = 'manual'              AND origin_analysis_proposal_id IS NULL) OR
  (origin_type = 'research_intelligence' AND origin_analysis_proposal_id IS NULL)
);

-- 3) Research Intelligence provenance (nullable; set only for research_intelligence findings).
--    Enough to answer "what claim, from which source artefact/insight, how strong" and to
--    detect staleness (evidence_fingerprint) — NO chain-of-thought, NO evidence duplication
--    (the frozen governed evidence still lives in study_finding_evidence).
ALTER TABLE study_findings ADD COLUMN IF NOT EXISTS ri_source_kind         text;   -- 'survey' | 'study'
ALTER TABLE study_findings ADD COLUMN IF NOT EXISTS ri_source_id           uuid;   -- survey_id / study_id
ALTER TABLE study_findings ADD COLUMN IF NOT EXISTS ri_evidence_fingerprint text;  -- the artefact's evidence_hash at acceptance
ALTER TABLE study_findings ADD COLUMN IF NOT EXISTS ri_insight_id          text;   -- the insight id within that artefact
ALTER TABLE study_findings ADD COLUMN IF NOT EXISTS ri_authority           text;   -- measured|synthesis|interpretation|hypothesis

-- 4) At most one finding per accepted RI insight identity (idempotent accept; a double
--    "Accept" converges rather than duplicating). Scoped to RI-origin rows only, so manual
--    / analysis_proposal findings are unaffected and NULLs never collide.
CREATE UNIQUE INDEX IF NOT EXISTS study_findings_ri_identity_uidx
  ON study_findings (study_id, ri_source_kind, ri_source_id, ri_evidence_fingerprint, ri_insight_id)
  WHERE origin_type = 'research_intelligence';

NOTIFY pgrst, 'reload schema';
