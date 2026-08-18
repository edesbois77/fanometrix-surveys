// ── Survey Studio — Survey Analysis prompt (versioned, pure) ─────────────────
// The single-survey analyst instructions. Same OUTPUT CONTRACT + evidence-id
// scheme as the Study prompt (so the SAME validators parse it), but tuned for ONE
// survey of at most five questions: concise, synthesis-not-restatement, honest
// about historical limits. No batching (the evidence is small). The HARD
// governance prohibitions are enforced deterministically in the shared firewall
// (validateProposals / validateThemes / validateNarrative) — this only guides.

import type { StudyAnalysisEvidence, EvidenceItem } from "@/lib/studio/study-analysis";

export const SURVEY_ANALYSIS_PROVIDER = "openai";
export const SURVEY_ANALYSIS_MODEL = "gpt-4o";
export const SURVEY_STAGE1_PROMPT_VERSION = "survey-analysis-stage1-v2";
export const SURVEY_STAGE2_PROMPT_VERSION = "survey-analysis-stage2-v2";

const pctText = (p: number | null) => (p == null ? "n/a" : `${(p * 100).toFixed(1)}%`);

// Global short-id space e1..eN over [base evidence, derived, segment] — the SAME
// order the shared resolver uses (validateProposals(raw, evidence, [...derived, ...segment])).
function evidenceLines(payload: StudyAnalysisEvidence): string {
  const lines: string[] = [];
  payload.evidence.forEach((e: EvidenceItem, i) => {
    lines.push(`- id=e${i + 1} | Q="${e.question}" | option="${e.optionLabel}" | ${e.count} of ${e.base} (${pctText(e.percentage)})${e.resultMode === "historical" ? " | (historical, completed-only)" : ""}`);
  });
  return lines.join("\n");
}
function derivedLines(payload: StudyAnalysisEvidence): string {
  const base = payload.evidence.length;
  return (payload.derived ?? []).map((d, i) => `- id=e${base + i + 1} | ${d.kind.toUpperCase()} | Q="${d.question}" | ${d.label}`).join("\n");
}
function segmentLines(payload: StudyAnalysisEvidence): string {
  const offset = payload.evidence.length + (payload.derived ?? []).length;
  return (payload.segmentDerived ?? []).map((d, i) => `- id=e${offset + i + 1} | ${d.dimension.toUpperCase()} | Q="${d.question}" | ${d.label}`).join("\n");
}
function historyNote(payload: StudyAnalysisEvidence): string {
  const historical = payload.evidence.some((e) => e.resultMode === "historical");
  return historical
    ? `NOTE ON THIS SURVEY'S DATA: these are COMPLETED-response answers only, and only the survey's first questions were captured (this survey pre-dates per-answer capture). Analyse ONLY what is supplied; never imply later questions or partial-response coverage were analysed.`
    : "";
}

