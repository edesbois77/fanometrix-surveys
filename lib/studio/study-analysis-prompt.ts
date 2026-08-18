// ── Survey Studio — Study Analysis prompt (versioned, pure) ──────────────────
// The one place the analyst-assistance instructions live. Pure string building:
// no DB, no network. The provider call (completeJSON) is elsewhere. Versioned so a
// persisted analysis run records exactly which prompt produced its output.
//
// v5: makes the model work in three analytical layers — OBSERVATIONS (what the
// evidence shows) → INSIGHTS (what one or more observations mean) → STORY (what the
// body of evidence says about the objective). It runs an internal candidate review +
// materiality test (surface only what matters), suppresses weak numeric comparisons and
// generic filler, scales coverage with the evidence, and returns a Study-level narrative
// PLUS curated proposals. The HARD governance prohibitions are still enforced
// deterministically in validateProposals / validateNarrative — richer interpretation,
// same evidence firewall.

import type { StudyAnalysisEvidence, EvidenceItem } from "@/lib/studio/study-analysis";
import type { StudyResultGroup } from "@/lib/studio/study-results";

export const STUDY_ANALYSIS_PROMPT_VERSION = "study-analysis-v8";
export const STAGE1_PROMPT_VERSION = "study-analysis-stage1-v5";
export const STAGE2_PROMPT_VERSION = "study-analysis-stage2-v7";

const pctText = (p: number | null) => (p == null ? "n/a" : `${(p * 100).toFixed(1)}%`);

// One evidence line with a GLOBAL short id (e1..eN by position in the full payload) so
// Stage-1 batches and the single/Stage-2 call all cite the same ids.
function evidenceLine(e: EvidenceItem, globalIndex: number): string {
  const where = e.scope === "combined" ? "COMBINED across surveys" : `Survey "${e.surveyName}"${e.resultMode === "historical" ? " (historical)" : ""}`;
  return `- id=e${globalIndex + 1} | Q="${e.question}" | option="${e.optionLabel}" | ${e.count} of ${e.base} (${pctText(e.percentage)}) | ${where} | comparability=${e.comparability}`;
}
function describeEvidenceIndexed(all: EvidenceItem[], keep: (e: EvidenceItem) => boolean): string {
  return all.map((e, i) => (keep(e) ? evidenceLine(e, i) : null)).filter(Boolean).join("\n");
}
function describeEvidence(evidence: EvidenceItem[]): string {
  return describeEvidenceIndexed(evidence, () => true);
}
// Derived facts share the SAME global "eN" id space, continuing after the base evidence,
// so a single resolver (base + derived) resolves every citation. The server computed
// these — the model cites them instead of doing arithmetic.
function describeDerivedIndexed(payload: StudyAnalysisEvidence, keep: (d: { canonicalQuestionKey: string }) => boolean): string {
  const base = payload.evidence.length;
  return (payload.derived ?? []).map((d, i) => (keep(d) ? `- id=e${base + i + 1} | ${d.kind.toUpperCase()} | Q="${d.question}" | ${d.label}` : null)).filter(Boolean).join("\n");
}
function describeDerived(payload: StudyAnalysisEvidence): string {
  return describeDerivedIndexed(payload, () => true);
}
// Segment/AUDIENCE facts continue the SAME global "eN" id space, after base + derived, so a
// single resolver ([evidence, derived, segmentDerived]) resolves every citation.
function describeSegmentIndexed(payload: StudyAnalysisEvidence, keep: (d: { canonicalQuestionKey: string }) => boolean): string {
  const offset = payload.evidence.length + (payload.derived ?? []).length;
  return (payload.segmentDerived ?? []).map((d, i) => (keep(d) ? `- id=e${offset + i + 1} | ${d.dimension.toUpperCase()} | Q="${d.question}" | ${d.label}` : null)).filter(Boolean).join("\n");
}
const segmentBlock = (payload: StudyAnalysisEvidence, keep: (d: { canonicalQuestionKey: string }) => boolean = () => true): string => {
  const lines = describeSegmentIndexed(payload, keep);
  return lines
    ? `AUDIENCE FACTS (server-computed differences/consistency ACROSS audiences — cite these to test whether the story holds by group; describe as "respondents in/among <group>", NEVER as a national trait or a partner effect, and NEVER call a difference statistically significant):\n${lines}`
    : "";
};
const evidenceBlock = (payload: StudyAnalysisEvidence): string =>
  `BASE EVIDENCE (each line is a governed statistic; cite the short id "id=eN"):
${describeEvidence(payload.evidence)}

DERIVED FACTS (computed deterministically by the system from the base evidence — cite their ids to use them; do NOT compute your own arithmetic):
${(payload.derived ?? []).length ? describeDerived(payload) : "(none)"}${(payload.segmentDerived ?? []).length ? `\n\n${segmentBlock(payload)}` : ""}`;

