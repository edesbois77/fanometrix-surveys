// ── Fanometrix Analytical Core — assessment composition (Stage 3, shadow) ─────
// Runs the full hierarchy over a set of Findings and returns their shadow
// assessments + a proposed priority grouping. Pure; no persistence, no wiring.

import type { Finding } from "../findings/types";
import type { AnalysisContext, FindingAssessment, Priority } from "./types";
import { assessEligibility } from "./eligibility";
import { assessConfidence } from "./confidence";
import { assessRelevance } from "./relevance";
import { assessMateriality } from "./materiality";
import { detectRedundancy } from "./redundancy";
import { assignPriority, applySynthesisConstraint, withinClassOrder, type RankingInput } from "./ranking";

export function assessFindings(findings: Finding[], ctx: AnalysisContext = {}): FindingAssessment[] {
  // Per-finding independent assessments.
  const parts = findings.map((f) => {
    const eligibility = assessEligibility(f, ctx);
    const confidence = assessConfidence(f);
    const relevance = assessRelevance(f, ctx);
    const materiality = assessMateriality(f, relevance, ctx);
    return { f, eligibility, confidence, relevance, materiality };
  });

  // Cross-finding redundancy (needs materiality of the whole set).
  const materialityById = new Map(parts.map((p) => [p.f.id, p.materiality.level]));
  const redundancy = detectRedundancy(findings, materialityById);

  // Ranking — first pass (per-finding, incl. the temporal-comparability cap).
  const first = parts.map((p) => {
    const input: RankingInput = {
      eligibility: p.eligibility, confidence: p.confidence, materiality: p.materiality,
      relevance: p.relevance, redundancy: redundancy.get(p.f.id)!, finding: p.f,
    };
    return { p, ...assignPriority(input) };
  });
  const priorityById = new Map<string, Priority>(first.map((x) => [x.p.f.id, x.priority]));

  // Second pass — set-level SYNTHESIS constraint (a synthesis must not outrank
  // its surfaced components by default).
  return first.map(({ p, priority, reasons }) => {
    const componentPriorities = (p.f.derivedFrom ?? []).map((id) => priorityById.get(id)).filter((x): x is Priority => !!x);
    const syn = applySynthesisConstraint(p.f, priority, componentPriorities);
    const finalPriority = syn.priority;
    const finalReasons = [...reasons, ...syn.reasons];
    const modelAssisted = [
      ...p.materiality.modelAssistedNeeded,
      ...(redundancy.get(p.f.id)!.semanticReviewNeeded ? ["confirm this is the same story as its subsumer (semantic)"] : []),
      ...(p.eligibility.caveats.some((c) => /model\/human review/i.test(c)) ? ["confirm the semantic grouping is valid"] : []),
      ...(syn.reasons.includes("synthesis_elevation_requires_governed_route") ? ["confirm whether the synthesis is the central story (governed elevation above components)"] : []),
    ];
    return {
      findingId: p.f.id,
      concept: p.f.statement,
      eligibility: p.eligibility,
      confidence: p.confidence,
      materiality: p.materiality,
      relevance: p.relevance,
      redundancy: redundancy.get(p.f.id)!,
      priority: finalPriority,
      priorityReasons: finalReasons,
      modelAssisted: [...new Set(modelAssisted)],
    };
  });
}

/** Group assessments into the four priority classes, ordered within each class. */
export function groupByPriority(findings: Finding[], assessments: FindingAssessment[]): Record<Priority, FindingAssessment[]> {
  const byId = new Map(assessments.map((a) => [a.findingId, a]));
  const rankInput = (a: FindingAssessment): RankingInput => ({ eligibility: a.eligibility, confidence: a.confidence, materiality: a.materiality, relevance: a.relevance, redundancy: a.redundancy });
  const out: Record<Priority, FindingAssessment[]> = { primary: [], secondary: [], contextual: [], suppressed: [] };
  for (const a of assessments) out[a.priority].push(a);
  const order = (list: FindingAssessment[]) => list.sort((x, y) => withinClassOrder(rankInput(x), rankInput(y)));
  (Object.keys(out) as Priority[]).forEach((k) => order(out[k]));
  void findings; void byId;
  return out;
}
