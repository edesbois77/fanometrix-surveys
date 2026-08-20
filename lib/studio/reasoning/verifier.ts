// ── Research Reasoner PROTOTYPE — evidence/authority verifier (ISOLATED) ──────
// NOT WIRED TO PRODUCTION. The reasoner (OpenAI) is analytical intelligence; it is NOT
// authority. This deterministic boundary checks every material claim it makes against
// the governed evidence package and fails closed where it cannot defend the claim.
//
// It REUSES the existing firewall (one firewall, not a copy): ref resolution and the
// banned-language / cross-question / respondent-correlation / grouped-share /
// prescription guards are imported from the production validators. The one primitive the
// firewall never had — reconciling a NUMBER quoted in prose against the cited evidence —
// is added here.

import {
  makeRefResolver, bannedLanguageReasons, respondentCorrelationReasons,
  crossQuestionComparisonReasons, groupedShareSemanticReasons,
} from "@/lib/studio/study-analysis";
import { hasPrescription } from "@/lib/studio/analysis-quality";
import type { ReasonerOutput } from "./reasoning-schema";

export type ClaimVerdict = "PASS" | "SOFTEN" | "REJECT";
export type VerifiedClaim = {
  where: string;              // executiveStory | insight:<id> | observation | tension
  type?: string;              // synthesis | interpretation | implication (for insights)
  text: string;
  verdict: ClaimVerdict;
  reasons: string[];          // why softened/rejected (empty ⇒ clean PASS)
};
export type VerificationReport = {
  claims: VerifiedClaim[];
  fabricatedRefs: string[];
  fabricatedNumbers: string[];
  counts: { pass: number; soften: number; reject: number };
};

const NUM_TOLERANCE = 0.6; // pp — allows the model's rounding vs our 1dp figures
const pctIn = (text: string): number[] =>
  [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Math.round(parseFloat(m[1]) * 10) / 10);

/** Verify one claim string against the refs it cites. */
function verifyClaim(
  where: string, text: string, refs: string[],
  resolve: (raw: unknown) => string | null,
  numbersByRef: Map<string, number[]>,
  groupedShareRefs: Set<string>,
  opts: { requireRefs: boolean; distinctQuestions: (refs: string[]) => number; type?: string },
): { claim: VerifiedClaim; badRefs: string[]; badNums: string[] } {
  const reasons: string[] = [];
  const badRefs: string[] = [];
  const badNums: string[] = [];

  // 1. Ref existence (fail closed for substantive claims with no valid ref).
  const resolved = refs.map((r) => ({ raw: r, ok: resolve(r) })).filter((x) => true);
  const known = resolved.filter((x) => x.ok).map((x) => x.ok!) as string[];
  for (const x of resolved) if (!x.ok) { reasons.push(`fabricated/unknown evidence ref: ${String(x.raw).slice(0, 60)}`); badRefs.push(String(x.raw)); }
  if (opts.requireRefs && known.length === 0) reasons.push("no valid evidence ref supports this claim");

  // 2. Number reconciliation — every % quoted must match a number carried by a cited ref.
  const allowed = new Set<number>();
  for (const r of known) for (const n of numbersByRef.get(r) ?? []) allowed.add(n);
  for (const q of pctIn(text)) {
    const ok = [...allowed].some((a) => Math.abs(a - q) <= NUM_TOLERANCE);
    if (!ok) { reasons.push(`quoted ${q}% is not supported by the cited evidence`); badNums.push(`${where}:${q}%`); }
  }

  // 3. Banned language (reuse the production firewall verbatim).
  reasons.push(...bannedLanguageReasons(text));
  reasons.push(...respondentCorrelationReasons(text));
  reasons.push(...crossQuestionComparisonReasons(text, opts.distinctQuestions(known)));
  reasons.push(...groupedShareSemanticReasons(text, known.some((r) => groupedShareRefs.has(r))));

  // 4. Prescription / recommendation theatre — allowed ONLY inside an implication.
  if (opts.type !== "implication" && hasPrescription(text)) reasons.push("prescriptive recommendation stated as if proven (allowed only as a labelled implication)");

  // Verdict: a fabricated ref or unsupported number is a hard REJECT (fail closed).
  // Banned-language / prescription is SOFTEN (the meaning may be salvageable by rewording),
  // except when there is no supporting evidence at all.
  let verdict: ClaimVerdict = "PASS";
  if (badRefs.length || badNums.length || (opts.requireRefs && known.length === 0)) verdict = "REJECT";
  else if (reasons.length) verdict = "SOFTEN";

  return { claim: { where, type: opts.type, text, verdict, reasons }, badRefs, badNums };
}

export function verifyReasoning(
  out: ReasonerOutput,
  validRefs: Set<string>,
  numbersByRef: Map<string, number[]>,
  groupedShareRefs: Set<string>,
  refToQuestion: Map<string, string>,
): VerificationReport {
  const resolve = makeRefResolver([...validRefs].map((ref) => ({ ref })));
  const distinctQuestions = (refs: string[]) => new Set(refs.map((r) => refToQuestion.get(r)).filter(Boolean)).size;

  const claims: VerifiedClaim[] = [];
  const fabricatedRefs: string[] = [];
  const fabricatedNumbers: string[] = [];
  const push = (v: ReturnType<typeof verifyClaim>) => { claims.push(v.claim); fabricatedRefs.push(...v.badRefs); fabricatedNumbers.push(...v.badNums); };

  push(verifyClaim("executiveStory", `${out.executiveStory.headline}. ${out.executiveStory.summary}`, out.executiveStory.evidenceRefs ?? [], resolve, numbersByRef, groupedShareRefs, { requireRefs: true, distinctQuestions }));
  for (const i of out.insights ?? [])
    push(verifyClaim(`insight:${i.id}`, `${i.title}. ${i.statement} ${i.whyItMatters} ${i.caveat}`, [...(i.evidenceRefs ?? []), ...(i.counterEvidenceRefs ?? [])], resolve, numbersByRef, groupedShareRefs, { requireRefs: true, distinctQuestions, type: i.type }));
  for (const o of out.supportingObservations ?? [])
    push(verifyClaim("observation", o.statement, o.evidenceRefs ?? [], resolve, numbersByRef, groupedShareRefs, { requireRefs: true, distinctQuestions }));
  for (const t of out.tensions ?? [])
    push(verifyClaim("tension", t.statement, t.evidenceRefs ?? [], resolve, numbersByRef, groupedShareRefs, { requireRefs: true, distinctQuestions }));
  // openQuestions / cannotConclude are boundary statements (no measured claim) — not ref-checked,
  // but still banned-language checked so they cannot smuggle a significance/causal claim.
  for (const s of [...(out.openQuestions ?? []), ...(out.cannotConclude ?? [])])
    push(verifyClaim("boundary", s, [], resolve, numbersByRef, groupedShareRefs, { requireRefs: false, distinctQuestions }));

  const counts = { pass: 0, soften: 0, reject: 0 };
  for (const c of claims) counts[c.verdict === "PASS" ? "pass" : c.verdict === "SOFTEN" ? "soften" : "reject"]++;
  return { claims, fabricatedRefs: [...new Set(fabricatedRefs)], fabricatedNumbers: [...new Set(fabricatedNumbers)], counts };
}
