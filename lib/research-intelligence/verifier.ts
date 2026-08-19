// ── Research Reasoner — evidence/authority verifier ──────────────────────────
// The deterministic boundary. The reasoner (OpenAI) is analytical intelligence; it is
// NOT authority. This verifier checks every material claim against the governed evidence
// package and fails closed where it cannot defend the claim. It REUSES the production
// firewall (one firewall, not a copy): ref resolution + banned-language / respondent-
// correlation / cross-question / grouped-share / prescription guards are imported from
// the same validators the deterministic analysis already trusts. The one primitive the
// firewall never had — reconciling a NUMBER quoted in prose against the cited evidence —
// is added here (aggregate survey prose must never assert a figure that is not in the
// cited evidence, in particular a summed/ungoverned combined share).
//
// Contract preserved from the validated prototype (see Research-Reasoner report):
//   PASS   → eligible for product
//   SOFTEN → language overreaches the evidence; product must qualify or drop it
//   REJECT → fabricated ref/number; must never reach the product (fail closed)
import {
  makeRefResolver, bannedLanguageReasons, respondentCorrelationReasons,
  crossQuestionComparisonReasons, groupedShareSemanticReasons,
} from "@/lib/studio/study-analysis";
import { hasPrescription } from "@/lib/studio/analysis-quality";
import type { ReasonerOutput } from "./reasoning-schema";

export type ClaimVerdict = "PASS" | "SOFTEN" | "REJECT";
export type VerifiedClaim = { where: string; type?: string; text: string; verdict: ClaimVerdict; reasons: string[] };
export type VerificationReport = { claims: VerifiedClaim[]; fabricatedRefs: string[]; fabricatedNumbers: string[]; counts: { pass: number; soften: number; reject: number } };

/** Everything a per-claim check needs, built once from the evidence package. */
export type ClaimContext = {
  resolve: (raw: unknown) => string | null;
  numbersByRef: Map<string, number[]>;
  groupedShareRefs: Set<string>;
  refToQuestion: Map<string, string>;
};

const NUM_TOLERANCE = 0.6; // pp — the model's rounding vs our 1dp figures
const pctIn = (text: string): number[] => [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Math.round(parseFloat(m[1]) * 10) / 10);

export function buildClaimContext(input: { validRefs: Set<string>; numbersByRef: Map<string, number[]>; groupedShareRefs: Set<string>; refToQuestion: Map<string, string> }): ClaimContext {
  return { resolve: makeRefResolver([...input.validRefs].map((ref) => ({ ref }))), numbersByRef: input.numbersByRef, groupedShareRefs: input.groupedShareRefs, refToQuestion: input.refToQuestion };
}

