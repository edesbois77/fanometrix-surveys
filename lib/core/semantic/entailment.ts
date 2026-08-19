// ── Fanometrix Analytical Core — deterministic semantic entailment (Stage 5R.4) ─
// Decides whether a proposed grouped interpretation is ENTAILED by GOVERNED
// semantic metadata — and, only then, may grant DERIVED authority. This is NOT a
// language reasoner: it uses governed structure (constructId, metadata provenance)
// ONLY. No substring/token/embedding/synonym matching over labels. When governed
// facts are insufficient it returns `unable_to_establish` (never invents meaning),
// and a model verdict can never override its `not_entailed`/`unable` outcomes.
//
// DERIVED authority attaches to an ENGINE-AUTHORED neutral construct-membership
// recode ("combined share for governed construct X"), which is entailed by
// construction (it asserts only shared-construct membership + the union, adding no
// narrower/stronger meaning). Threshold/top-box LABELS require governed threshold
// semantics that do not exist yet → `unable_to_establish` (Stage 5R.4 §8).

import {
  type QuestionSemantics, type MetadataProvenance,
  constructIdOf, isGovernedMetadata, optionSemanticsOf,
} from "./metadata";
import { type ConstructInterpretation, SEMANTIC_SCHEMA_VERSION } from "./authority";

export type EntailmentDecision = "entailed" | "not_entailed" | "unable_to_establish";
export type EntailmentReason =
  | "same_governed_construct"          // all components share one governed construct → derivable
  | "different_governed_constructs"    // cross-construct substitution → not entailed
  | "metadata_absent"                  // required governed metadata missing → unable
  | "metadata_not_governed"            // provenance only analytically_proposed → unable
  | "label_exceeds_governed_semantics" // claims a narrower/other construct than metadata establishes → unable
  // ── ordinal recode reasons (Stage 5R.9R, Standard v1.2 §17.4) ────────────────
  | "ordinal_recode_entailed"          // contiguous, single-polarity governed threshold region
  | "non_contiguous_ordinal_group"     // ordinal positions are not adjacent → contradicts a threshold recode
  | "polarity_mismatch"                // components span more than one governed polarity region
  | "crosses_neutral_boundary"         // a positive/negative region is joined with the neutral midpoint
  | "ordinal_threshold_not_governed"   // ordinal + contiguous but no governed polarity/threshold → insufficient
  | "ordinal_metadata_incomplete";     // ordinal scale but ordinalPosition missing → insufficient

export type EntailmentComponent = { questionKey: string; optionId: string };

export type EntailmentResult = {
  decision: EntailmentDecision;
  reasons: EntailmentReason[];
  componentIds: string[];
  constructIds: (string | undefined)[];
  constructId?: string;                 // the shared governed construct, when entailed
  metadataProvenance?: MetadataProvenance;
};

/** Assess whether combining `components` is semantically entailed by governed
 *  metadata. `proposedConstructId`, when supplied, is the GOVERNED construct id the
 *  interpretation claims; if it differs from the shared construct the claim exceeds
 *  what metadata establishes → unable_to_establish (guards §22 narrower labels).
 *  Structural/arithmetic validity is assumed already checked by the caller. */
