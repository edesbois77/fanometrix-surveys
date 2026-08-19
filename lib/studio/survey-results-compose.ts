// ── Survey Studio — one coherent results experience (Stage 7, pure) ──────────
// Composes the THREE Stage-6 analytical layers into a SINGLE story so the user never
// sees "three engines stacked". Pure + deterministic + fully testable; the React view
// only renders this model.
//
//   • The Core owns the FINDINGS (governed leads, then observed) — selective.
//   • The existing AI narrative becomes a SUBORDINATE "what this might mean" summary
//     (already firewall-validated model synthesis — reused, not re-run; never a
//     headline, never a statistic-bearing finding).
//   • Core supporting/context become "also worth noting" — subordinate.
//   • A weak survey gets an HONEST empty message, never manufactured excitement.
//
// When there is no Core intelligence (flag off / no run / Core failure) the model is
// `legacy` and the view renders the existing analysis/findings experience unchanged —
// so Stage 7 is additive behind the same flag and rolls back cleanly.
import type { CoreFindingsProjection, CoreFinding, CoreFindingBasis, CoreEvidenceRef } from "@/lib/core/studio/projection";
import type { SurveyAnalysisView } from "@/lib/studio/survey-analysis-service";
import { effectiveUsefulness, HEADLINE_MIN } from "@/lib/studio/usefulness";

/** How many findings lead / sit under "also worth noting" — selectivity over volume. */
export const KEY_CAP = 3;   // fewer, better: at most ~3 things a user should remember
export const NOTE_CAP = 2;  // a couple of genuinely useful secondary notes — and zero is fine
/** Worth-noting FLOOR: a secondary note must still be worth a reader's attention. Below
 *  this we show nothing rather than pad the page with routine trivia (bare minorities,
 *  near-even splits). Topline leaders (≈30–40) and real segment facts clear it. */
export const NOTE_MIN = 30;

export type ResultsFinding = {
  id: string;
  title: string;                  // the precise measured statement (the evidence line)
  takeaway?: string;              // optional short human headline; when set the card leads with it
  statistic?: string;
  basis: CoreFindingBasis;        // governed | observed | exploratory (never hidden, never headline-equal)
  question?: string;
  evidence: CoreEvidenceRef[];    // for progressive disclosure ("show the numbers")
  caveat?: string;
};

export type SurveyResultsViewModel =
  | { mode: "legacy" }
  | {
      mode: "intelligence";
      keyFindings: ResultsFinding[];
      worthNoting: ResultsFinding[];
      /** Subordinate interpretive summary (the existing AI narrative), or null. */
      interpretation: string | null;
      /** Honest message shown when nothing dominates (no key finding), else null. */
      emptyMessage: string | null;
    };

const BASIS_RANK: Record<CoreFindingBasis, number> = { governed: 0, observed: 1, exploratory: 2 };

/** Numeric value of a "65%" style statistic, for choosing the stronger side of a
 *  complementary governed pair. Missing/unparseable → -1 (never wins). */
const parseStat = (s?: string): number => { const n = s ? parseFloat(s) : NaN; return Number.isFinite(n) ? n : -1; };

function toFinding(f: CoreFinding): ResultsFinding {
  return {
    id: f.id, title: f.title, takeaway: f.takeaway, statistic: f.statistic, basis: f.basis, question: f.question,
    evidence: f.evidence, caveat: f.caveats[0],
  };
}

/** Compose the single results story. `core` null/empty ⇒ legacy fallback. */
export function composeSurveyResults(input: {
  core: CoreFindingsProjection | null | undefined;
  analysis: SurveyAnalysisView | null | undefined;
}): SurveyResultsViewModel {
  const core = input.core;
  if (!core || core.findings.length === 0) return { mode: "legacy" };

  // Collapse COMPLEMENTARY governed findings from the SAME question. A governed scale
  // produces both a top-box and a bottom-box recode; when they sum to ~100% (a
  // two-region scale with NO neutral midpoint, e.g. "35% agree" + "65% disagree") one
  // is just the inverse of the other, and showing both reads as repetition. We keep
  // the stronger side and drop the inverse. A scale WITH a neutral midpoint sums to
  // < 100%, so each side is a distinct fact and BOTH are kept. Presentation only —
  // the Core findings/evidence are never modified.
  const droppedComplementIds = new Set<string>();
  const govByQuestion = new Map<string, CoreFinding[]>();
  for (const f of core.findings) {
    if (f.basis === "governed" && f.question && f.statistic) {
      const list = govByQuestion.get(f.question) ?? [];
      list.push(f); govByQuestion.set(f.question, list);
    }
  }
  for (const fs of govByQuestion.values()) {
    if (fs.length < 2) continue;
    const sum = fs.reduce((a, f) => a + parseStat(f.statistic), 0);
    if (sum < 99) continue; // neutral region present → both meaningful → keep all
    const strongest = fs.reduce((best, f) => (parseStat(f.statistic) > parseStat(best.statistic) ? f : best));
    for (const f of fs) if (f.id !== strongest.id) droppedComplementIds.add(f.id);
  }
  const findings = core.findings.filter((f) => !droppedComplementIds.has(f.id));

  // Key findings: Core "key" tier, governed leads, capped for selectivity. An
  // EXPLORATORY reading can never be a key finding (the projection already re-tiers it).
  // Rank every permitted finding by product USEFULNESS (not just tier): a governed
  // conclusion leads everything, then a material segment difference the topline hides,
  // then — only if genuinely large — a topline leader. Ties break by basis.
  const scored = findings
    .filter((f) => f.basis !== "exploratory") // model-origin never headlines
    .map((f) => ({ f, u: effectiveUsefulness(f) }))
    .sort((a, b) => b.u - a.u || BASIS_RANK[a.f.basis] - BASIS_RANK[b.f.basis]);

  // "What stands out": only findings that clear the headline bar (governed + material
  // segments do; a bare topline winner does not), hard-capped for selectivity.
  const key = scored.filter((x) => x.u >= HEADLINE_MIN).slice(0, KEY_CAP).map((x) => toFinding(x.f));
  const keyIds = new Set(key.map((k) => k.id));

  // Worth noting: the useful-but-not-headline facts (topline leaders, secondary or
  // technical-dimension segments) that still clear the NOTE_MIN floor — most-useful
  // first — so a boring survey shows nothing here rather than padding with routine
  // trivia. Any clearly-labelled "worth exploring" model reading trails after, still
  // within the hard cap (squeezed out on a rich survey). Capped hard; zero is valid.
  const worthNoting = [
    ...scored.filter((x) => !keyIds.has(x.f.id) && x.u >= NOTE_MIN),
    ...findings.filter((f) => f.basis === "exploratory").map((f) => ({ f, u: 0 })),
  ].slice(0, NOTE_CAP).map((x) => toFinding(x.f));

  const interpretation = input.analysis?.narrative?.summary?.trim() || null;
  // Honest empty state ONLY when nothing clears the headline bar (a genuinely flat
  // survey stays restrained — the observations still appear under "worth noting").
  const emptyMessage = key.length === 0
    ? "No single result dominates this survey — here's what the data shows."
    : null;

  return { mode: "intelligence", keyFindings: key, worthNoting, interpretation, emptyMessage };
}
