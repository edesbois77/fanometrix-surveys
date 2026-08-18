// ── Survey Studio — Reports V1 (Slice A.2) — Executive editorial composer ────
// Completes the architecture's "AI Editorial Plan" node for the Executive page (Slice A reused
// the theme composer as a stub). The AI acts ONLY as editor: it writes the conclusion headline,
// a tight interpretation ("what we found"), chooses a HERO MODE (single | tension | none) and
// which GOVERNED option(s) to feature, and writes a specific Bottom Line + its form. It never
// supplies a number — the server owns every value. Output is deterministically verified with the
// same governance guards as the rest of Reports (banned language incl. the report "significant"
// ban, ref-strip, unsupported-number, cross-question, headline-not-category), plus editorial
// checks (tight synthesis, no recommendation-creep in the interpretation, hero labels must be
// governed, Bottom Line must not be generic). Nothing FedEx/sport/sponsorship-specific.

import { bannedLanguageReasons, stripInlineRefs, containsInlineRef, crossQuestionComparisonReasons } from "@/lib/studio/study-analysis";
import { unsupportedNumbers, reportProseReasons, headlineIsCategory, type ReportComposerInput, type ReportGovernance } from "@/lib/studio/report/report-domain";
import { resolveVisualEvidence, primaryDistribution, studyHeroStats } from "@/lib/studio/report/visual-evidence";
import { completeJSON } from "@/lib/intelligence/openai";

export const EXEC_COMPOSER_VERSION = "studio-exec-composer-v2";
export type HeroMode = "single" | "tension" | "dominance" | "none";
export type BottomLineForm = "implication" | "tension" | "opportunity" | "caution" | "recommendation";
export type ExecutivePlan = {
  headline: string;
  whatWeFound: string;                                   // interpretation ONLY (no recommendations)
  hero: { mode: HeroMode; primaryOption?: string | null; tensionOption?: string | null; note?: string | null };
  bottomLine: { text: string; form: BottomLineForm };
};

export const EXEC_PLAN_BUDGETS = { headlineWords: 14, whatWeFoundWords: 50, bottomLineWords: 26, heroNoteWords: 16 };
const words = (s: string) => (s ?? "").trim().split(/\s+/).filter(Boolean).length;
const clean = (s: string) => stripInlineRefs(s ?? "");
const contentWords = (s: string) => {
  const stop = new Set(["the", "and", "for", "with", "from", "into", "that", "this", "are", "its", "but", "not", "how", "why", "what", "across", "among", "their", "than", "then", "they", "who", "our", "you", "your", "more", "most", "some", "many", "few"]);
  return new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !stop.has(w)));
};

// "What we found" is interpretation — recommendation language belongs to the Bottom Line / later.
const RECO_VERB = /\b(should|must|need(?:s)? to|a need (?:to|for)|recommend|enhance|leverage|invest in|prioriti[sz]e|focus on|ought to|drive|improve|optimi[sz]e|maximi[sz]e|tailor)\b/i;
// Generic consultancy filler that could be written before seeing any study.
const GENERIC_FILLER = /\b(tailor|leverage|optimi[sz]e|maximi[sz]e|unlock|synerg|targeted marketing|engagement strateg|drive engagement|enhance visibility|best practice|going forward|holistic)\b/i;

const HERO_MODES: HeroMode[] = ["single", "tension", "dominance", "none"];
// "Dominance" must be a genuinely clear lead, not a near-tie dressed up. If the leader is within
// this many points of the runner-up, it is a TENSION, not dominance. Generic editorial rule.
const DOMINANCE_MIN_LEAD_PP = 10;

/** The leader's point-lead over the runner-up in whichever governed distribution holds the label
 *  (server-computed; null if the label is not a distribution option). */
