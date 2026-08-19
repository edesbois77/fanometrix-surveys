// ── Core adapter — Research Projects finding → canonical Finding (read-only) ───
// Pure. Maps an RP `findings` row + its `finding_evidence` rows into the Core
// Finding contract. Synthesises nothing; recomputes nothing. RP's stored
// confidence/strength grade is preserved in `sourceMeta` — it is NOT mapped into
// the Core `confidence` field (different scale/derivation; mapping is deferred to
// the confidence stage). Interpretive fields (materiality/insight/implications/
// recommendations) are left ABSENT.
//
// RP is not the actively-edited product, so its stored row types are imported
// type-only (erased at runtime; gives compile-time drift detection).

import type { FindingRow, EvidenceRow } from "@/lib/analysis/finding-store";
import type { Finding } from "../findings/types";
import type { Evidence } from "../evidence/types";
import type { ContributionKind, CitationStance } from "../vocabulary";

const CONTRIBUTION_KINDS = new Set<ContributionKind>([
  "elicited_perception", "unprompted_discourse", "documented_activity",
  "interested_claim", "expert_judgement", "established_knowledge", "derived_result",
]);
const STANCES = new Set<CitationStance>(["establishes", "illustrates", "qualifies", "contests"]);
const asContribution = (v: string): ContributionKind | undefined => (CONTRIBUTION_KINDS.has(v as ContributionKind) ? (v as ContributionKind) : undefined);
const asStance = (v: string): CitationStance | undefined => (STANCES.has(v as CitationStance) ? (v as CitationStance) : undefined);

/** Map an RP evidence row into canonical Evidence. RP citations do not store a
 *  plain source type/id, so those stay absent; the raw citation semantics are
 *  preserved verbatim in `sourceMeta`. The RP contribution_kind/stance are
 *  promoted to the first-class canonical fields. */
function fromRpEvidence(e: EvidenceRow): Evidence {
  return {
    id: e.evidence_ref,
    kind: "base",
    contribution: asContribution(e.contribution_kind),
    stance: asStance(e.stance),
    observationKey: e.observation_key,
    sourceMeta: {
      contribution_kind: e.contribution_kind,
      evidence_role: e.evidence_role,
      admissibility: e.admissibility,
      stance: e.stance,
      bearing: e.bearing,
      observations: e.observations,
      rejected: e.rejected,
      rejected_reason: e.rejected_reason,
      constraint_note: e.constraint_note,
      snippet: e.snippet,
      provenance: e.provenance,
    },
  };
}

export function fromRpFinding(row: FindingRow, evidence: EvidenceRow[]): Finding {
  return {
    id: row.id,
    statement: row.statement,
    assertionType: row.assertion_type,
    scope: row.scope,
    evidence: evidence.map(fromRpEvidence),
    source: { projectId: row.research_project_id },
    questions: [row.need_id],
    // Provenance — RP findings predate the Standard, so standard/core versions are null.
    version: { standardVersion: null, coreVersion: null, runProvenance: row.run_id },
    model: row.model,
    analysisRunId: row.run_id,
    status: row.status,                       // "candidate" — a FindingStatus member
    revisionRef: row.id,                      // findings have a finding_revisions ledger
    // RP's OWN grade + interpretation kept as provenance, NOT mapped to Core fields.
    sourceMeta: {
      confidence_level: row.confidence_level,
      evidence_strength: row.evidence_strength,
      warrant: row.warrant,
      reading: row.reading,
      temporal_validity: row.temporal_validity,
      is_null: row.is_null,
      disconfirmed: row.disconfirmed,
      assessment: row.assessment,
      requirement_key: row.requirement_key,
      requirement_text: row.requirement_text,
      need_text: row.need_text,
      aspect: row.aspect,
      rank: row.rank,
      matrix_version: row.matrix_version,
      assertion_taxonomy_version: row.assertion_taxonomy_version,
    },
    // confidence / materiality / priority / insight / implications / recommendations
    // / caveats / claimStrength / change: ABSENT — not synthesised.
  };
}