export function buildSurveyStage1Prompt(payload: StudyAnalysisEvidence, objective: string | null): string {
  const s = payload.study;
  const dl = derivedLines(payload);
  const sl = segmentLines(payload);
  return `You are a senior research analyst at Fanometrix analysing ONE survey (at most five questions). Interrogate the complete governed evidence and surface the distinct analytical avenues worth considering. This is analysis, not a final report. Numbers come ONLY from the supplied evidence; the SERVER has already computed the arithmetic (derived facts) — never do your own.

SURVEY: ${s.name} · ${new Set(payload.evidence.map((e) => e.canonicalQuestionKey)).size} question(s) · ${s.completedResponses} completed responses (operational total, NOT a base).
${objective ? `OBJECTIVE (for relevance): ${objective}` : "No stated objective — review neutrally."}
${historyNote(payload) ? `\n${historyNote(payload)}\n` : ""}
BASE EVIDENCE (cite the short id "id=eN"):
${evidenceLines(payload)}

DERIVED FACTS (system-computed — cite their ids for a lead, a top-two combined share; do NOT compute your own):
${dl || "(none)"}
${sl ? `\nAUDIENCE FACTS (server-computed differences/consistency BY MARKET or DEVICE — cite these to test whether the story holds by group; say "respondents in/among <group>", NEVER a national trait, NEVER a partner effect, NEVER "statistically significant"):\n${sl}\n` : ""}
YOUR JOB — SYNTHESIS, NOT RESTATEMENT. Do NOT merely turn "32% chose A, 30% chose B" into "opinion is divided" — that observation already exists. Ask instead: what does this survey COLLECTIVELY say about its subject, and what does each result MEAN in that context? Deliberately look for:
- what the dominant / divided / minority patterns actually reveal about the research subject
- how questions REINFORCE, QUALIFY, or sit in TENSION with each other (describe the MEANING, never the numeric gap between different questions)
- where AUDIENCE facts materially change or strengthen the reading (a market/device difference may be a finding, supporting evidence, or omitted — your judgement)
- an honest read of what the evidence can and cannot support

WORTH SAYING, not just VALID. A conclusion earns a place ONLY if it is MATERIAL (a strong preference, a clear lead, a meaningful market/device contrast), DISTINCTIVE, or a genuine SYNTHESIS across questions that adds meaning beyond reading the results one by one. Restating a near-even distribution as "opinion is split / responses were mixed / no clear winner" is NOT a finding — that is a RESULT; leave it to Results and do not wrap prose around it.

PERMISSION TO OMIT: it is CORRECT to return NO proposal for a question, and few — even ZERO — proposals overall, when the evidence yields nothing a decision-maker would act on. Prefer 2–4 genuinely useful conclusions over 3 good ones plus 5 fillers. Do NOT manufacture a finding per question.

NO PRESCRIPTION: state what the evidence SHOWS and what it MEANS. Do NOT prescribe actions the survey did not test — no "X should launch/invest/target/roll out", no "brands should…", no "we recommend…", no "potential to leverage the sponsorship for…". Evidence-grounded interpretation is welcome; strategic advice that the results do not establish is not.

Produce a small set of the MOST USEFUL proposals (fewer is better for a short survey; a weak survey warrants very few, possibly none). Each = a conclusion headline + a 2–4 sentence explanation (what the evidence shows, then what it means) + the evidence ids. Classify each: observation (≥1 ref), pattern (≥2 refs), tension (≥2 refs), synthesis (≥2 refs), implication (grounded in the cited results, never generic advice or a prescription).

HARD RULES: cite ONLY "eN" ids; keep ids OUT of the prose (put them only in evidenceRefs); NO causal language; NO statistical-significance; NO change-over-time; NO priority-inferred-from-share; NO unique-people claims; a grouped combined share proves the CALCULATION, not sentiment (never restate as "positive"/"favourable"). CROSS-QUESTION: two percentages from DIFFERENT questions are not the same measure — never call the space between them a "gap"/"difference"/"higher/lower"; connect their MEANING only. RESPONDENT-LEVEL: NEVER claim the same respondents hold two attitudes (e.g. "those positive on Q1 were also positive on Q2", "people who chose A were more likely to choose B") — the data is aggregate; describe each question independently.

Return ONLY valid JSON:
{"proposals":[{"type":"observation|pattern|tension|synthesis|implication","priority":"key|supporting","headline":"a conclusion, not a statistic","explanation":"2-4 sentences: the evidence, then what it means","evidenceRefs":["e3","e7"]}]}
No prose outside the JSON.`;
}