export function assessEntailment(
  components: EntailmentComponent[],
  semanticsFor: (questionKey: string) => QuestionSemantics | undefined,
  proposedConstructId?: string,
): EntailmentResult {
  const componentIds = components.map((c) => `${c.questionKey}:${c.optionId}`);
  const qs = components.map((c) => semanticsFor(c.questionKey));
  const constructIds = components.map((c, i) => constructIdOf(qs[i], c.optionId));

  // Governed metadata must exist for every component.
  if (qs.some((q) => !q) || constructIds.some((id) => id == null)) {
    return { decision: "unable_to_establish", reasons: ["metadata_absent"], componentIds, constructIds };
  }
  // …and be governed (source-declared / governed-imported), never merely proposed.
  const provs = qs.map((q) => q!.provenance);
  if (!provs.every(isGovernedMetadata)) {
    return { decision: "unable_to_establish", reasons: ["metadata_not_governed"], componentIds, constructIds, metadataProvenance: provs.find((p) => !isGovernedMetadata(p)) };
  }
  // Cross-construct substitution is a semantic-authority failure (not arithmetic).
  if (new Set(constructIds).size > 1) {
    return { decision: "not_entailed", reasons: ["different_governed_constructs"], componentIds, constructIds };
  }
  const constructId = constructIds[0]!;
  // A claimed construct narrower/other than the governed one cannot be established.
  if (proposedConstructId != null && proposedConstructId !== constructId) {
    return { decision: "unable_to_establish", reasons: ["label_exceeds_governed_semantics"], componentIds, constructIds, constructId };
  }
  const base = { componentIds, constructIds, constructId, metadataProvenance: provs[0] };

  // ── Ordinal scales: same construct is necessary but NOT sufficient (§17.4) ────
  // A DERIVED ordinal recode must be a governed THRESHOLD region: contiguous
  // positions within a single, non-neutral polarity. Non-contiguity / polarity
  // crossing positively CONTRADICTS a threshold recode (→ not_entailed); absent
  // position/polarity metadata is merely INSUFFICIENT (→ unable_to_establish).
  if (qs[0]!.scaleType === "ordinal" && components.length >= 2) {
    const opts = components.map((c, i) => optionSemanticsOf(qs[i], c.optionId));
    const positions = opts.map((o) => o?.ordinalPosition);
    if (positions.some((p) => p == null)) return { decision: "unable_to_establish", reasons: ["ordinal_metadata_incomplete"], ...base };
    const sorted = [...(positions as number[])].sort((a, b) => a - b);
    const contiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1] + 1);
    if (!contiguous) return { decision: "not_entailed", reasons: ["non_contiguous_ordinal_group"], ...base };
    const polarities = opts.map((o) => o?.polarity);
    if (polarities.some((p) => p == null)) return { decision: "unable_to_establish", reasons: ["ordinal_threshold_not_governed"], ...base };
    const uniquePol = new Set(polarities);
    if (uniquePol.size > 1) return { decision: "not_entailed", reasons: [polarities.includes("neutral") ? "crosses_neutral_boundary" : "polarity_mismatch"], ...base };
    if (polarities[0] === "neutral") return { decision: "unable_to_establish", reasons: ["ordinal_threshold_not_governed"], ...base };
    return { decision: "entailed", reasons: ["ordinal_recode_entailed"], ...base };
  }

  // Nominal / interval: same governed construct is sufficient (Standard v1.2 §46.1).
  return { decision: "entailed", reasons: ["same_governed_construct"], ...base };
}

/** Build the DERIVED, engine-authored construct-membership interpretation for an
 *  `entailed` grouping (Stage 5R.4). Authority DERIVED comes from governed metadata,
 *  NEVER a model verdict; the label is the neutral union under the shared construct. */
export function buildDerivedInterpretation(candidateId: string, e: EntailmentResult): ConstructInterpretation {
  const constructId = e.constructId!;
  return {
    id: `${candidateId}#interp`,
    label: `combined share for governed construct "${constructId}"`,
    construct: constructId,
    decision: "approved",
    authority: "derived",
    provenance: "deterministic_recode",
    reviewRequired: false,
    caveats: ["authority is DERIVED deterministically from governed construct metadata (neutral construct-membership union)"],
    derivation: {
      method: "same_governed_construct_union",
      componentIds: e.componentIds,
      constructIds: e.constructIds,
      metadataProvenance: e.metadataProvenance,
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
    },
  };
}

/** Build the REJECTED interpretation for a `not_entailed` grouping (Stage 5R.4).
 *  The Result's arithmetic is untouched; this records WHY the label was refused
 *  (e.g. cross-construct substitution) for audit. Confers no authority. */
export function buildRejectedInterpretation(candidateId: string, e: EntailmentResult): ConstructInterpretation {
  return {
    id: `${candidateId}#interp`,
    label: "proposed grouped construct",
    decision: "rejected",
    authority: "provisional",
    provenance: "deterministic_recode",
    reviewRequired: true,
    caveats: [`interpretation not entailed by governed metadata: ${e.reasons.join("; ")}`],
    derivation: {
      method: "entailment_rejected",
      componentIds: e.componentIds,
      constructIds: e.constructIds,
      metadataProvenance: e.metadataProvenance,
      schemaVersion: SEMANTIC_SCHEMA_VERSION,
    },
  };
}