function dominanceLeadPP(label: string, gov: ReportGovernance): number | null {
  for (const dist of gov.distributions.values()) {
    const opt = dist.options.find((o) => o.label === label);
    if (opt) {
      const runnerUp = dist.options.filter((o) => o.label !== label).sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))[0];
      if (!runnerUp) return null;
      return Math.round(((opt.percentage ?? 0) - (runnerUp.percentage ?? 0)) * 1000) / 10;
    }
  }
  return null;
}
const FORMS: BottomLineForm[] = ["implication", "tension", "opportunity", "caution", "recommendation"];

/** Labels the hero may reference — the governed primary distribution's options + governed base stats. */
export function allowedHeroLabels(input: ReportComposerInput, gov: ReportGovernance): Set<string> {
  const ve = resolveVisualEvidence(input, gov);
  const labels = new Set<string>();
  const pd = primaryDistribution(ve);
  if (pd) for (const o of pd.options) labels.add(o.label);
  for (const s of studyHeroStats(ve, 6)) labels.add(s.label);
  return labels;
}

/** Anchors a Bottom Line must connect to — the study's own conclusion vocabulary. */
function studyAnchors(input: ReportComposerInput, headline: string): Set<string> {
  const a = new Set<string>();
  for (const w of contentWords(headline)) a.add(w);
  for (const f of input.findings) for (const w of contentWords(f.headline)) a.add(w);
  return a;
}

export function bottomLineIsGeneric(text: string, anchors: Set<string>): boolean {
  const cw = contentWords(text);
  const overlap = [...cw].filter((w) => anchors.has(w)).length;
  if (overlap === 0) return true;                        // says nothing specific to THIS study
  if (GENERIC_FILLER.test(text) && overlap < 2) return true; // filler with only a token anchor
  return false;
}

