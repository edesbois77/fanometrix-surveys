// ── Survey Studio — question comparability foundation (pure) ─────────────────
// The MINIMAL, ontology-free anchor for future cross-Survey (Study) analysis. It
// establishes IDENTITY only — it never computes comparisons, and AI/text similarity
// must NEVER assign canonical identity.
//
//   • canonicalQuestionKey(q) = q.canonical_question_key ?? q.id
//       New questions are authored with canonical_question_key = own id (see
//       blankQuestion); Duplicate copies the questions jsonb verbatim, so cloned
//       questions share the key for free; older/historical questions without the
//       field fall back to their id — WITHOUT rewriting any stored jsonb.
//   • directlyComparable(A, B) is true ONLY when the two questions share a canonical
//       key AND their answer scale is compatible (same set of option ids). Same key
//       but a different scale, or identical wording under different keys, is NOT
//       directly comparable.

import type { LocalisedQuestion } from "@/lib/survey-locale";

/** The comparability key for a question — its explicit canonical key, else its id. */
export function canonicalQuestionKey(q: { id: string; canonical_question_key?: string | null }): string {
  const k = q.canonical_question_key;
  return typeof k === "string" && k.length > 0 ? k : q.id;
}

/** The set of option ids (as strings) — the answer scale. */
function optionIdSet(q: LocalisedQuestion): string[] {
  return q.options.map((o) => String(o.id)).sort();
}

/** Two questions have a COMPATIBLE answer scale iff they have the exact same set of
 *  option ids (so a percentage/count on one maps onto the other). Order-independent. */
export function compatibleAnswerScale(a: LocalisedQuestion, b: LocalisedQuestion): boolean {
  const sa = optionIdSet(a), sb = optionIdSet(b);
  return sa.length > 0 && sa.length === sb.length && sa.every((id, i) => id === sb[i]);
}

/**
 * DIRECTLY COMPARABLE ⇔ same canonical question key AND compatible answer scale.
 * This is the ONLY basis on which a future Study analysis may compute a quantitative
 * comparison or a combined base. Everything else is, at most, qualitative synthesis —
 * which this foundation does not build.
 */
export function directlyComparable(a: LocalisedQuestion, b: LocalisedQuestion): boolean {
  return canonicalQuestionKey(a) === canonicalQuestionKey(b) && compatibleAnswerScale(a, b);
}
