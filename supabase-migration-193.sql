-- Migration 193: Survey Studio — Study Findings + Evidence (durable human-curated layer).
--
-- The durable, human-approved research layer above Study Analysis:
--   RESULT (governed) → ANALYSIS PROPOSAL (AI, reviewable) → STUDY FINDING (curated).
-- A Study Finding is Finding -> 1..N Evidence: evidence may span multiple questions,
-- multiple Surveys, combined/side-by-side/comparison results. Prose is editorial;
-- evidence is factual and COPIED + FROZEN at Finding creation (a published conclusion
-- never silently drifts as fieldwork continues; no re-resolution at publish).
--
-- Studio-native and DECOUPLED: FKs reference studies(id) + study_analysis_proposals(id)
-- ONLY. This migration touches NEITHER research_projects/findings/finding_evidence NOR
-- survey_findings NOR any entitlement table, and creates no Report/Discover/entitlement
-- schema (publication != entitlement; the `finding` asset class is a later slice).
--
-- FOUR CHECKS baked in (per the approved audit):
--   • FK/delete: study RESTRICT · origin proposal SET NULL · evidence CASCADE
--   • idempotency: one direct-origin Finding per accepted proposal (partial UNIQUE)
--   • evidence dedupe: UNIQUE (finding_id, evidence_ref)
--   • evidence order: UNIQUE (finding_id, position)
--
-- SAFETY: additive, non-destructive, idempotent. NOT auto-applied — hand-applied per
-- the DB-ahead-of-code practice.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS study_finding_evidence;
--   DROP TABLE IF EXISTS study_findings;

CREATE TABLE IF NOT EXISTS study_findings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Durable research history: RESTRICT, never cascade a Study delete through Findings.
  study_id       uuid        NOT NULL REFERENCES studies(id) ON DELETE RESTRICT,
  headline       text        NOT NULL,
  commentary     text,
  status         text        NOT NULL DEFAULT 'draft'  CHECK (status IN ('draft','published')),
  -- The Finding does NOT depend on AI: it may originate manually or from an accepted
  -- Analysis Proposal. The accountable creator/publisher is the analyst, never the model.
  origin_type    text        NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('manual','analysis_proposal')),
  -- SET NULL: a Finding survives even if the originating proposal/run is later removed —
  -- its evidence is already copied into study_finding_evidence. Audit-only linkage.
  origin_analysis_proposal_id uuid REFERENCES study_analysis_proposals(id) ON DELETE SET NULL,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  published_by   text,
  published_at   timestamptz,
  -- origin_type and the proposal id must agree.
  CONSTRAINT study_findings_origin_chk CHECK (
    (origin_type = 'analysis_proposal' AND origin_analysis_proposal_id IS NOT NULL) OR
    (origin_type = 'manual'            AND origin_analysis_proposal_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_study_findings_study ON study_findings (study_id, status, created_at DESC);
-- One accepted proposal -> at most ONE direct-origin Finding (manual findings unrestricted).
CREATE UNIQUE INDEX IF NOT EXISTS uq_study_findings_origin_proposal
  ON study_findings (origin_analysis_proposal_id) WHERE origin_analysis_proposal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS study_finding_evidence (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Evidence is structurally part of the Finding artifact.
  finding_id        uuid        NOT NULL REFERENCES study_findings(id) ON DELETE CASCADE,
  position          integer     NOT NULL,
  evidence_ref      text        NOT NULL,           -- deterministic governed ref (audit / dedupe key)
  -- The COPIED EvidenceItem, frozen at Finding creation: study/Survey identity, canonical
  -- question key + question text at capture, option id+label, count/base/percentage,
  -- scope/comparability/resultMode, filters, caveats. Faithful re-render WITHOUT recompute.
  evidence_snapshot jsonb       NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finding_id, evidence_ref),                -- no duplicate evidence within a Finding
  UNIQUE (finding_id, position)                     -- stable editorial order (V1: fixed at creation)
);
CREATE INDEX IF NOT EXISTS idx_study_finding_evidence_finding ON study_finding_evidence (finding_id, position);

-- ── RLS: server-only (service role), deny anon — consistent with studies/analysis ──
ALTER TABLE study_findings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_finding_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anon ON study_findings;
CREATE POLICY deny_all_anon ON study_findings USING (false);
DROP POLICY IF EXISTS deny_all_anon ON study_finding_evidence;
CREATE POLICY deny_all_anon ON study_finding_evidence USING (false);

DROP TRIGGER IF EXISTS study_findings_updated_at ON study_findings;
CREATE TRIGGER study_findings_updated_at BEFORE UPDATE ON study_findings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
