// ── Survey Studio — surface governed snapshot facts as product findings (coverage) ─
// The immutable evidence_snapshot ALREADY contains governed, deterministic facts that
// the old Studio evidence firewall validated: `derived` (leader / lead-gap / top-2 /
// spread / consistency) and `segmentDerived` (market/device reversal / spread /
// concentration). The Core product read historically ingested only combined base
// evidence and discarded these. This module projects the SAFE ones into OBSERVED
// product findings — reusing their governed labels/refs, NEVER inventing authority,
// semantics, significance, causality, or cross-survey comparability.
//
// SAFETY boundary (deliberate):
//   • Everything here is basis "observed" — never "governed"/DERIVED. A governed
//     ordinal finding still outranks these.
//   • `grouped_share` (the top-2 combined share, e.g. "61.2%") is NOT surfaced: it
//     implies a grouping/construct the survey has not governed, so it stays held.
//   • Segment facts carry the source's own ≥30-per-group base gate; we do not
//     re-assert significance and add no significance/causal wording.
import type { CoreFinding, CoreEvidenceRef } from "@/lib/core/studio/projection";
import { leaderUsefulness, segmentUsefulness } from "@/lib/studio/usefulness";

type DerivedFact = { ref: string; kind: string; canonicalQuestionKey: string; question: string; label: string; value: number; unit: string; inputRefs?: string[]; detail?: Record<string, unknown> };
type SegmentFact = DerivedFact & { dimension?: string };
type SnapEvidence = { ref?: string; question?: string; optionLabel?: string; count?: number; base?: number; percentage?: number | null };

const round1 = (n: unknown): number | undefined => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined);
const asFacts = (v: unknown): DerivedFact[] => (Array.isArray(v) ? (v as DerivedFact[]) : []);

/** How many segment observations to INGEST after de-duplication (final selectivity is
 *  by usefulness in the composer). Bounded so a many-segment survey stays selective. */
export const SEGMENT_CAP = 5;

// Segment kinds that are pointed/useful lead more prominently than range facts.
const SEG_TIER: Record<string, CoreFinding["tier"]> = {
  seg_concentration: "supporting", seg_reversal: "supporting", seg_spread: "context", seg_consistency: "context",
};

/** Result: OBSERVED findings from the snapshot's governed facts, plus the set of
 *  question texts that now have a richer leader finding (so the caller can drop the
 *  generic "divided" distribution-shape duplicate for those questions). */
export function projectSnapshotFacts(snapshot: { evidence?: unknown; derived?: unknown; segmentDerived?: unknown }): { findings: CoreFinding[]; leaderQuestions: Set<string> } {
  const evidence = Array.isArray(snapshot.evidence) ? (snapshot.evidence as SnapEvidence[]) : [];
  const byRef = new Map<string, SnapEvidence>(evidence.filter((e) => e.ref).map((e) => [e.ref!, e]));
  const resolveEvidence = (refs?: string[]): CoreEvidenceRef[] =>
    (refs ?? []).map((r) => byRef.get(r)).filter((e): e is SnapEvidence => !!e)
      .map((e) => ({ question: e.question ?? "", option: e.optionLabel, count: e.count ?? 0, base: e.base ?? 0, percentage: e.percentage ?? null }));

  // ── Leader facts → OBSERVED. Product phrasing: rank without majority/significance. ──
  const leaders = asFacts(snapshot.derived).filter((d) => d.kind === "leader");
  const leaderQuestions = new Set<string>(leaders.map((d) => d.question));
  const leaderFindings: CoreFinding[] = leaders.map((d) => {
    const leaderPct = round1(d.detail?.leaderPct);
    const secondPct = round1(d.detail?.secondPct);
    const leaderLbl = String(d.detail?.leader ?? "the top answer");
    const secondLbl = String(d.detail?.second ?? "the next");
    return {
      id: d.ref, tier: "supporting", basis: "observed",
      title: `“${leaderLbl}” is the most-selected answer${leaderPct != null ? ` (${leaderPct}%)` : ""}${secondPct != null ? `, ahead of “${secondLbl}” (${secondPct}%)` : ""}.`,
      ...(leaderPct != null ? { statistic: `${leaderPct}%` } : {}),
      question: d.question, caveats: [], evidence: resolveEvidence(d.inputRefs),
      usefulness: leaderUsefulness(typeof d.value === "number" ? d.value : 0),
    };
  });

  // ── Segment facts → OBSERVED, selective, reusing the governed label verbatim. ──
  // Redundancy: keep at most ONE fact per (question, dimension) — the most useful —
  // so "Connecting ranges…" and "Connecting 41.9% of UK" don't both appear.
  const bestPerGroup = new Map<string, SegmentFact>();
  for (const s of asFacts(snapshot.segmentDerived).filter((f) => (f as SegmentFact).kind in SEG_TIER) as SegmentFact[]) {
    const g = `${s.canonicalQuestionKey}|${s.dimension ?? ""}`;
    const cur = bestPerGroup.get(g);
    if (!cur || segmentUsefulness(s.kind, s.value) > segmentUsefulness(cur.kind, cur.value)) bestPerGroup.set(g, s);
  }
  const segFindings: CoreFinding[] = [...bestPerGroup.values()]
    .sort((a, b) => segmentUsefulness(b.kind, b.value) - segmentUsefulness(a.kind, a.value)) // most useful first
    .slice(0, SEGMENT_CAP)
    .map((s) => ({
      id: s.ref, tier: SEG_TIER[s.kind], basis: "observed",
      title: s.label, question: s.question, caveats: [], evidence: resolveEvidence(s.inputRefs),
      usefulness: segmentUsefulness(s.kind, s.value),
    }));

  return { findings: [...leaderFindings, ...segFindings], leaderQuestions };
}
