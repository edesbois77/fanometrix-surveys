// Coverage: how much of what we set out to learn we now know
// (docs/intelligence-model.md §4 Layer 4).
//
// Computed at the INFORMATION NEED, rolled up to the requirement, rolled up to
// the question. At no level is it asserted (invariant 11). This replaces the
// shipped gap logic, which inferred a gap from an absent source type and
// therefore told every conversation-only project that it was missing survey and
// document evidence on every aspect, three times over. A gap is an unanswered
// need, never an absent source.
//
// PURE. The honest denominator is the needs the research design declared, not
// the evidence that happened to arrive.
import type { ConfidenceLevel } from "@/lib/analysis/types";

/** What we can say about one information need. Ordered worst to best, because
 *  the rollup takes the weakest view of a requirement rather than the average:
 *  a requirement with one open need is not "mostly answered". */
export type NeedState =
  | "open"          // no finding yet. Nobody has examined this.
  | "unanswerable"  // examined, and the evidence does not answer it (a null finding)
  | "weak"          // answered, but only at Low confidence
  | "answered";     // answered at Medium or better

/** What a person is shown. The internal vocabulary never reaches a screen
 *  (Principle 18: the reasoning model is not the interface). */
export const NEED_STATE_LABEL: Record<NeedState, string> = {
  open:         "Not yet examined",
  unanswerable: "Could not be established",
  weak:         "Answered, but not confidently",
  answered:     "Answered",
};

/** The minimum a finding must carry to count a need as answered. A Low-confidence
 *  finding is real intelligence and is reported, but it does not let a
 *  requirement claim to be answered. */
export type NeedFinding = {
  confidence: ConfidenceLevel;
  /** True for a null finding: the claim IS that the evidence does not answer
   *  this. It closes the question of whether anyone looked, and deliberately
   *  does not close the question itself. */
  isAbsence: boolean;
};

export type NeedCoverage = {
  needId: string;
  state: NeedState;
  findings: number;
};

export function coverageForNeed(needId: string, findings: NeedFinding[]): NeedCoverage {
  const positive = findings.filter(f => !f.isAbsence);
  const state: NeedState =
    positive.some(f => f.confidence !== "Low") ? "answered"
    : positive.length > 0 ? "weak"
    : findings.some(f => f.isAbsence) ? "unanswerable"
    : "open";
  return { needId, state, findings: findings.length };
}

// ── Rollup ───────────────────────────────────────────────────────────────────

export type CoverageLevel = "complete" | "substantial" | "partial" | "open";

export type Coverage = {
  level: CoverageLevel;
  total: number;
  answered: number;
  weak: number;
  unanswerable: number;
  open: number;
  /** Plain-language, client-safe. Says what was answered AND what was not,
   *  because a coverage statement that only reports success is marketing. */
  statement: string;
};

export function rollUpCoverage(needs: NeedCoverage[]): Coverage {
  const total = needs.length;
  const count = (s: NeedState) => needs.filter(n => n.state === s).length;
  const answered = count("answered");
  const weak = count("weak");
  const unanswerable = count("unanswerable");
  const open = count("open");

  const level: CoverageLevel =
    total === 0 ? "open"
    : answered === total ? "complete"
    // "Substantial" requires that everything was at least looked at. An
    // unexamined need is a different kind of incompleteness from one we examined
    // and could not answer, and collapsing them lets silence read as diligence.
    : open === 0 && answered >= Math.ceil(total / 2) ? "substantial"
    : answered + weak > 0 ? "partial"
    : "open";

  return { level, total, answered, weak, unanswerable, open, statement: coverageStatement({ total, answered, weak, unanswerable, open }) };
}

function coverageStatement(c: { total: number; answered: number; weak: number; unanswerable: number; open: number }): string {
  if (c.total === 0) return "No information needs have been declared for this requirement yet.";

  const of = (n: number) => `${n} of ${c.total}`;
  const parts: string[] = [`${of(c.answered)} question${c.total === 1 ? "" : "s"} answered`];
  if (c.weak > 0) parts.push(`${c.weak} answered but not confidently`);
  if (c.unanswerable > 0) parts.push(`${c.unanswerable} examined without finding an answer`);
  if (c.open > 0) parts.push(`${c.open} not yet examined`);

  return `${parts.join(", ")}.`;
}

/** Compose requirement-level coverage into question or project level. The same
 *  reduction at every altitude, so a three-source project and a three-hundred
 *  source programme are the same shape (Principle 20). */
export function combineCoverage(parts: Coverage[]): Coverage {
  const zero: Omit<Coverage, "level" | "statement"> = { total: 0, answered: 0, weak: 0, unanswerable: 0, open: 0 };
  const sum = parts.reduce((a, p) => ({
    total: a.total + p.total, answered: a.answered + p.answered, weak: a.weak + p.weak,
    unanswerable: a.unanswerable + p.unanswerable, open: a.open + p.open,
  }), zero);

  // Rebuild from synthetic needs so the level rule lives in exactly one place.
  const synthetic: NeedCoverage[] = [
    ...Array.from({ length: sum.answered }, (_, i) => ({ needId: `a${i}`, state: "answered" as NeedState, findings: 1 })),
    ...Array.from({ length: sum.weak }, (_, i) => ({ needId: `w${i}`, state: "weak" as NeedState, findings: 1 })),
    ...Array.from({ length: sum.unanswerable }, (_, i) => ({ needId: `u${i}`, state: "unanswerable" as NeedState, findings: 1 })),
    ...Array.from({ length: sum.open }, (_, i) => ({ needId: `o${i}`, state: "open" as NeedState, findings: 0 })),
  ];
  return rollUpCoverage(synthetic);
}
