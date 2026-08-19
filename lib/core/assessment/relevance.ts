// ── Fanometrix Analytical Core — research relevance (Stage 3, heuristic) ──────
// Does the Finding address what the research set out to learn? A DETERMINISTIC
// HEURISTIC (construct/keyword overlap with the objective/questions). When no
// objective/context is available it is `unable_to_assess` — never fabricated,
// never forced to zero. The definitive semantic relevance is model-assisted.

import type { Finding } from "../findings/types";
import type { AnalysisContext, RelevanceAssessment } from "./types";

const STOP = new Set(["that", "this", "with", "from", "into", "what", "when", "were", "their", "they", "them", "which", "would", "could", "should", "about", "there", "these", "those", "than", "then", "also", "some", "more", "most", "much", "many", "does", "have", "here", "over"]);
const tokens = (s: string): Set<string> => new Set((s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((t) => !STOP.has(t)));

function findingText(f: Finding): string {
  const opts = f.evidence.map((e) => e.option?.label ?? "").join(" ");
  const qs = f.evidence.map((e) => e.question?.text ?? "").join(" ");
  return `${f.statement} ${opts} ${qs}`;
}

export function assessRelevance(f: Finding, ctx: AnalysisContext = {}): RelevanceAssessment {
  const contextText = [ctx.objective, ctx.purpose, ...(ctx.researchQuestions ?? [])].filter(Boolean).join(" ");
  if (!contextText.trim()) {
    return { level: "unable_to_assess", reasons: ["no research objective/context supplied"], assessor: "deterministic-heuristic" };
  }
  const objTokens = tokens(contextText);
  const fTokens = tokens(findingText(f));
  const shared = [...fTokens].filter((t) => objTokens.has(t));
  const n = shared.length;
  const level = n >= 2 ? "high" : n === 1 ? "moderate" : "low";
  return {
    level,
    reasons: n > 0 ? [`overlaps the research objective on: ${shared.slice(0, 6).join(", ")}`] : ["no construct overlap with the stated objective (heuristic)"],
    assessor: "deterministic-heuristic",
  };
}
