// ── Survey Studio → Study → Research Findings (pure, deterministic) ──────────
// "What did respondents actually tell us?" — computed ONLY from completed answer
// VALUES over questions the governed system already deems directlyComparable (the
// route hands us ComparableGroups, never wording-similarity). Every finding is
// re-derivable from its `evidence`. Rules that keep it honest:
//   • Findings describe COMPLETED answer VALUES (n = pooled completed base) — NEVER
//     the partial answer COUNTS reconstructed from progression events.
//   • Cross-survey pooling/comparison happens ONLY within a ComparableGroup.
//   • A "change" is surfaced ONLY when the leader's movement between the first and
//     last survey exceeds the COMBINED margin of error (defensibly beyond noise) —
//     otherwise the surveys are treated as telling a consistent story. No invented
//     significance test; the same 95% proportion MoE the dashboard already uses.
//   • A minimum base gates every finding; below it, nothing is surfaced (fail closed).
//   • No option is ever combined to manufacture a majority.

import { marginOfError } from "./dashboard-results";
import type { ComparableGroup, StudyFinding } from "./dashboard-study";

/** Minimum answered base (completed values) before a finding may be surfaced. */
export const FINDING_MIN_BASE = 30;

const pctInt = (count: number, base: number): number => (base > 0 ? Math.round((count / base) * 100) : 0);
const leaderIndex = (opts: { count: number }[], n: number): number => {
  let bi = 0;
  for (let i = 1; i < n; i++) if ((opts[i]?.count ?? 0) > (opts[bi]?.count ?? 0)) bi = i;
  return bi;
};

export function buildStudyFindings(input: {
  comparableGroups: ComparableGroup[];
  /** Single-survey fallback (used only when there are no comparable groups). */
  singleSurvey?: { surveyName: string; questions: { text: string; base: number; options: { label: string; count: number }[] }[] } | null;
}): StudyFinding[] {
  const candidates: StudyFinding[] = [];

  for (const g of input.comparableGroups) {
    const surveys = g.surveys.filter((s) => s.base > 0);
    if (surveys.length < 2) continue;
    const nOpts = Math.min(...surveys.map((s) => s.options.length));
    if (nOpts === 0) continue;

    // directlyComparable ⇒ identical option set/order → pool by index.
    const labels = surveys[0].options.slice(0, nOpts).map((o) => o.label);
    const pooled = Array.from({ length: nOpts }, (_, i) => surveys.reduce((a, s) => a + (s.options[i]?.count ?? 0), 0));
    const base = surveys.reduce((a, s) => a + s.base, 0);
    if (base < FINDING_MIN_BASE) continue;

    const order = pooled.map((c, i) => [c, i] as const).sort((a, b) => b[0] - a[0]);
    const [topCount, topIdx] = order[0];
    const [secondCount, secondIdx] = order[1] ?? [0, -1];
    const topPct = pctInt(topCount, base);
    const secondPct = secondIdx >= 0 ? pctInt(secondCount, base) : 0;
    const consistent = surveys.every((s) => leaderIndex(s.options, nOpts) === topIdx);

    candidates.push({
      id: `lead-${g.canonicalKey}`,
      kind: consistent ? "consistent" : "leading",
      eyebrow: consistent ? "Consistent across surveys" : "Leading response",
      question: g.text,
      text: `${labels[topIdx]} was the most selected answer at ${topPct}%${secondIdx >= 0 ? `, ahead of ${labels[secondIdx]} at ${secondPct}%` : ""}.${consistent ? " It led in both surveys." : ""}`,
      base,
      emphasis: "supporting",
      tone: "neutral",
      evidence: {
        surveys: surveys.map((s) => s.surveyName),
        option: labels[topIdx],
        pct: topPct,
        runnerUp: secondIdx >= 0 ? { option: labels[secondIdx], pct: secondPct } : undefined,
        perSurvey: surveys.map((s) => ({ name: s.surveyName, pct: pctInt(s.options[topIdx]?.count ?? 0, s.base) })),
      },
    });

    // Change — only when beyond the combined margin of error, presented neutrally.
    const first = surveys[0], last = surveys[surveys.length - 1];
    if (first.base >= FINDING_MIN_BASE && last.base >= FINDING_MIN_BASE) {
      const p1 = pctInt(first.options[topIdx]?.count ?? 0, first.base);
      const p2 = pctInt(last.options[topIdx]?.count ?? 0, last.base);
      const pp = p2 - p1;
      const moe = (marginOfError(first.base) ?? 0) + (marginOfError(last.base) ?? 0);
      if (pp !== 0 && Math.abs(pp) > moe) {
        candidates.push({
          id: `chg-${g.canonicalKey}`,
          kind: "change",
          eyebrow: "Shift across surveys",
          question: g.text,
          text: `${labels[topIdx]} went from ${p1}% in ${first.surveyName} to ${p2}% in ${last.surveyName}.`,
          base: first.base + last.base,
          emphasis: "supporting",
          tone: "neutral",
          delta: { pp },
          evidence: { surveys: [first.surveyName, last.surveyName], option: labels[topIdx], pct: p2, perSurvey: [{ name: first.surveyName, pct: p1 }, { name: last.surveyName, pct: p2 }] },
        });
      }
    }
  }

  // Single-survey fallback: leading response per question (no cross-survey claims).
  if (candidates.length === 0 && input.singleSurvey) {
    input.singleSurvey.questions.forEach((q, qi) => {
      if (q.base < FINDING_MIN_BASE || q.options.length === 0) return;
      const order = q.options.map((o, i) => [o.count, i] as const).sort((a, b) => b[0] - a[0]);
      const [tc, ti] = order[0];
      const [sc, si] = order[1] ?? [0, -1];
      candidates.push({
        id: `lead1-${qi}`,
        kind: "leading", eyebrow: "Leading response", question: q.text,
        text: `${q.options[ti].label} was the most selected answer at ${pctInt(tc, q.base)}%${si >= 0 ? `, ahead of ${q.options[si].label} at ${pctInt(sc, q.base)}%` : ""}.`,
        base: q.base, emphasis: "supporting", tone: "neutral",
        evidence: { surveys: [input.singleSurvey!.surveyName], option: q.options[ti].label, pct: pctInt(tc, q.base), runnerUp: si >= 0 ? { option: q.options[si].label, pct: pctInt(sc, q.base) } : undefined },
      });
    });
  }

  // One finding per question (a significant change supersedes its leading finding).
  const byQuestion = new Map<string, StudyFinding>();
  for (const f of candidates) {
    const prev = byQuestion.get(f.question);
    if (!prev) { byQuestion.set(f.question, f); continue; }
    if (f.kind === "change" && prev.kind !== "change") byQuestion.set(f.question, f);
  }
  const chosen = [...byQuestion.values()];
  // Rank: a significant change is most newsworthy; otherwise the strongest share.
  const score = (f: StudyFinding) => (f.kind === "change" ? 1000 + Math.abs(f.delta?.pp ?? 0) : f.evidence.pct);
  chosen.sort((a, b) => score(b) - score(a));
  const capped = chosen.slice(0, 4);
  if (capped[0]) capped[0].emphasis = "primary";
  return capped;
}
