-- Migration 143: findings, finding_evidence, finding_revisions
-- Run in: supabase.com → your project → SQL Editor → New query → Run
--
-- The Finding becomes a first-class object (docs/intelligence-model.md §4
-- Layer 3). Until now intelligence lived as prose inside a jsonb blob on
-- research_summaries, where a finding was an array position: it could not be
-- approved, related, superseded, or cited by anything downstream, and a note
-- attached to one had to be keyed to its wording. That shape is what the Phase 2
-- audit found and what these tables replace.
--
-- WHAT LIVES HERE AND WHAT DOES NOT. These tables store claims and their
-- grounds. They compute nothing. Every derived value written here
-- (confidence, evidence strength, independence) is a pure function of the
-- citations in finding_evidence and can be regenerated from them at any time
-- (Principle 18). It is stored so history stays readable, never so a judgement
-- becomes unrepeatable.
--
-- WHY EVERY PROPOSITION IS A ROW, not just the chosen one. Formation proposes
-- rival readings so the choice between them can be inspected and reopened
-- (docs/intelligence-model.md §5). A rival kept as jsonb on the winner cannot be
-- promoted, cited or adjudicated. So every proposition from a run is a finding
-- with `rank`: rank 1 is the candidate, rank 2+ are the rivals it beat, and an
-- analyst promoting a rival is an ordinary approve.
--
-- IDENTITY OF NEEDS AND REQUIREMENTS. need_id and requirement_key are text, not
-- foreign keys, because Information Needs and Requirements live inside the
-- approved Research Design's jsonb today (lib/information-needs.ts). Both ids are
-- stable and deterministic, so they will become foreign keys unchanged when
-- needs get a table of their own.

-- ── findings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS findings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  research_project_id   uuid        NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,

  -- What it answers. A finding is anchored to exactly ONE requirement, so
  -- coverage is unambiguous and accountability is not diffuse.
  requirement_key       text        NOT NULL,
  requirement_text      text        NOT NULL,
  need_id               text        NOT NULL,
  need_text             text        NOT NULL,
  aspect                text,

  -- The claim.
  statement             text        NOT NULL,
  assertion_type        text        NOT NULL
                        CHECK (assertion_type IN ('descriptive','comparative','magnitude','temporal','causal','predictive','absence')),
  -- Boundary conditions. An unbounded claim reads as universal, which is nearly
  -- always false, so this is written at formation and never left to be inferred.
  scope                 text,
  -- Declared at creation because it cannot be retrofitted: a claim recorded
  -- without its perishability can never be aged correctly afterwards.
  temporal_validity     text        NOT NULL DEFAULT 'point_in_time'
                        CHECK (temporal_validity IN ('structural','periodic','point_in_time')),
  -- Why these grounds support this claim. Distinct from the statement and from
  -- the evidence: if it can be deleted without loss, the claim was not argued.
  warrant               text,
  reading               text,
  is_null               boolean     NOT NULL DEFAULT false,

  -- Derived assessment. Queryable levels as columns; the breakdown as jsonb.
  confidence_level      text        CHECK (confidence_level IN ('High','Medium','Low')),
  evidence_strength     text        CHECK (evidence_strength IN ('strong','moderate','limited')),
  assessment            jsonb       NOT NULL DEFAULT '{}',

  -- An analyst may override the derived grade, VISIBLY and with a reason. The
  -- derived value is never replaced, so the two can always be compared.
  override_confidence   text        CHECK (override_confidence IN ('High','Medium','Low')),
  override_reason       text,

  -- Disconfirmation. `disconfirmed` records that the challenge RAN, which is a
  -- different fact from whether it found anything, and the assessment layer
  -- grades those differently.
  disconfirmed          boolean     NOT NULL DEFAULT false,
  disconfirmation       jsonb       NOT NULL DEFAULT '{}',

  -- Which reading this was, among the rivals proposed for the same need.
  rank                  int         NOT NULL DEFAULT 1,

  -- Lifecycle. Approval is a research judgement; publication is a commercial
  -- one, and they are deliberately separate acts.
  status                text        NOT NULL DEFAULT 'candidate'
                        CHECK (status IN ('candidate','in_review','approved','rejected','superseded')),
  published             boolean     NOT NULL DEFAULT false,

  -- Accountability. A person approves every claim the organisation makes.
  authored_by           text        NOT NULL DEFAULT 'engine',
  reviewed_by           text,
  reviewed_at           timestamptz,
  published_at          timestamptz,
  reject_reason         text,

  -- Lineage. Nothing is deleted; claims are superseded, and anything that cited
  -- a version keeps citing that version.
  version               int         NOT NULL DEFAULT 1,
  supersedes_id         uuid        REFERENCES findings(id) ON DELETE SET NULL,
  split_from_id         uuid        REFERENCES findings(id) ON DELETE SET NULL,
  merged_into_id        uuid        REFERENCES findings(id) ON DELETE SET NULL,

  -- Provenance. In five years it must be possible to say why a claim said what
  -- it said, under which rules, from which model.
  run_id                uuid,
  model                 text,
  matrix_version        int,
  assertion_taxonomy_version int,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_findings_project     ON findings (research_project_id);
