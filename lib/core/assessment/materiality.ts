// ── Fanometrix Analytical Core — materiality (Stage 3, deterministic-heuristic) ─
// How much does this Finding change understanding / matter to a decision
// (Decision 4)? Categorical. Driven by EXPLANATORY VALUE and RESEARCH RELEVANCE
// first; magnitude and reinforcement are secondary inputs — NEVER "largest number
// wins". The definitive "does this change interpretation?" judgement is
// model-assisted; the deterministic layer produces a provisional level + flags it.

import type { Finding } from "../findings/types";
import type { AnalysisContext, MaterialityAssessment, RelevanceAssessment } from "./types";
import { explanatoryValue, magnitudeBand, independentSupport } from "./signals";

export function assessMateriality(f: Finding, relevance: RelevanceAssessment, ctx: AnalysisContext = {}): MaterialityAssessment {
  void ctx;
  const reasons: string[] = [];
  const constraints: string[] = [];
  const modelAssistedNeeded = ["whether this materially changes interpretation of the research (semantic)"];

  if (f.evidence.length === 0) {
    return { level: "unable_to_assess", reasons: [], constraints: ["no evidence to weigh"], assessor: "deterministic-heuristic", modelAssistedNeeded };
  }

  const explanatory = explanatoryValue(f);
  const magnitude = magnitudeBand(f);
  const rel = relevance.level;
  const reinforced = independentSupport(f) >= 2;

  if (explanatory === "high") reasons.push("high explanatory value (connects/reframes multiple results)");
  else if (explanatory === "moderate") reasons.push("explains a single leading result");
  else constraints.push("isolated result with limited explanatory value");

  if (rel === "high") reasons.push("central to the stated research objective");
  else if (rel === "moderate") reasons.push("related to the research objective");
  else if (rel === "unable_to_assess") { constraints.push("research objective unavailable — relevance not assessed"); }
  else constraints.push("no overlap with the stated objective (heuristic)");

  if (magnitude === "strong" || magnitude === "clear") reasons.push(`material magnitude (${magnitude} candidate difference)`);
  else if (magnitude === "weak" || magnitude === "negligible") constraints.push(`small magnitude (${magnitude} candidate difference)`);
  if (reinforced) reasons.push("reinforced by multiple independent evidence lines");

  // Level — explanatory value and relevance lead; magnitude is a secondary lift.
  let level: MaterialityAssessment["level"];
  const relStrong = rel === "high";
  const relOk = rel === "high" || rel === "moderate" || rel === "unable_to_assess";
  if (explanatory === "high" && relStrong) level = "high";
  else if (explanatory === "high" && relOk) level = "high";
  else if (explanatory === "moderate" && relStrong && (magnitude === "strong" || magnitude === "clear")) level = "high";
  else if (relStrong || (explanatory !== "low" && (magnitude === "strong" || magnitude === "clear"))) level = "moderate";
  else if (explanatory !== "low" && relOk) level = "moderate";
  else level = "low";

  // "critical" is a semantic elevation reserved for model/human judgement.
  if (level === "high" && explanatory === "high" && relStrong) {
    modelAssistedNeeded.push("whether this rises to 'critical' (the central story) — model/human only");
  }

  return { level, reasons, constraints, assessor: "deterministic-heuristic", modelAssistedNeeded };
}