export function buildStudyAnalysisPrompt(payload: StudyAnalysisEvidence): string {
  const s = payload.study;
  const objective = s.objective && s.objective.trim() ? s.objective.trim() : null;
  const questionCount = new Set(payload.evidence.map((e) => e.canonicalQuestionKey)).size;
  return `You are a senior research analyst at Fanometrix. Your job in THIS step is to ANALYSE the research — interrogate the complete governed evidence against the objective and surface every distinct analytical avenue a competent analyst would reasonably want to consider before deciding what becomes a Finding. This is a broad analytical review, not a final shortlist and not a client report. Numbers come only from the supplied evidence; the SERVER has already computed the arithmetic you need.

WHY THE RESEARCH WAS COMMISSIONED
${objective ? `Objective: ${objective}
Infer the posture and adapt emphasis: EXPLORE (no preferred answer) · EVALUATE (weigh a proposition, for and against) · DEMONSTRATE (build the strongest evidence-supported case the data legitimately permits, THEN state the most important limiting/counter-evidence — never hide a negative, cherry-pick one survey, or imply proof on mixed evidence).` : `No objective stated — EXPLORE: understand what the evidence says, with no preferred answer.`}

STUDY: ${s.name} · ${s.surveyCount} survey(s) · ${questionCount} question(s) · ${payload.evidence.length} base + ${(payload.derived ?? []).length} derived facts · ${s.completedResponses} completed responses (operational total, NOT a base). Respondent uniqueness NOT proven.

${evidenceBlock(payload)}

INTERROGATE THE EVIDENCE — look across ALL questions and surveys for (surface each distinct avenue that is genuinely present):
- the strongest positives and the strongest negatives / limitations; dominant answers and notably weak ones;
- important minorities (a small share that still matters commercially or to risk);
- how concentrated or fragmented each distribution is (use the LEADER derived facts for the lead and lead-gap);
- combined structural shares where useful (use the GROUPED derived facts, e.g. the two most-selected options together) — describe them factually, never as a sentiment total;
- meaningful group differences AND meaningful similarities between surveys (use the SPREAD derived facts for the magnitude in pp, and the CONSISTENCY facts for agreement); leader reversals; single-survey outliers (frame as one audience);
- cross-question reinforcement, tensions and contradictions (connect answers from different questions into themes);
- evidence that supports the objective and evidence that limits/challenges it;
- legitimate commercial/strategic implications grounded in the evidence; and useful questions the evidence raises.
The bar is "worth an analyst considering", NOT "definitely belongs in a report". Do not pad, do not restate every option one-by-one, do not repeat the same point — but do not suppress a legitimate distinct avenue merely because it is secondary. Mark each as priority "key" (material to the objective / the study story) or "supporting" (legitimate context, nuance, minority or secondary pattern).

HARD RULES (governance — checked automatically; violations are discarded)
1. Cite ONLY the supplied ids "eN" (base OR derived). Never invent an id.
2. Use ONLY the supplied figures — including the supplied DERIVED facts. Do NOT perform or introduce your own arithmetic: to state a combined share, a spread in percentage points, or a lead, cite the matching derived fact.
3. No causal claims ("causes", "drives", "because of", "due to", "led to").
4. No statistical-significance language ("significant"/"significantly"/"significant difference"/"meaningful difference"/"materially higher/lower", p-values). A described difference or spread is fine (cite the derived spread); a significance CLAIM is not.
5. Cross-sectional evidence — no change-over-time language ("increased", "grew", "declined", "trend", "over time"). A survey difference is a group difference, not a change over time. Forward-looking interpretation ("an opportunity to…") is fine.
6. Do not infer priority-ranking from a share as a claim ("top/main/highest priority"); "the most-selected option" is fine.
7. No unique-person claims: "completed responses"/"respondents selected", never "${s.completedResponses} people/fans"/"all fans".
8. Comparison proposals compare the SAME question across source surveys (≥2 base survey refs). Synthesis ≥2 refs. Keep observed numbers distinguishable from interpretation.

STUDY NARRATIVE ("what the research says"): ONE overall answer to the objective${objective ? " (headline carries the verdict: strongly/…/contradicted where assessable)" : " (the overall picture)"} — the strongest answer, what supports it, what limits it, and the most useful implication, all grounded in cited ids.

Return ONLY valid JSON:
{"narrative":{"headline":"conclusion not a statistic","summary":"3-6 sentences","evidenceRefs":["e1","e5"]},"proposals":[{"type":"observation|comparison|synthesis","priority":"key|supporting","headline":"conclusion not a statistic","explanation":"2-4 sentences: the observed evidence, then what it means","evidenceRefs":["e2","e3"]}]}
No prose outside the JSON.`;
}