export function buildSurveyStage2Prompt(payload: StudyAnalysisEvidence, proposals: { displayType?: string; headline: string; explanation?: string; evidenceRefs: string[] }[], objective: string | null): string {
  const s = payload.study;
  const propLines = proposals.map((p, i) => `P${i + 1} [${p.displayType ?? "insight"}]: ${p.headline}${p.explanation ? ` — ${p.explanation}` : ""}`).join("\n");
  return `You are the senior analyst writing the client-facing read of ONE survey. The verified analytical body below (P1..P${proposals.length}) is the COMPLETE analysis — do NOT add, drop or re-score it. Organise it and write the synthesis.

SURVEY: ${s.name} · ${new Set(payload.evidence.map((e) => e.canonicalQuestionKey)).size} question(s) · ${s.completedResponses} completed responses.
${objective ? `OBJECTIVE: ${objective} — the themes and synthesis should help answer it.` : "No objective — give the overall picture."}
${historyNote(payload) ? `\n${historyNote(payload)}\n` : ""}
VERIFIED ANALYTICAL BODY (organise THESE by number):
${propLines}

STEP 1 — KEY THEMES (only as many as the evidence genuinely supports — often just ONE; occasionally none). A theme is an analytical CONCLUSION about the research subject, NOT a category label and NOT an implementation term. Good: "Sponsorship recognition is established but uneven". Bad: "Market differences". Each theme: title (a conclusion), interpretation (why these belong together + combined meaning), proposals (the P-numbers), importance ("primary"|"secondary"), relationToObjective (one line). NEVER force a count and NEVER one theme per proposal; a theme must be broader than a single proposal. If the body does not group, return one theme (or none) rather than inventing structure.

STEP 2 — WHAT THE RESEARCH SAYS. A concise synthesis (roughly 2–4 short paragraphs, ~90–170 words) answering "what does this survey collectively tell us?": the central interpretation → the strongest support → the principal qualification/tension. Plain senior-analyst English. The headline is a CONCLUSION, not a statistic. Match headline strength to evidence strength (a plurality picking an option labelled "strong fit" does NOT license "fit is strong" as a fact). If there is NO single strong overarching conclusion, say that plainly and briefly rather than inventing one. Do NOT prescribe actions the survey did not test (no "should/recommend/invest/launch/leverage the sponsorship for…") — interpret only. Where an AUDIENCE difference materially changes the story, say so in one clause; never list group percentages.

RULES (themes AND narrative): NEVER write an id/"eN"/ref/"survey#…" in ANY prose; put narrative evidence ids ONLY in its evidenceRefs array; never put refs on a theme. No self-arithmetic; a grouped share proves the calculation, not sentiment; two percentages from different questions are not comparable (connect MEANING, not magnitude); no causal / significance / change-over-time / unique-people / respondent-correlation language; use "improve/strengthen/build/raise" not "increase/grow".

Return ONLY valid JSON:
{"themes":[{"title":"a conclusion, not a category","interpretation":"why these belong together and what they mean","proposals":[1,3],"importance":"primary|secondary","relationToObjective":"one line"}],"narrative":{"headline":"conclusion not a statistic","summary":"the concise synthesis","evidenceRefs":["e1","e5"]}}
No prose outside the JSON.`;
}

export function buildSurveyNarrativeRepairPrompt(payload: StudyAnalysisEvidence, rejectedDraft: unknown, reasons: string[]): string {
  return `Your previous "what the research says" summary was rejected by the evidence firewall for: ${reasons.join("; ")}. Rewrite ONLY the narrative, citing ONLY "eN" ids from the evidence below, keeping ids OUT of the prose, and obeying every rule (no causal/significance/change-over-time/unique-people/respondent-correlation language; no cross-question magnitude; grouped share is not sentiment).

BASE EVIDENCE (cite "eN"):
${evidenceLines(payload)}
${derivedLines(payload) ? `\nDERIVED FACTS:\n${derivedLines(payload)}` : ""}
Previous rejected draft (for reference only): ${JSON.stringify(rejectedDraft ?? null).slice(0, 600)}

Return ONLY valid JSON: {"narrative":{"headline":"conclusion","summary":"concise synthesis","evidenceRefs":["e1"]}}
No prose outside the JSON.`;
}