CREATE INDEX IF NOT EXISTS idx_findings_need        ON findings (research_project_id, need_id);
CREATE INDEX IF NOT EXISTS idx_findings_status      ON findings (research_project_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_run         ON findings (run_id);
-- Downstream reads only approved work, and reads it often.
CREATE INDEX IF NOT EXISTS idx_findings_approved    ON findings (research_project_id, status) WHERE status = 'approved';

-- ── finding_evidence ────────────────────────────────────────────────────────
-- One row per citation. STANCE lives here rather than on the evidence, because
-- what an item DOES is a property of its relationship to a claim: the same item
-- legitimately establishes one finding, qualifies a second and contests a third.
--
-- The snapshot columns capture the evidence as it stood when the claim was made,
-- which is what makes a finding reproducible and keeps a delivered report
-- readable after the evidence base has moved on.
CREATE TABLE IF NOT EXISTS finding_evidence (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id        uuid        NOT NULL REFERENCES findings(id) ON DELETE CASCADE,

  -- Source-agnostic. Never a foreign key into any one evidence table: the
  -- platform must be able to cite a source type that does not exist yet.
  evidence_ref      text        NOT NULL,
  stance            text        NOT NULL
                    CHECK (stance IN ('establishes','illustrates','qualifies','contests')),
  admissibility     text        NOT NULL
                    CHECK (admissibility IN ('admissible','admissible_with_limits')),
  constraint_note   text,

  contribution_kind text        NOT NULL,
  evidence_role     text        NOT NULL,

  -- Independence is measured in observation units, never in items: two rows
  -- sharing an observation_key are one observation, and one row may carry many.
  observation_key   text        NOT NULL,
  observations      int         NOT NULL DEFAULT 1,

  -- NULL means unknown, never zero. Evidence assigned by the design but not yet
  -- judged against this question has no bearing score, and inventing one would
  -- be the single dishonest option available.
  bearing           numeric,

  -- Evidence offered for the claim that the claim's own assertion type cannot
  -- use. Kept, because a reach for inadmissible evidence is a signal about the
  -- claim, and dropping it silently would waste that signal.
  rejected          boolean     NOT NULL DEFAULT false,
  rejected_reason   text,

  snippet           text,
  provenance        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finding_evidence_finding ON finding_evidence (finding_id);
CREATE INDEX IF NOT EXISTS idx_finding_evidence_ref     ON finding_evidence (evidence_ref);

-- ── finding_revisions ───────────────────────────────────────────────────────
-- The record stands. Every act on a finding is appended here with who did it and
-- what changed, so an approval, a reframing or a rejection two years ago can
-- still be reconstructed.
CREATE TABLE IF NOT EXISTS finding_revisions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id    uuid        NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  version       int         NOT NULL,
  action        text        NOT NULL
                CHECK (action IN ('created','reframed','narrowed','split','merged',
                                  'evidence_changed','override','approved','rejected',
                                  'published','superseded','reopened')),
  actor         text        NOT NULL,
  summary       text,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finding_revisions_finding ON finding_revisions (finding_id, version);

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_findings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS findings_updated_at ON findings;
CREATE TRIGGER findings_updated_at
  BEFORE UPDATE ON findings
  FOR EACH ROW EXECUTE FUNCTION set_findings_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Server-only writes via the service role; deny anon, mirroring research_summaries.
ALTER TABLE findings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_evidence   ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding_revisions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS findings_no_anon ON findings;
CREATE POLICY findings_no_anon ON findings FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS finding_evidence_no_anon ON finding_evidence;
CREATE POLICY finding_evidence_no_anon ON finding_evidence FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS finding_revisions_no_anon ON finding_revisions;
CREATE POLICY finding_revisions_no_anon ON finding_revisions FOR ALL TO anon USING (false) WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- Rollback:
--   DROP TABLE IF EXISTS finding_revisions;
--   DROP TABLE IF EXISTS finding_evidence;
--   DROP TABLE IF EXISTS findings;
--   DROP TRIGGER IF EXISTS findings_updated_at ON findings;
--   DROP FUNCTION IF EXISTS set_findings_updated_at();
