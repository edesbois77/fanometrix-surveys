// ── Fanometrix Analytical Core — redundancy / subsumption (Stage 3) ───────────
// Conservative structured detection: two Findings drawing on the SAME questions
// and overlapping evidence likely tell the same story; the stronger explanatory
// one survives as the headline, the other becomes supporting/suppressed. Lexical
// similarity is NOT treated as proof of semantic redundancy — those cases are
// flagged semanticReviewNeeded for the model/human tier.

import type { Finding } from "../findings/types";
import type { Materiality, RedundancyAssessment } from "./types";
import { explanatoryValue } from "./signals";

const questionSet = (f: Finding): Set<string> => new Set((f.questions ?? f.evidence.map((e) => e.question?.canonicalKey).filter((k): k is string => !!k)));
const optionKeys = (f: Finding): Set<string> => new Set(f.evidence.filter((e) => e.kind === "base").map((e) => `${e.question?.canonicalKey ?? ""}:${e.option?.id ?? ""}`));

const EXPL = { high: 2, moderate: 1, low: 0 } as const;
const MAT: Record<Materiality, number> = { critical: 4, high: 3, moderate: 2, low: 1, unable_to_assess: 0 };
function strength(f: Finding, m: Materiality): number { return EXPL[explanatoryValue(f)] * 10 + MAT[m]; }

const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  const shared = [...a].filter((x) => b.has(x)).length;
  return shared / a.size;
}

/** Map each Finding id → its redundancy assessment. A Finding is subsumed by a
 *  STRONGER Finding that covers its questions and ≥50% of its evidence options. */
export function detectRedundancy(findings: Finding[], materialityById: Map<string, Materiality>): Map<string, RedundancyAssessment> {
  const out = new Map<string, RedundancyAssessment>();
  for (const a of findings) {
    let subsumedBy: string | null = null;
    let reason: string | null = null;
    const aQ = questionSet(a), aO = optionKeys(a);
    const aStrength = strength(a, materialityById.get(a.id) ?? "low");
    for (const b of findings) {
      if (b.id === a.id) continue;
      // A synthesis must NOT subsume its own components (it is built from them).
      if (b.derivedFrom?.includes(a.id)) continue;
      const bStrength = strength(b, materialityById.get(b.id) ?? "low");
      const stronger = bStrength > aStrength || (bStrength === aStrength && findings.indexOf(b) < findings.indexOf(a));
      if (!stronger) continue;
      // Only subsume within the SAME analytical construct (assertion type) — a
      // wave-comparison is a different story from a distribution of the same
      // question, even though they share evidence.
      const sameConstruct = (a.assertionType ?? "descriptive") === (b.assertionType ?? "descriptive");
      const bQ = questionSet(b), bO = optionKeys(b);
      if (sameConstruct && subset(aQ, bQ) && overlapRatio(aO, bO) >= 0.5) { subsumedBy = b.id; reason = `shares questions and ≥50% of evidence with a stronger same-construct Finding (${b.id})`; break; }
    }
    out.set(a.id, subsumedBy
      ? { subsumedBy, kind: "heuristic", reason, semanticReviewNeeded: true }
      : { subsumedBy: null, kind: "none", reason: null, semanticReviewNeeded: false });
  }
  return out;
}
