// ── Survey Studio — Deterministic Derived Evidence (pure) ────────────────────
// The SERVER owns arithmetic; the model does not. This turns governed base results
// into safe, structural derived facts — leader/lead-gap, top-2 combined share,
// per-option cross-survey spread, same-leader consistency — each with its own
// deterministic ref + the base refs it came from. Derived facts are treated as
// SUPPLIED evidence (the model may cite/interpret them; it may not compute its own).
// No significance/causal/temporal language is ever attached — just structural facts.

import type { StudyResultGroup } from "@/lib/studio/study-results";
import { evidenceRef, type ResearchNamespace } from "@/lib/studio/study-analysis";

export type DerivedKind = "leader" | "grouped_share" | "spread" | "consistency";
export type DerivedEvidenceItem = {
  ref: string;
  kind: DerivedKind;
  canonicalQuestionKey: string;
  question: string;
  label: string;          // human-readable structural fact (no significance/sentiment claim)
  value: number;          // numeric output
  unit: "pp" | "%" | "bool";
  inputRefs: string[];    // the governed base refs this was computed from
  detail: Record<string, unknown>;
};

const pctNum = (p: number | null) => (p == null ? 0 : Math.round(p * 1000) / 10); // fraction → percent, 1dp
const ppDiff = (a: number, b: number) => Math.round((a - b) * 10) / 10; // both already in percent → pp diff, 1dp
const SPREAD_MIN_PP = 5;   // only surface a spread worth an analyst noticing
const SPREAD_MAX_PER_Q = 4; // cap per question so large studies don't flood

/** Build the derived-evidence set from governed result groups. `ns`/`scopeId` default
 *  to the Study namespace, so every existing Study caller is byte-identical; the Survey
 *  analysis path passes ("survey", surveyId) to reuse this exact arithmetic. */
export function buildDerivedEvidence(scopeId: string, resultGroups: StudyResultGroup[], ns: ResearchNamespace = "study"): DerivedEvidenceItem[] {
  const out: DerivedEvidenceItem[] = [];
  for (const g of resultGroups) {
    const key = g.canonicalQuestionKey;
    // ── Combined-distribution derivations (leader, top-2 share) ──────────────
    if (g.comparability === "combined" && g.combined && g.combined.options.length >= 2) {
      const opts = g.combined.options;
      const ranked = [...opts].sort((a, b) => (b.count || 0) - (a.count || 0));
      const [lead, second] = ranked;
      const leadRef = evidenceRef(scopeId, key, lead.optionId, "combined", null, ns);
      const secondRef = evidenceRef(scopeId, key, second.optionId, "combined", null, ns);
      // LEADER + lead gap
      out.push({
        ref: `derived:leader:${ns}#${scopeId}|q#${key}`, kind: "leader", canonicalQuestionKey: key, question: g.label,
        label: `Leading option "${lead.label}" (${pctNum(lead.percentage)}%), ahead of "${second.label}" (${pctNum(second.percentage)}%) by ${ppDiff(pctNum(lead.percentage), pctNum(second.percentage))}pp`,
        value: ppDiff(pctNum(lead.percentage), pctNum(second.percentage)), unit: "pp", inputRefs: [leadRef, secondRef],
        detail: { leader: lead.label, leaderPct: pctNum(lead.percentage), second: second.label, secondPct: pctNum(second.percentage) },
      });
      // TOP-2 COMBINED SHARE (structural: the two most-selected together — NOT sentiment)
      const base = g.combined.base;
      const top2Count = (lead.count || 0) + (second.count || 0);
      const top2Pct = base > 0 ? Math.round((top2Count / base) * 1000) / 10 : 0;
      out.push({
        ref: `derived:grouped:${ns}#${scopeId}|q#${key}|top2`, kind: "grouped_share", canonicalQuestionKey: key, question: g.label,
        label: `The two most-selected options together ("${lead.label}" or "${second.label}") account for ${top2Pct}% (${top2Count} of ${base})`,
        value: top2Pct, unit: "%", inputRefs: [leadRef, secondRef],
        detail: { options: [lead.label, second.label], count: top2Count, base, note: "combined selection share only — not a sentiment measure" },
      });
    }
    // ── Cross-survey derivations (spread, consistency) — comparable groups ────
    if (g.comparability === "combined" && g.sources.length >= 2) {
      const optionIds = g.combined ? g.combined.options.map((o) => o.optionId) : g.sources[0].options.map((o) => o.optionId);
      const optionLabel = new Map((g.combined?.options ?? g.sources[0].options).map((o) => [o.optionId, o.label]));
      // per-option spread across surveys
      const spreads: DerivedEvidenceItem[] = [];
      for (const oid of optionIds) {
        const pcts = g.sources.map((s) => ({ survey: s.surveyName, surveyId: s.surveyId, pct: pctNum(s.options.find((o) => o.optionId === oid)?.percentage ?? null) }));
        const max = Math.max(...pcts.map((p) => p.pct)), min = Math.min(...pcts.map((p) => p.pct));
        const spread = Math.round((max - min) * 10) / 10;
        if (spread < SPREAD_MIN_PP) continue;
        const hi = pcts.find((p) => p.pct === max)!;
        spreads.push({
          ref: `derived:spread:${ns}#${scopeId}|q#${key}|opt#${oid}`, kind: "spread", canonicalQuestionKey: key, question: g.label,
          label: `"${optionLabel.get(oid)}" ranges ${min}%–${max}% across surveys (spread ${spread}pp; highest in ${hi.survey})`,
          value: spread, unit: "pp",
          inputRefs: g.sources.map((s) => evidenceRef(scopeId, key, oid, "survey", s.surveyId, ns)),
          detail: { option: optionLabel.get(oid), bySurvey: pcts, spreadPp: spread, highest: hi.survey },
        });
      }
      spreads.sort((a, b) => b.value - a.value).slice(0, SPREAD_MAX_PER_Q).forEach((s) => out.push(s));
      // SAME-LEADER consistency across surveys (structural — not statistical agreement)
      const leaders = g.sources.map((s) => [...s.options].sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.optionId);
      const sameLeader = leaders.every((l) => l === leaders[0]) && leaders[0] != null;
      const leaderId = leaders[0];
      out.push({
        ref: `derived:consistency:${ns}#${scopeId}|q#${key}`, kind: "consistency", canonicalQuestionKey: key, question: g.label,
        label: sameLeader ? `The same option ("${optionLabel.get(leaderId!)}") is the most-selected in all ${g.sources.length} surveys` : `The most-selected option differs between surveys`,
        value: sameLeader ? 1 : 0, unit: "bool",
        inputRefs: g.sources.map((s) => { const lid = [...s.options].sort((a, b) => (b.count || 0) - (a.count || 0))[0]?.optionId; return evidenceRef(scopeId, key, lid, "survey", s.surveyId, ns); }),
        detail: { sameLeader, leader: sameLeader ? optionLabel.get(leaderId!) : null, surveys: g.sources.length },
      });
    }
  }
  return out;
}