/**
 * A tight, narrative-ONLY repair prompt: same immutable evidence + objective, plus the
 * rejected draft and why it failed. Used at most once when the main call's narrative
 * fails validation, so a completed run reliably has a Study narrative. It never touches
 * the proposals and never loosens validation.
 */
export function buildNarrativeRepairPrompt(payload: StudyAnalysisEvidence, rejectedDraft: unknown, reasons: string[]): string {
  const s = payload.study;
  const objective = s.objective && s.objective.trim() ? s.objective.trim() : null;
  return `You are a senior research analyst at Fanometrix. Write ONLY the Study-level narrative ("what the research says") for this study. ${objective ? `Objective: ${objective}` : "No objective — give the overall picture."}

${evidenceBlock(payload)}

${rejectedDraft ? `A previous narrative draft was rejected:\n${JSON.stringify(rejectedDraft)}\nReason(s): ${reasons.join("; ")}\nFix ONLY those problems.` : ""}
Rules: cite ONLY the "eN" ids; never invent a number; no causal, statistical-significance, change-over-time, priority-from-share, or unique-person language; state the overall conclusion, the strongest supporting evidence, the strongest limiting/counter-evidence, and the key implication; ground every claim in cited ids.

Return ONLY valid JSON: {"narrative":{"headline":"...","summary":"3-6 sentences","evidenceRefs":["e1","e2"]}}. No prose outside the JSON.`;
}

