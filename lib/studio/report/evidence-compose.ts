// ── Survey Studio — Reports V1 (Slice B) — Evidence page editorial composer ──
// The "AI Editorial Plan" node for PAGE 2 (the Evidence / Opportunity page). The AI writes only
// the conclusion headline, a short interpretation, and 2–3 grounded implications — it selects no
// numbers and no layout. The SERVER decides which governed stories are shown and owns every value.
// Verified with the same governance guards as Page 1 (banned language incl. the report
// "significant" ban, ref-strip, unsupported-number, cross-question, headline-not-category), plus:
// the headline must MOVE BEYOND the Page-1 topline (no repetition) and implications stay calibrated.

import { bannedLanguageReasons, stripInlineRefs, containsInlineRef, crossQuestionComparisonReasons } from "@/lib/studio/study-analysis";
import { unsupportedNumbers, reportProseReasons, headlineIsCategory, type ReportComposerInput, type ReportGovernance } from "@/lib/studio/report/report-domain";
import { completeJSON } from "@/lib/intelligence/openai";

export const EVIDENCE_COMPOSER_VERSION = "studio-evidence-composer-v1";
export type EvidenceImplication = { text: string; findingIds: string[] };
export type EvidencePlan = { headline: string; intro: string; implications: EvidenceImplication[] };

export const EVIDENCE_BUDGETS = { headlineWords: 14, introWords: 45, implicationWords: 26, maxImplications: 3 };
const words = (s: string) => (s ?? "").trim().split(/\s+/).filter(Boolean).length;
const clean = (s: string) => stripInlineRefs(s ?? "");
const contentWords = (s: string) => {
  const stop = new Set(["the", "and", "for", "with", "from", "into", "that", "this", "are", "its", "but", "not", "how", "why", "what", "across", "among", "their", "than", "then", "they", "who", "our", "you", "your", "more", "most", "some", "many", "few"]);
  return new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !stop.has(w)));
};
const jaccard = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const RECO_VERB = /\b(should|must|need(?:s)? to|a need (?:to|for)|recommend|enhance|leverage|invest in|prioriti[sz]e|focus on|ought to|drive|improve|optimi[sz]e|maximi[sz]e|tailor)\b/i;

export type EvidenceContext = { page1Headline: string; shownStories: string[] };