/** Verify a single claim's prose + cited refs. Pure; the one source of truth for a verdict. */
export function verifyClaimText(
  ctx: ClaimContext,
  text: string,
  refs: string[],
  opts: { requireRefs: boolean; type?: string; boundary?: boolean },
): { verdict: ClaimVerdict; reasons: string[]; badRefs: string[]; badNums: string[]; knownRefs: string[] } {
  const reasons: string[] = [];
  const badRefs: string[] = [];
  const badNums: string[] = [];
  const known = refs.map((r) => ctx.resolve(r)).filter(Boolean) as string[];

  // Boundary statements (openQuestions / cannotConclude) are META-COMMENTARY: they carry
  // no measured claim and legitimately NAME significance/causal/temporal concepts in order
  // to DISCLAIM them. Record but never grade — grading them would punish honest humility.
  if (opts.boundary) return { verdict: "PASS", reasons: [], badRefs, badNums, knownRefs: known };

  // 1. Ref existence — fail closed for a substantive claim with no valid / a fabricated ref.
  for (const r of refs) if (!ctx.resolve(r)) { reasons.push(`fabricated/unknown evidence ref: ${String(r).slice(0, 40)}`); badRefs.push(String(r)); }
  if (opts.requireRefs && known.length === 0) reasons.push("no valid evidence ref supports this claim");

  // 2. Number reconciliation — every % quoted must match a number carried by a cited ref.
  const allowed = new Set<number>();
  for (const r of known) for (const n of ctx.numbersByRef.get(r) ?? []) allowed.add(n);
  for (const qn of pctIn(text)) {
    if (![...allowed].some((a) => Math.abs(a - qn) <= NUM_TOLERANCE)) { reasons.push(`quoted ${qn}% is not supported by the cited evidence (likely a summed/fabricated figure)`); badNums.push(`${qn}%`); }
  }

  // 3. Banned language (reuse the production firewall verbatim).
  reasons.push(...bannedLanguageReasons(text));
  reasons.push(...respondentCorrelationReasons(text));
  reasons.push(...crossQuestionComparisonReasons(text, new Set(known.map((r) => ctx.refToQuestion.get(r)).filter(Boolean)).size));
  reasons.push(...groupedShareSemanticReasons(text, known.some((r) => ctx.groupedShareRefs.has(r))));

  // 4. Prescription — allowed ONLY inside a labelled implication.
  if (opts.type !== "implication" && hasPrescription(text)) reasons.push("prescriptive recommendation stated as if proven (allowed only as a labelled implication)");

  let verdict: ClaimVerdict = "PASS";
  if (badRefs.length || badNums.length || (opts.requireRefs && known.length === 0)) verdict = "REJECT";
  else if (reasons.length) verdict = "SOFTEN";
  return { verdict, reasons, badRefs, badNums, knownRefs: known };
}

export function verifyReasoning(
  out: ReasonerOutput,
  validRefs: Set<string>,
  numbersByRef: Map<string, number[]>,
  groupedShareRefs: Set<string>,
  refToQuestion: Map<string, string>,
): VerificationReport {
  const ctx = buildClaimContext({ validRefs, numbersByRef, groupedShareRefs, refToQuestion });
  const claims: VerifiedClaim[] = [];
  const fabricatedRefs: string[] = [];
  const fabricatedNumbers: string[] = [];
  const grade = (where: string, text: string, refs: string[], opts: { requireRefs: boolean; type?: string; boundary?: boolean }) => {
    const r = verifyClaimText(ctx, text, refs, opts);
    claims.push({ where, type: opts.type, text, verdict: r.verdict, reasons: r.reasons });
    fabricatedRefs.push(...r.badRefs); fabricatedNumbers.push(...r.badNums.map((n) => `${where}:${n}`));
  };

  grade("executiveStory", `${out.executiveStory.headline}. ${out.executiveStory.summary}`, out.executiveStory.evidenceRefs ?? [], { requireRefs: true });
  (out.insights ?? []).forEach((i) => grade(`insight:${i.id}`, `${i.title}. ${i.statement} ${i.whyItMatters} ${i.caveat}`, [...(i.evidenceRefs ?? []), ...(i.counterEvidenceRefs ?? [])], { requireRefs: true, type: i.type }));
  (out.supportingObservations ?? []).forEach((o, k) => grade(`observation#${k}`, o.statement, o.evidenceRefs ?? [], { requireRefs: true }));
  (out.tensions ?? []).forEach((t, k) => grade(`tension#${k}`, t.statement, t.evidenceRefs ?? [], { requireRefs: true }));
  [...(out.openQuestions ?? []), ...(out.cannotConclude ?? [])].forEach((s, k) => grade(`boundary#${k}`, s, [], { requireRefs: false, boundary: true }));

  const counts = { pass: 0, soften: 0, reject: 0 };
  for (const c of claims) counts[c.verdict === "PASS" ? "pass" : c.verdict === "SOFTEN" ? "soften" : "reject"]++;
  return { claims, fabricatedRefs: [...new Set(fabricatedRefs)], fabricatedNumbers: [...new Set(fabricatedNumbers)], counts };
}