// ── STAGE 1 — first-pass evidence review (COVERAGE, one bounded batch) ────────
export function buildStage1Prompt(payload: StudyAnalysisEvidence, batch: StudyResultGroup[], objective: string | null): string {
  const keys = new Set(batch.map((g) => g.canonicalQuestionKey));
  const baseLines = describeEvidenceIndexed(payload.evidence, (e) => keys.has(e.canonicalQuestionKey));
  const derivedLines = describeDerivedIndexed(payload, (d) => keys.has(d.canonicalQuestionKey));
  const segmentLines = segmentBlock(payload, (d) => keys.has(d.canonicalQuestionKey));
  return `You are a senior research analyst doing a BROAD FIRST-PASS review of ONE section of a larger Fanometrix study. Do TWO jobs: (A) INTERROGATE this section's evidence, and (B) CONNECT it. Surface every distinct analytical avenue a competent analyst would want to consider — so nothing important is missed downstream. This is analysis, not a final shortlist: do NOT decide report-worthiness and do NOT compress to a tiny list. Numbers come only from the supplied evidence; the SERVER has already computed the arithmetic (derived facts).

${objective ? `Study objective (for relevance): ${objective}` : "No stated objective — review neutrally."}

BASE EVIDENCE FOR THIS SECTION (cite the short id "id=eN"):
${baseLines}

DERIVED FACTS FOR THIS SECTION (system-computed — cite their ids to use a combined share, a spread in pp, a lead, or a consistency fact; do NOT compute your own arithmetic):
${derivedLines || "(none)"}
${segmentLines ? `\n${segmentLines}\n` : ""}
JOB A — INTERROGATE: walk this SEARCH CHECKLIST and surface a proposal for every avenue GENUINELY PRESENT (this is a checklist to search, NOT a quota — return nothing for an avenue the evidence does not support, and combine categories that describe the same underlying point):
1. dominant results; 2. meaningful minorities (a small share that still matters); 3. positive evidence; 4. negative evidence/limitations; 5. qualifications to the positives; 6. qualifications to the negatives; 7. within-question structure (concentration/lead — cite LEADER facts); 8. combined/grouped structure (cite GROUPED facts, factual not sentiment); 9. differences between surveys/audiences (cite SPREAD facts for magnitude); 10. consistency between surveys/audiences (cite CONSISTENCY facts); 11. cross-question reinforcement; 12. cross-question tension; 13. contradictions; 14. patterns; 15. brand/sponsorship implications; 16. actionable implications; 17. evidence that directly answers the objective; 18. evidence that challenges the hoped-for interpretation; 19. gaps between perception, awareness, expectation and behaviour WHERE the measures legitimately support that reading. Skip only genuinely boring/near-uniform results with no story.

JOB B — CONNECT: do not stop at individual results. Deliberately ask: which results REINFORCE each other? which QUALIFY each other? which CONTRADICT each other? do separate questions tell the same underlying story? does a negative change the meaning of a positive (or vice-versa)? does one result explain why another matters? what would a senior researcher say after looking ACROSS this section rather than at each result separately? Turn the strongest of these connections into higher-order proposals.

JOB C — TEST THE STORY BY AUDIENCE (only where AUDIENCE FACTS are supplied above): a good analyst checks whether the overall reading actually holds across the groups surveyed. Using ONLY the supplied AUDIENCE FACTS, ask: does the overall pattern HOLD across groups (consistency — which STRENGTHENS a conclusion, and is worth stating), or is it materially DIFFERENT / weaker / stronger somewhere? Is there an EXCEPTION or a leader REVERSAL in one group? Is an important minority CONCENTRATED in one audience? Would any of this change the interpretation or the recommended action? MATERIALITY: only raise an audience point (difference OR consistency) when it changes or meaningfully qualifies the story — do NOT list group-by-group percentages, and do NOT manufacture a difference. SEMANTICS: say "respondents in/among <group>" — NEVER a national-character claim and NEVER "partner X caused/made respondents…" (a partner is a collection channel, not an audience trait). Audience analysis ADDS to the other avenues; it never replaces cross-question synthesis.

The threshold is "worth an analyst considering", not "belongs in a report" — do not pad, but do not suppress a legitimate secondary avenue. Do NOT stop after a few: work the whole checklist.

Produce a PROPOSAL for every distinct avenue — each a short conclusion headline + a 2–4 sentence explanation (the observed evidence, then what it means) + the evidence ids. Classify each by the analytical work it does:
- observation — one notable result (≥1 ref)
- comparison — the SAME question across source surveys (≥2 base survey refs, one comparable question)
- pattern — the same signal recurring across ≥2 results/questions (≥2 refs)
- tension — ≥2 results that pull the interpretation in different directions (≥2 refs)
- synthesis — ≥2 results combined into one higher conclusion (≥2 refs)
- implication — what the evidence means for the objective/decision, grounded in the specific results it cites (must discuss those results, not generic advice)
Before finishing, deliberately check whether any legitimate PATTERN, TENSION, SYNTHESIS or IMPLICATION is present — do not default everything to "observation". Do NOT invent a higher-order type where the evidence does not support it, and do NOT force a quota per type.

INTERPRETATION TEST for synthesis/implication: "could this sentence have been written WITHOUT seeing this study's evidence?" If yes, it is generic — rewrite it so it names the specific results, or drop it.

Do NOT write the study narrative (that is a separate later step). Do NOT consolidate distinct avenues into a tiny handful — breadth here is the point; the human curates later. Two distinct interpretations that cite overlapping evidence are separate proposals. Mark each "priority": "key" (a direct answer to the objective, a central tension, a strong cross-question synthesis, or the most consequential structure) or "supporting" (legitimate context, nuance, minority or secondary pattern).
Rules: cite ONLY the "eN" ids (base or derived); do NOT introduce your own arithmetic (cite derived facts for combined shares / spreads / leads); a grouped combined share proves the CALCULATION, not a sentiment label — never restate it as "positive"/"favourable"/"approve"; no causal / statistical-significance / change-over-time / priority-from-share / unique-person language; do not turn one outlier into a study-wide claim; keep evidence ids OUT of the headline/explanation prose (put them only in evidenceRefs).
TYPE THE CROSS-SURVEY DIFFERENCE CORRECTLY: to express a difference between surveys/audiences, cite the derived SPREAD fact and type it "observation" or "pattern". Reserve "comparison" for directly contrasting the SAME option across surveys using the two base survey figures (≥2 base survey refs, one combined question).
CROSS-QUESTION RULE: two percentages from DIFFERENT questions are NOT the same measure — never call the space between them a "gap", "difference", "higher/lower", or "X points apart". Connect the MEANING of the measures (e.g. permission-to-play vs desired activation), not their numeric magnitude. Numeric magnitude comparisons are only valid WITHIN one comparable question.
For a forward-looking recommendation, use "improve / strengthen / build / raise / make more visible" — NOT trend verbs ("increase / grow / rise / boost"), which read as change-over-time.

Return ONLY valid JSON:
{"proposals":[{"type":"observation|comparison|pattern|tension|synthesis|implication","priority":"key|supporting","headline":"a conclusion, not a statistic","explanation":"2-4 sentences: the observed evidence, then what it means","evidenceRefs":["e3","e7"]}]}
No prose outside the JSON.`;
}