export type PlanVerify = { ok: boolean; reasons: string[] };
export function verifyEvidencePlan(plan: EvidencePlan, input: ReportComposerInput, gov: ReportGovernance, ctx: EvidenceContext): PlanVerify {
  const reasons: string[] = [];
  const known = (ids: string[]) => Array.isArray(ids) && ids.length > 0 && ids.every((id) => gov.findingIds.has(id));
  const distinctQ = new Set(input.findings.flatMap((f) => f.evidence.map((e) => e.canonicalQuestionKey).filter(Boolean))).size;
  const prose = (t: string) => {
    const r: string[] = [];
    if (containsInlineRef(t)) r.push("internal evidence ref leaked into prose");
    r.push(...bannedLanguageReasons(t), ...reportProseReasons(t), ...crossQuestionComparisonReasons(t, distinctQ));
    const bad = unsupportedNumbers(t, gov.governedNumbers);
    if (bad.length) r.push(`unsupported statistic(s) not backed by a Finding: ${bad.join(", ")}`);
    return r;
  };

  if (!plan.headline?.trim()) reasons.push("missing headline");
  else {
    if (words(plan.headline) > EVIDENCE_BUDGETS.headlineWords) reasons.push("headline exceeds budget");
    if (headlineIsCategory(plan.headline)) reasons.push("headline is a category label, not a conclusion");
    if (jaccard(contentWords(plan.headline), contentWords(ctx.page1Headline)) >= 0.6) reasons.push("the page-2 headline repeats the page-1 topline — move the story forward");
    reasons.push(...prose(plan.headline));
  }
  if (!plan.intro?.trim()) reasons.push("missing intro");
  else {
    if (words(plan.intro) > EVIDENCE_BUDGETS.introWords) reasons.push(`intro is too long (>${EVIDENCE_BUDGETS.introWords} words)`);
    if (RECO_VERB.test(plan.intro)) reasons.push("the intro contains recommendation language — put advice in the implications");
    reasons.push(...prose(plan.intro));
  }
  if (!Array.isArray(plan.implications) || plan.implications.length === 0) reasons.push("at least one implication is required");
  if ((plan.implications?.length ?? 0) > EVIDENCE_BUDGETS.maxImplications) reasons.push(`too many implications (>${EVIDENCE_BUDGETS.maxImplications})`);
  for (const im of plan.implications ?? []) {
    if (!im.text?.trim()) reasons.push("an implication is empty");
    if (im.text && words(im.text) > EVIDENCE_BUDGETS.implicationWords) reasons.push("an implication is too long");
    if (!known(im.findingIds)) reasons.push(`implication "${(im.text ?? "").slice(0, 36)}…" is not grounded in a selected finding`);
    reasons.push(...prose(im.text ?? ""));
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function buildEvidenceComposePrompt(input: ReportComposerInput, ctx: EvidenceContext): string {
  const findings = input.findings.map((f) => {
    const ev = f.evidence.map((e) => `      - [${e.class}] ${e.label}`).join("\n");
    return `  FINDING ${f.id}\n    headline: ${f.headline}\n    commentary: ${f.commentary ?? "(none)"}\n    evidence:\n${ev}`;
  }).join("\n");
  return `You are a senior research editor at Fanometrix writing PAGE TWO (the Evidence & Opportunity page) of a client report from a Study's HUMAN-APPROVED findings. Page one already delivered the topline conclusion: "${ctx.page1Headline}". Page two MOVES THE STORY FORWARD — it presents the rest of the evidence (how the picture varies, and what the opportunity is) and what the client should take from it. You never analyse raw data, compute a figure, or invent a conclusion.

APPROVED FINDINGS (the ONLY source of claims):
${findings}

THE SYSTEM WILL SHOW THESE GOVERNED VISUALS ON PAGE TWO (you write the words around them; you do not choose or state their numbers):
${ctx.shownStories.map((s) => `  - ${s}`).join("\n") || "  (none)"}

Write:
1. HEADLINE — the page-two CONCLUSION in ≤14 words, a verb-bearing conclusion (not a category), and DIFFERENT from the page-one topline above. Aim for 6–10 words.
2. INTRO — ≤45 words (1–2 sentences) that DESCRIBE what the rest of the evidence shows (e.g. how the picture varies, and where the clearest opportunity lies). Describe only — do NOT say what the client should or could DO (no "enhance", "improve", "clarify", "tailor", "focus", "invest"): all advice belongs in the implications. Do not restate the exact percentages, and do not imply any change over time.
3. IMPLICATIONS — 2–3 items, each ≤26 words, grounded in specific approved finding ids, calibrated: say what the client "may want to consider", not "doing X will improve Y" unless the evidence is causal. No new numbers, no "significant".

CALIBRATION: a plurality is not a majority; a leading answer is not "most people"; correlation is not causation; do not compare two different questions' percentages as a numeric gap; never use "significant"/"significantly".

Return ONLY valid JSON:
{"headline":"a conclusion","intro":"1-2 sentence interpretation","implications":[{"text":"a calibrated implication","findingIds":["<id>"]}]}
No prose outside the JSON.`;
}

export type CompleteFn = typeof completeJSON;
const bounded = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function composeEvidencePlan(
  input: ReportComposerInput, gov: ReportGovernance, ctx: EvidenceContext, opts?: { complete?: CompleteFn },
): Promise<{ ok: boolean; plan?: EvidencePlan; error?: string; reasons?: string[] }> {
  const complete = opts?.complete ?? completeJSON;
  let plan: EvidencePlan;
  try { plan = await complete<EvidencePlan>({ prompt: buildEvidenceComposePrompt(input, ctx), model: "gpt-4o", temperature: 0.25, maxTokens: 1100 }); }
  catch (e) { return { ok: false, error: `The report composer was unavailable (${bounded(e)}).` }; }
  let verdict = verifyEvidencePlan(plan, input, gov, ctx);
  for (let attempt = 0; attempt < 2 && !verdict.ok; attempt++) {
    try {
      const repaired = await complete<EvidencePlan>({ prompt: `${buildEvidenceComposePrompt(input, ctx)}\n\nA previous draft was REJECTED for: ${verdict.reasons.join("; ")}. Fix ONLY those problems and change nothing else. Keep everything grounded in the approved findings.`, model: "gpt-4o", temperature: 0.2, maxTokens: 1100 });
      const v2 = verifyEvidencePlan(repaired, input, gov, ctx);
      if (v2.ok) { plan = repaired; verdict = v2; break; }
      verdict = v2;
    } catch { /* fall through */ }
  }
  if (!verdict.ok) return { ok: false, error: "The evidence page did not pass governance checks.", reasons: verdict.reasons };
  return { ok: true, plan: { headline: clean(plan.headline), intro: clean(plan.intro), implications: plan.implications.map((im) => ({ text: clean(im.text), findingIds: im.findingIds })) } };
}