export type PlanVerify = { ok: boolean; reasons: string[] };
export function verifyExecutivePlan(plan: ExecutivePlan, input: ReportComposerInput, gov: ReportGovernance): PlanVerify {
  const reasons: string[] = [];
  const distinctQ = new Set(input.findings.flatMap((f) => f.evidence.map((e) => e.canonicalQuestionKey).filter(Boolean))).size;
  const prose = (t: string) => {
    const r: string[] = [];
    if (containsInlineRef(t)) r.push("internal evidence ref leaked into prose");
    r.push(...bannedLanguageReasons(t), ...reportProseReasons(t), ...crossQuestionComparisonReasons(t, distinctQ));
    const bad = unsupportedNumbers(t, gov.governedNumbers);
    if (bad.length) r.push(`unsupported statistic(s) not backed by a Finding: ${bad.join(", ")}`);
    return r;
  };

  // Headline — a conclusion, budgeted, governed.
  if (!plan.headline?.trim()) reasons.push("missing headline");
  else {
    if (words(plan.headline) > EXEC_PLAN_BUDGETS.headlineWords) reasons.push("headline exceeds budget");
    if (headlineIsCategory(plan.headline)) reasons.push("headline is a category label, not a conclusion");
    reasons.push(...prose(plan.headline));
  }

  // What we found — interpretation only, tight, no recommendation creep.
  if (!plan.whatWeFound?.trim()) reasons.push("missing what-we-found synthesis");
  else {
    if (words(plan.whatWeFound) > EXEC_PLAN_BUDGETS.whatWeFoundWords) reasons.push(`synthesis is too long (>${EXEC_PLAN_BUDGETS.whatWeFoundWords} words)`);
    if (RECO_VERB.test(plan.whatWeFound)) reasons.push("the synthesis contains recommendation language — 'what we found' explains the evidence; put advice in the bottom line");
    reasons.push(...prose(plan.whatWeFound));
  }

  // Hero — mode valid; referenced options must be GOVERNED labels; server supplies values
  // (including the pp gap for tension/dominance — never the model).
  const allowed = allowedHeroLabels(input, gov);
  const h = plan.hero;
  if (!h || !HERO_MODES.includes(h.mode)) reasons.push("invalid hero mode");
  else if (h.mode !== "none") {
    if (!h.primaryOption || !allowed.has(h.primaryOption)) reasons.push("hero primary option is not a governed result");
    if (h.mode === "tension") {
      if (!h.tensionOption || !allowed.has(h.tensionOption)) reasons.push("hero tension option is not a governed result");
      if (h.primaryOption && h.tensionOption && h.primaryOption === h.tensionOption) reasons.push("hero tension needs two distinct options");
    }
    // dominance needs only the leader (primaryOption); the server derives the runner-up + lead.
    // But the lead must be genuinely clear — a near-tie is a tension, not dominance.
    if (h.mode === "dominance" && h.primaryOption) {
      const lead = dominanceLeadPP(h.primaryOption, gov);
      if (lead != null && lead < DOMINANCE_MIN_LEAD_PP) reasons.push(`dominance is not supported — "${h.primaryOption}" leads by only ${lead}pp; use "tension" (or "single")`);
    }
    // An OPTIONAL short editorial note is governed like all other prose (no new number/claim).
    if (h.note) {
      if (words(h.note) > EXEC_PLAN_BUDGETS.heroNoteWords) reasons.push("hero note is too long");
      reasons.push(...prose(h.note));
    }
  }

  // Bottom line — grounded, specific, budgeted, valid form.
  if (!plan.bottomLine?.text?.trim()) reasons.push("missing bottom line");
  else {
    if (words(plan.bottomLine.text) > EXEC_PLAN_BUDGETS.bottomLineWords) reasons.push("bottom line exceeds budget");
    if (!FORMS.includes(plan.bottomLine.form)) reasons.push("invalid bottom-line form");
    if (bottomLineIsGeneric(plan.bottomLine.text, studyAnchors(input, plan.headline ?? ""))) reasons.push("the bottom line is too generic — connect it to THIS study's specific conclusion (could it have been written before seeing the evidence?)");
    reasons.push(...prose(plan.bottomLine.text));
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function buildExecutiveComposePrompt(input: ReportComposerInput, gov: ReportGovernance): string {
  const findings = input.findings.map((f) => {
    const ev = f.evidence.map((e) => `      - [${e.class}] ${e.label}`).join("\n");
    return `  FINDING ${f.id}\n    headline: ${f.headline}\n    commentary: ${f.commentary ?? "(none)"}\n    evidence:\n${ev}`;
  }).join("\n");
  const heroOptions = [...allowedHeroLabels(input, gov)];
  return `You are a senior research editor at Fanometrix writing PAGE ONE (the Executive page) of a client report from a Study's HUMAN-APPROVED findings. You ORGANISE and INTERPRET approved intelligence — you never analyse raw data, compute a figure, or invent a conclusion. Page one must orient the reader in ~20 seconds: why the research was done, the central conclusion, the evidence, and what it means. The data does the showing; your words are tight.

STUDY OBJECTIVE: ${input.study.objective}

APPROVED FINDINGS (the ONLY source of claims — never invent one):
${findings}

GOVERNED RESULT OPTIONS available to feature as a hero (you may reference these EXACT labels; the system supplies the numbers — you never write the value):
${heroOptions.map((l) => `  - ${l}`).join("\n") || "  (none)"}

Produce a tight editorial plan:

1. HEADLINE — the central CONCLUSION, containing a verb, never a category ("Survey results", "Sponsorship perceptions"). Aim for 6–10 words (≤14 hard max): punchy and sharp, not a descriptive sentence. It must say what the research concluded. Two tests: could it have been written BEFORE seeing the results (too generic)? Does it overstate what the evidence supports (too strong)? If either, rewrite.

2. WHAT WE FOUND — ≤50 words (2–3 short sentences) that INTERPRET the evidence: the central conclusion + the key qualification/tension. This is explanation, NOT advice — do NOT include recommendations ("should", "enhance", "invest", "focus on", "tailor"). Let the chart and hero numbers carry the figures — do NOT restate the hero/chart percentages in the prose; say what they MEAN.

3. HERO — choose how to headline the evidence visually (the system renders the numbers LARGE as the page's focal graphic; you only choose the mode + labels):
   - "single": one governed option best captures the story → give its exact label as primaryOption.
   - "tension": TWO governed options whose closeness or contrast is the story → primaryOption + tensionOption (both exact labels, from the SAME question). The system shows both and the point-gap between them. Use ONLY when both legitimately support the SAME central conclusion.
   - "dominance": one option LEADS and the size of its lead is the story → primaryOption = the leading label. The system shows it and its lead over the next option.
   - "none": no single statistic deserves hero treatment → the page stands on the headline + chart.
   Never combine or add options into a new percentage; never imply a grouped label means sentiment it doesn't. Pick labels only from the governed list above.
   Optionally add "note": ONE short editorial line (≤16 words) that explains the relationship shown, grounded in the approved findings (e.g. why a close split matters). Omit it if you have nothing precise to add — the visual must work without it. No new numbers, no recommendations, no "significant".

4. BOTTOM LINE — the single "so what" in ≤26 words, and its form. It MUST be specific to THIS study's conclusion (not generic advice that could fit any report — avoid "tailor strategies", "enhance visibility", "leverage", "targeted marketing"). Choose the most fitting grounded form:
   - "implication" (strategic consequence) · "tension" (the core unresolved tension) · "opportunity" · "caution" · "recommendation" (only if the findings directly support an action).

CALIBRATION: a plurality is NOT a majority; a leading option is not "most people"; a combined/grouped share is a selection total, not sentiment; a difference is not a "significant" difference; correlation is not causation. Do NOT use the word "significant"/"significantly". Do not compare two different questions' percentages as a numeric gap.

Return ONLY valid JSON:
{"headline":"a conclusion","whatWeFound":"2-3 sentence interpretation","hero":{"mode":"single|tension|dominance|none","primaryOption":"<exact governed label or null>","tensionOption":"<exact governed label or null>","note":"<optional ≤16-word line or null>"},"bottomLine":{"text":"the specific so-what","form":"implication|tension|opportunity|caution|recommendation"}}
No prose outside the JSON.`;
}

export type CompleteFn = typeof completeJSON;
const bounded = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Compose + verify the Executive plan (one constrained repair). Returns the cleaned plan. */
export async function composeExecutivePlan(
  input: ReportComposerInput, gov: ReportGovernance, opts?: { complete?: CompleteFn },
): Promise<{ ok: boolean; plan?: ExecutivePlan; error?: string; reasons?: string[] }> {
  const complete = opts?.complete ?? completeJSON;
  let plan: ExecutivePlan;
  try { plan = await complete<ExecutivePlan>({ prompt: buildExecutiveComposePrompt(input, gov), model: "gpt-4o", temperature: 0.25, maxTokens: 900 }); }
  catch (e) { return { ok: false, error: `The report composer was unavailable (${bounded(e)}).` }; }
  let verdict = verifyExecutivePlan(plan, input, gov);
  for (let attempt = 0; attempt < 2 && !verdict.ok; attempt++) {
    try {
      const repaired = await complete<ExecutivePlan>({ prompt: `${buildExecutiveComposePrompt(input, gov)}\n\nA previous draft was REJECTED for: ${verdict.reasons.join("; ")}. Fix ONLY those problems and change nothing else. Keep everything grounded in the approved findings.`, model: "gpt-4o", temperature: 0.2, maxTokens: 900 });
      const v2 = verifyExecutivePlan(repaired, input, gov);
      if (v2.ok) { plan = repaired; verdict = v2; break; }
      verdict = v2;
    } catch { /* fall through */ }
  }
  if (!verdict.ok) return { ok: false, error: "The executive page did not pass governance checks.", reasons: verdict.reasons };
  return { ok: true, plan: {
    headline: clean(plan.headline), whatWeFound: clean(plan.whatWeFound),
    hero: { mode: plan.hero.mode, primaryOption: plan.hero.primaryOption ?? null, tensionOption: plan.hero.tensionOption ?? null, note: plan.hero.note ? clean(plan.hero.note) : null },
    bottomLine: { text: clean(plan.bottomLine.text), form: plan.bottomLine.form },
  } };
}