// ── SYNTHESIS — organise the verified proposals into THEMES, then write the theme-driven
//    Study narrative. ONE call: it never regenerates or reduces the proposal set (breadth is
//    preserved); it groups the avenues into a smaller set of coherent conclusions and writes
//    "what the research says" reasoning OVER those themes.
export function buildStage2Prompt(payload: StudyAnalysisEvidence, proposals: { displayType?: string; headline: string; explanation?: string; evidenceRefs: string[] }[], objective: string | null): string {
  const s = payload.study;
  const propLines = proposals.map((p, i) => `P${i + 1} [${p.displayType ?? "insight"}]: ${p.headline}${p.explanation ? ` — ${p.explanation}` : ""}`).join("\n");
  return `You are the SENIOR research analyst for this study. The verified analytical body below (P1..P${proposals.length}, each with its kind, conclusion and reasoning) is the COMPLETE analysis — do NOT add, drop or re-score any of it. Your job is to ORGANISE it into a hierarchy and write the executive story a client would read in a meeting.

STUDY: ${s.name} · ${s.surveyCount} survey(s) · ${new Set(payload.evidence.map((e) => e.canonicalQuestionKey)).size} question(s) · ${s.completedResponses} completed responses (operational total, NOT a base). Uniqueness NOT proven.
${objective ? `OBJECTIVE: ${objective}
Themes and the story must help ANSWER this objective. If it has more than one part, address each part AND whether they connect. For EVALUATE/DEMONSTRATE: give the STRONGEST evidence-supported answer the data permits, THEN the most important limiting/counter-evidence. Never hide a negative, cherry-pick one survey, or imply proof on mixed evidence. The objective sets the QUESTION, not the answer.` : "No objective — give the overall picture."}

VERIFIED ANALYTICAL BODY (organise THESE; reference them by number):
${propLines}

${evidenceBlock(payload)}

STEP 1 — THEMES. Group the RELATED proposals into a SMALLER set of coherent analytical THEMES — the major things this research is telling us. A theme is an analytical CONCLUSION, not a category:
- title = a conclusion (e.g. "Credible fit, but recognition and clarity are the real weakness"), NOT a label (e.g. "Sponsorship perception"). TEST: "could this title be written BEFORE seeing the results?" If yes, it is a category — rewrite it.
- interpretation = why these avenues belong together and what their COMBINED meaning is.
- proposals = the numbers (e.g. [1,4,6]) of the avenues that support the theme. A proposal MAY appear in more than one theme if genuinely relevant; do not repeat gratuitously.
- importance = "primary" (a major answer to the objective) or "secondary".
- relationToObjective = one line on why the theme matters to the objective.
Let the NUMBER of themes follow the study — do NOT force a count, do NOT make one theme per proposal, do NOT merge unrelated proposals to look tidy. Themes must be meaningfully broader than a single proposal. Every proposal that fits a theme should be grouped; proposals that stand alone can be left ungrouped (they remain in the workspace).

STEP 2 — STUDY NARRATIVE ("what the research says"), reasoning OVER the themes (not the raw proposals): (1) answer the objective; (2) state the central interpretation; (3) the strongest supporting theme(s); (4) the principal qualification, negative or tension; (5) what the combined evidence means; (6) where justified, the commercial/research implication. SHAPE: central interpretation → support → qualification/tension → implication. Plain senior-analyst English, no filler, ~90–170 words. The headline is a CONCLUSION${objective ? " carrying the verdict where assessable" : ""}, not a statistic.
SEGMENT-AWARE: where the AUDIENCE avenues materially change or qualify the story, SAY so in one clause (e.g. "…although the pattern is weaker among <group>", or "…consistent across the major markets, which strengthens the case"). Do NOT force audience commentary when nothing material differs, and never list group percentages.
HEADLINE PRECISION: do NOT promote an answer-option label into an unqualified Study-level fact. A plurality picking an option labelled "strong natural fit" does NOT license "fit is strong" as a fact — weigh the magnitude AND the counter-evidence (e.g. unclear/never-noticed) and choose calibrated wording ("a credible but not yet fully-landed fit", "a plurality see…"). Headline strength must match evidence strength.

Rules (BOTH themes and narrative): NEVER write an id, "id=eN", "evidenceRefs", a bracketed ref list, or a "study#..." ref in ANY prose (titles, interpretation, relationToObjective, headline, summary) — the server tracks evidence from the proposal numbers; do NOT put evidence refs on a theme. In the narrative, cite "eN" ids ONLY inside its evidenceRefs array. No self-arithmetic (cite derived facts); a grouped combined share proves the CALCULATION, not sentiment — never restate it as "positive"/"favourable"/"approve"; two percentages from DIFFERENT questions are not comparable — never call the space between them a "gap"/"difference"/"higher/lower" (connect their MEANING); use "improve/strengthen/build/raise" not "increase/grow"; no causal / statistical-significance / change-over-time / priority-from-share / unique-person language.

Return ONLY valid JSON:
{"themes":[{"title":"a conclusion, not a category","interpretation":"why these belong together and what they mean","proposals":[1,4,6],"importance":"primary|secondary","relationToObjective":"one line"}],"narrative":{"headline":"conclusion not a statistic","summary":"the theme-driven interpretation","evidenceRefs":["e1","e5"]}}
No prose outside the JSON.`;
}
