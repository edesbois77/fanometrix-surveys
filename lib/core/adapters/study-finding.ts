// ── Core adapter — Survey Studio curated Finding → canonical Finding (read-only) ─
// Pure. Maps a study_findings row + its frozen evidence into the Core Finding
// contract. Editorial `commentary` is preserved in `sourceMeta` and is NOT turned
// into a governed Insight. Frozen evidence is mapped VERBATIM (never recomputed).
// Confidence/materiality are ABSENT (Survey Studio does not grade them).
//
// Survey Studio is being actively developed in a separate session, so this
// adapter is intentionally decoupled: it accepts LOCAL STRUCTURAL input types
// (a documented mirror of the study_findings row and the FrozenEvidence shape as
// of this spec) rather than importing the churning Studio modules. When wiring
// happens in a later stage, these can be replaced with direct type imports for
// compile-time drift detection.

import type { Finding } from "../findings/types";
import type { Evidence } from "../evidence/types";
import { proportion } from "../evidence/scale";
import type { EvidenceKind } from "../vocabulary";

/** Structural mirror of a study_findings row (fields this adapter reads). */
export type StudyFindingRowInput = {
  id: string;
  study_id: string;
  headline: string;
  commentary?: string | null;
  status: "draft" | "published";
  origin_type?: "manual" | "analysis_proposal" | null;
  origin_analysis_proposal_id?: string | null;
  created_at?: string | null;
};

/** Structural mirror of one frozen evidence snapshot item. Read defensively —
 *  it is a frozen JSON snapshot, not a live typed object. */
export type FrozenEvidenceInput = Record<string, unknown> & {
  evidenceClass?: "base" | "derived" | "segment";
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Mirror of study-finding.ts::evidenceClassOf — tags are authoritative; untagged
 *  historical rows infer base/segment/derived from shape; default base. */
function classOf(e: FrozenEvidenceInput): EvidenceKind {
  const tag = e.evidenceClass;
  if (tag === "derived" || tag === "segment" || tag === "base") return tag;
  if (typeof e.dimension === "string" && e.dimension) return "segment";
  if (typeof e.optionLabel === "string") return "base";
  if (typeof e.label === "string" && typeof e.kind === "string") return "derived";
  return "base";
}

function fromFrozen(e: FrozenEvidenceInput, frozenAt: string | null): Evidence {
  const kind = classOf(e);
  const base: Evidence = {
    id: str(e.ref) ?? str(e.id) ?? "frozen",
    kind,
    // Definitional contribution: Survey Studio evidence is survey answers
    // (elicited_perception); derived facts are derived_result. This is the
    // canonical classification of the evidence, not a guess. Studio models no
    // claim-relationship stance, so `stance` is left absent.
    contribution: kind === "derived" ? "derived_result" : "elicited_perception",
    frozen: { frozenAt, snapshot: e },
    sourceMeta: e,
  };
  if (kind === "base") {
    const canonicalKey = str(e.canonicalQuestionKey) ?? str(e.questionKey);
    const pct = num(e.percentage);
    return {
      ...base,
      question: canonicalKey ? { canonicalKey, text: str(e.question) } : undefined,
      option: str(e.optionId) || str(e.optionLabel) ? { id: str(e.optionId) ?? "", label: str(e.optionLabel) } : undefined,
      numerator: num(e.count),
      denominator: num(e.base),
      denominatorType: "respondents",
      // Survey Studio stores percentage as a FRACTION (0–1); tag it as a
      // proportion VERBATIM — never rescaled.
      quantity: pct != null ? proportion(pct) : undefined,
    };
  }
  if (kind === "segment") {
    const dimension = str(e.dimension);
    const value = str(e.groupLabel) ?? str(e.key) ?? str(e.segment);
    return { ...base, segment: dimension && value ? { dimension, value } : undefined };
  }
  // Derived facts are heterogeneous and their numeric scale is not guaranteed by
  // the source, so no `quantity` is asserted — the raw snapshot is preserved in
  // `frozen`/`sourceMeta` for a later stage to interpret with explicit scale.
  return base;
}

export function fromStudyFinding(row: StudyFindingRowInput, frozen: FrozenEvidenceInput[]): Finding {
  const frozenAt = row.created_at ?? null;
  return {
    id: row.id,
    statement: row.headline,
    evidence: frozen.map((e) => fromFrozen(e, frozenAt)),
    source: { studyId: row.study_id },
    version: { standardVersion: null, coreVersion: null, runProvenance: row.origin_analysis_proposal_id ?? null },
    status: row.status,                       // "draft" | "published" — FindingStatus members
    frozen: { frozenAt },
    // Editorial commentary is provenance, NOT a governed Insight.
    sourceMeta: { commentary: row.commentary ?? null, origin_type: row.origin_type ?? null },
    // confidence / materiality / insight / implications / recommendations: ABSENT.
  };
}
