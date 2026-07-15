// Reusable analyst: the Full Research Report — the comprehensive
// analytical expansion of an approved Executive Report. Sits after the
// Executive Report in the Reports product hierarchy (Research Sources →
// Source Intelligence → Key Findings → Executive Report → Full Research
// Report → derivative outputs), never before or beside it. Explicitly
// out of scope for this file: Editorial Article and Conclusion, neither
// of which is touched or wired to read this new output.
//
// The one architectural risk this file exists to resolve: it must not
// become a second, independent synthesis that could reach a different
// conclusion than the approved Executive Report. That report's own
// architecture — theme identity/count, anchor findings, Research Answer,
// opportunities/risks/recommendations — is a FIXED, READ-ONLY input here,
// never a field this file's own model calls can rewrite. Within that
// fixed architecture the report is allowed to analyse the wider evidence
// as comprehensively as it warrants (governance constrains conclusions,
// not depth — see buildThemeDeepDivePrompt's GOVERNANCE block).
//
// Generation is map-then-reduce, two phases:
//   PHASE 1 — one call PER THEME, run in parallel. Each theme call gets
//     the complete wider evidence pool and its own token budget, and is
//     told to work through ALL of it for relevance to that one theme and
//     develop the analysis to the depth the relevant evidence supports.
//     One call per theme (rather than one shared call across all themes)
//     is what lets a rich theme become substantial while a thin one stays
//     short — a single shared completion produced balanced-but-shallow
//     sections, the compression this two-phase design fixes.
//   PHASE 2 — one synthesis call, after all deep-dives complete. It sees
//     every finished deep-dive plus the wider pool annotated with which
//     findings the deep-dives already used, and writes the whole-report
//     layer: the fuller Executive Summary that opens the report, any
//     Additional Evidence-Led Insights the themes didn't cover, and the
//     Strategic Conclusion that synthesises the complete report (not a
//     concatenation of themes). This is where whole-report coherence is
//     preserved despite the per-theme split.
// Every reference (additional_findings/quote_ids/chart_id/insight
// based_on_findings) is validated in code afterwards — clampReferences /
// normaliseQuoteIds / normaliseChartId, and insights are filtered to only
// findings no deep-dive used.
//
// One more discipline reapplied here, not assumed inherited: this
// session's SOURCE FRAMEWORK ATTRIBUTION rule (a source's own named
// framework or opinion must be attributed, not stated as fact) lives only
// in analyseExecutiveReport.ts's own Call 1 prompt. The wider Key Findings
// pool this file reads was never filtered through that rule — a
// Document's own unattributed archetype/opinion claim can reach this call
// exactly as originally written, so the same rule is reapplied verbatim
// below rather than assumed to carry over for free.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { getSummary } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { clampReferences } from "@/lib/intelligence/validate-references";
import { getSourceLabel, type EvidenceTypeId } from "@/lib/research-sources/registry";
import type {
  ExecutiveReport, ExecutiveReportAgreement, ExecutiveReportDifference, ExecutiveReportRecommendation,
  AnswerStatus, EvidenceStrengthSourceRef,
} from "@/lib/intelligence/analysts/analyseExecutiveReport";
import type { KeyFinding, KeyFindingsReport } from "@/lib/intelligence/analysts/analyseKeyFindings";
import type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";
import type { InsightReport } from "@/lib/intelligence/analysts/analyseConversation";
import type { StructuredEvidenceBlock } from "@/lib/intelligence/structured-evidence";

export const FULL_RESEARCH_REPORT_SYNTHETIC_NOTICE_TEXT =
  "This report is based entirely on simulated evidence generated for demonstration purposes. It does not reflect real research findings.";

/** One theme's expanded analytical section. `theme_index` matches the
 * approved Executive Report's own `major_themes` array — never a new
 * theme, never renamed, never split. `additional_findings`/`quote_ids`/
 * `chart_id` are the RETRIEVAL half of this file's job (see header
 * comment); `deep_dive` is the NARRATE half. */
export type FullResearchReportThemeDeepDive = {
  theme_index: number;
  /** Copied verbatim from the Executive Report's own major_themes[i].theme
   * at generation time — part of the FIXED architecture, carried here so
   * rendering (on screen and in PPTX) never needs the Executive Report
   * loaded alongside this one to know a theme's name. */
  theme: string;
  deep_dive: string;
  /** Validated 0-based indices into the WIDER Key Findings pool
   * (FullResearchReport's own evidence_appendix / KeyFindingsReport.findings),
   * never the Executive Report's own key_findings array again — those are
   * already the theme's fixed anchor findings, shown separately below. */
  additional_findings: number[];
  /** Validated composite ids into the flattened quote candidate list — see
   * QuoteCandidate's own doc comment for how the id is built. */
  quote_ids: string[];
  /** Validated against the chart menu, same mechanism as Editorial
   * Article's own chart_id, never a chart the model invents. */
  chart_id: string | null;
};

/** A material, Research-Question-relevant observation drawn from the wider
 * Key Findings pool that has NO legitimate home within any approved Core
 * Strategic Theme — the outlet for evidence the Executive Report's own
 * theme architecture never covered (e.g. a market, or a source's own
 * framework, that no approved theme is about). Deliberately subordinate:
 * it can never rename, merge with, contradict or override an approved
 * theme or the approved Research Answer, and it exists only where the
 * evidence genuinely warrants it — an empty array is the correct, common
 * outcome, not a gap to pad. Its `based_on_findings` must reference wider-
 * pool findings NOT already cited by any theme deep-dive, so it adds new
 * material rather than restating what a Core Theme already covered. */
export type FullResearchReportAdditionalInsight = {
  insight: string;
  /** Validated 0-based indices into the wider Key Findings pool
   * (evidence_appendix), same discipline as a deep-dive's
   * additional_findings. */
  based_on_findings: number[];
  quote_ids: string[];
};

/** A verbatim quote, flattened across every included Conversation/Document
 * source into one globally-indexable candidate list — the same
 * "deterministic candidate list, model can only pick an id, never invent
 * content" discipline analyseEditorialArticle.ts's chart menu already
 * established, applied here to quotes for the first time. */
export type QuoteCandidate = {
  id: string;
  source_type: "conversation_search" | "document";
  source_id: string;
  source_label: string;
  text: string;
  sentiment?: string;
  market?: string;
  topic?: string;
  attribution?: string | null;
};

/** A chart candidate, same shape/discipline as Editorial Article's own
 * ArticleChartSpec — duplicated here (not imported) rather than exported
 * from analyseEditorialArticle.ts, since that file is explicitly out of
 * scope for this work. See this file's own buildChartMenu(). */
export type FullResearchReportChartSpec = StructuredEvidenceBlock & {
  id: string;
  chart_type: "bar" | "pie" | "line";
};

export type FullResearchReportMethodologySource = {
  evidence_type: EvidenceTypeId;
  evidence_id: string;
  label: string;
  sample_size: number | null;
  date_range: { from: string; to: string } | null;
  publishers: string[];
  countries: string[];
  /** A source-type-appropriate descriptor for sources that don't have the
   * survey/conversation sample-size/market/date shape — an uploaded
   * Document carries its document type and publisher here instead of
   * responses/mentions. Null for survey/conversation, which describe
   * themselves via the fields above. */
  description: string | null;
};

export type FullResearchReport = {
  research_question: string;
  /** Verbatim from the approved Executive Report, never regenerated — part
   * of the FIXED architecture, same principle analyseConclusion.ts already
   * applies to this exact field. */
  research_answer: string;
  answer_status: AnswerStatus;
  /** NOT copied verbatim from the Executive Report — generated fresh by
   * this file's own call, AFTER theme_deep_dives (see
   * buildThemeDeepDivePrompt's own ordering comment), expanding the
   * approved research_answer/executive_summary with the fuller picture
   * the deep-dives just established. Must stay consistent with, never
   * contradict, the approved Research Answer. */
  executive_summary: string;
  methodology: {
    /** A concise, project-specific narrative of the research approach and
     * how the analysis was produced — what was done with the evidence, not
     * a list of the sources (that inventory is the `sources` array below,
     * rendered under Sources & Citations). Generated as one extra field of
     * the existing Phase-2 synthesis call (no additional AI call). `null`
     * on reports generated before this field existed, and as a defensive
     * fallback if the model returns nothing — the section simply hides
     * rather than showing boilerplate. */
    narrative: string | null;
    sources: FullResearchReportMethodologySource[];
    method_diversity: "single_method" | "mixed_method";
  };
  /** One per Executive Report theme, always fully populated — a theme the
   * model omits still gets an entry, falling back to its own already-
   * approved synthesis text (see the merge step below), never dropped. */
  theme_deep_dives: FullResearchReportThemeDeepDive[];
  /** Material wider-pool evidence with no home in any Core Strategic Theme
   * — see FullResearchReportAdditionalInsight. Empty array when the
   * approved themes already cover everything material, which is a valid
   * and common outcome. Always subordinate to the Core Themes above. */
  additional_insights: FullResearchReportAdditionalInsight[];
  // Verbatim copies of the Executive Report's own validated arrays —
  // never rewritten, never re-synthesised. Part of the FIXED architecture.
  areas_of_agreement: ExecutiveReportAgreement[];
  areas_of_difference: ExecutiveReportDifference[];
  evidence_gaps: string[];
  opportunities: string[];
  risks: string[];
  recommendations: ExecutiveReportRecommendation[];
  /** The report's closing synthesis — draws the deep-dives and additional
   * insights together and deepens the answer to the Research Question,
   * inventing no new facts and never contradicting the approved Research
   * Answer. The mirror image of executive_summary (which opens the
   * report): this closes it. Generated last, after everything above it
   * exists. */
  strategic_conclusion: string;
  /** The complete Key Findings pool, verbatim — rendered as a distinct,
   * separated appendix (collapsed by default on screen, fully included in
   * PDF, excluded entirely from PPTX) rather than folded into the main
   * analytical narrative. See the review page / PPTX exporter for how
   * this separation is implemented. */
  evidence_appendix: KeyFinding[];
  quote_pool: QuoteCandidate[];
  /** Only the charts actually referenced by a surviving deep-dive, embedded
   * so rendering is self-contained — same pattern as EditorialArticle.charts. */
  chart_menu: FullResearchReportChartSpec[];
  sources_included: EvidenceStrengthSourceRef[];
  sources_excluded: (EvidenceStrengthSourceRef & { reason: string })[];
  generated_at: string;
  /** Snapshot of the Executive Report's own generated_at at the moment
   * this was built — lets the review page detect "the Executive Report
   * has changed since," the same idea as the Executive Report's own
   * Research-Question staleness check. */
  executive_report_generated_at: string;
  research_mode: "real" | "simulated";
  synthetic_notice: string | null;
  /** Reviewer-facing, NON-client-facing: the human-readable labels of any
   * sections whose AI generation failed (after retries) and therefore show
   * existing approved content as a fallback rather than freshly-generated
   * prose — e.g. a theme deep-dive that reverted to its Executive Report
   * synthesis, or the Executive Summary / Strategic Conclusion reverting to
   * the approved report. Surfaced only during draft/review so the reviewer
   * knows to check those sections; never rendered in the approved report or
   * any export. Empty (the normal case) means every section generated
   * cleanly. Optional for reports generated before this field existed. */
  generation_fallbacks?: string[];
};

// Phase 1 (per-theme) raw shape — one of these per theme call.
type RawSingleDeepDive = {
  deep_dive: string;
  additional_findings: number[];
  quote_ids: string[];
  chart_id: string | null;
};

type RawAdditionalInsight = {
  insight: string;
  based_on_findings: number[];
  quote_ids: string[];
};

// Phase 2 (whole-report synthesis) raw shape — the single reduce call.
type RawSynthesis = {
  expanded_executive_summary: string;
  additional_insights: RawAdditionalInsight[];
  strategic_conclusion: string;
  methodology_narrative: string;
};

/** Duplicated, not imported, from analyseEditorialArticle.ts's own
 * buildChartMenu — that file is explicitly out of scope for this work.
 * Pure, deterministic: exact values/labels copied straight from each
 * source's own frozen structured_evidence, the model never invents a
 * chart's content, only ever picks a candidate's id or null. */
function buildChartMenu(blocks: StructuredEvidenceBlock[]): FullResearchReportChartSpec[] {
  return blocks.map(b => ({
    ...b,
    id:         `${b.source_type}:${b.source_id}:${b.id}`,
    chart_type: b.suggested_chart_type ?? "bar",
    series:     b.series.slice(0, 8),
  }));
}

function describeChartMenu(menu: FullResearchReportChartSpec[]): string {
  if (!menu.length) return "(none available)";
  return menu
    .map(c => {
      const scopeText = c.scope ? ` (${c.scope})` : "";
      const seriesText = c.series.map(s => `${s.label}: ${s.value}${c.unit === "percent" ? "%" : ""}`).join(", ");
      return `[${c.id}] ${c.title}${scopeText} — ${seriesText}`;
    })
    .join("\n");
}

function describeQuotePool(pool: QuoteCandidate[]): string {
  if (!pool.length) return "(none available)";
  return pool
    .map(q => {
      // Explicit even when absent — a quote with no stated market/scope
      // must read as unscoped, never silently pass as if it belonged to
      // whichever theme happens to want it. See EVIDENCE DISCIPLINE.
      const tags = [q.sentiment, q.market, q.topic].filter(Boolean).join("/");
      return `[${q.id}] (${tags || "no stated market/scope — general context only"}): "${q.text}"${q.attribution ? ` — ${q.attribution}` : ""}`;
    })
    .join("\n");
}

function describeWiderPool(findings: KeyFinding[]): string {
  if (!findings.length) return "(none available)";
  return findings.map((f, i) => `[${i}] (${getSourceLabel(f.source as EvidenceTypeId)}: ${f.source_label}) ${f.text}`).join("\n");
}

// The factual source inventory, handed to the synthesis call ONLY so its
// methodology_narrative can describe the real approach (which source types,
// markets, date ranges, sample/mention sizes) — never to introduce a new
// finding. Same self-describing shape the on-screen inventory uses: a
// document via its own `description`, a survey/conversation via its stat
// line. Deterministic; the model narrates it, it does not invent it.
function describeMethodology(
  sources: FullResearchReportMethodologySource[],
  methodDiversity: "single_method" | "mixed_method"
): string {
  if (!sources.length) return "(no sources)";
  const lines = sources.map(s => {
    const detail = s.description
      ? s.description
      : [
          s.sample_size !== null ? `${s.sample_size} ${s.evidence_type === "survey" ? "responses" : "mentions"}` : null,
          s.publishers.length ? s.publishers.join(", ") : null,
          s.countries.length ? `markets: ${s.countries.join(", ")}` : null,
          s.date_range ? `${s.date_range.from} – ${s.date_range.to}` : null,
        ].filter(Boolean).join(" · ");
    return `- ${s.label} (${getSourceLabel(s.evidence_type)})${detail ? ` — ${detail}` : ""}`;
  });
  return `${methodDiversity === "mixed_method" ? "Mixed methods" : "Single method"}\n${lines.join("\n")}`;
}

// The evidence-discipline rules are identical for both the per-theme
// deep-dive calls and the final synthesis call — one shared block so they
// can never drift apart. Every protection the user required kept verbatim:
// source-framework attribution, no unsupported causation, no enumerated
// speculation, no cross-market transfer, scope atomicity.
const SHARED_EVIDENCE_DISCIPLINE = `SOURCE FRAMEWORK ATTRIBUTION, non-negotiable: a finding in the evidence above may be one source's own named framework, taxonomy, archetype, persona or subjective interpretation — recognisable because the source is characterising or labelling something rather than reporting a measured percentage, count or direct observation. This is different from a fact and must be written differently: attribute it to the source by name (shown alongside each finding) rather than stating it as settled, independently-established fact.

EVIDENCE DISCIPLINE, non-negotiable — this is what stops the analysis from sounding more certain than the evidence allows:
- Every specific detail — a cause, a mechanism, a named initiative, a reason why something is true — must already appear in the evidence shown above. Never add a cause, mechanism or specific detail that isn't stated there, however plausible it sounds. If you can't point to a specific item above that states it, do not write it.
- Do not assert that one piece of evidence explains or causes another unless a specific cited item actually states that connection. Two facts being topically related (both about cost, both about a market, both about sport) is not evidence that one causes or explains the other. If the evidence establishes a genuine reason, state it and it will trace to the item that establishes it. If it does not, say the reason is not established ("the available evidence does not establish why..."). Analysing several findings TOGETHER — noting they co-occur, comparing them, reading them side by side — is legitimate and wanted; what is forbidden is upgrading that co-occurrence into a causal or evidential LINK, presenting one finding as explaining, causing, driving, reflecting, being "linked to", "emblematic of", "a symptom of", "indicative of" or "evidence for" another, when no cited item states that link. This is easiest to slip into when the findings are differently scoped — a general, unscoped observation set against one specific market's outcome, or a general brand-attitude measure set against a specific activity concern — because the reader will assume the connection your wording implies. Fusing several separately-scoped findings into a single causal story (e.g. taking a general grievance, an unrelated attitude figure and a specific outcome and presenting them as one driving the other) is the exact violation. Keep such findings as separate observations analysed alongside each other unless a cited item genuinely establishes the link between them.
- DO NOT EXPLAIN AN OBSERVED DIFFERENCE WITH AN UNMEASURED MECHANISM: when two findings differ (e.g. a survey figure and a social-listening figure point different ways), you may report THAT they differ, but you may not manufacture a general mechanism to explain WHY they differ unless a source actually measured that mechanism. Statements like "social media tends to amplify positive experiences", "surveys capture more negativity", "the difference reflects the context in which each was expressed", or "the excitement around the event makes sponsorship viewed more favourably" are unmeasured general theories, not evidence — however plausible or widely-believed they sound, they did not come from the sources here. If the evidence does not establish why two findings differ, state that plainly and stop; do not reach for a mechanism to resolve the tension for the reader.
- DIFFERENT CONSTRUCTS ARE NOT A CONTRADICTION: before treating two findings as opposing evidence, check that they measure the SAME thing. Findings that measure different constructs (e.g. general attitude toward a subject itself vs sentiment about one specific activity it undertakes), different populations (a survey's respondents vs a social feed's mentioners vs a document's cited sample), or different contexts must NOT be framed as a contradiction, dichotomy, discrepancy, divergence, disconnect, paradox, mismatch or tension merely because their sentiment points in opposite directions. Opposite valence across two different measures is not a conflict to resolve — both can be true at the same time. Report each finding as exactly what it measures, keep it attributed to its own source and population, and where two such findings sit side by side present them as distinct or complementary signals that may coexist, not as one contradicting or undermining the other. Only findings that genuinely measure the same construct in the same population can contradict each other; those you may and should present as a real, unresolved difference. This rule binds every part of the report equally — a theme deep-dive, the executive summary and the strategic conclusion are all held to it.
- When you note that something is unresolved or unexplained, STOP there. Do not follow it with any candidate cause the evidence does not state — and this applies to the CONTENT of the guess, not just its phrasing. Naming a category of possible cause ("cultural factors", "economic factors", "political factors", "competitive dynamics", "regional differences", "past brand interactions", "demographic factors" or any similar) is the violation, no matter which verb introduces it — "could include X", "may involve X", "could involve exploring X", "might stem from X", "such as X", or "X specific to this market" are all the same forbidden move: attaching an unevidenced explanation to something you have just said is unexplained. The hedge ("could", "may", "exploring", "possibly") does not make it acceptable; it disguises it. A sentence that says the reason isn't established must end there, or continue only into a genuinely evidenced further-research direction stated in general terms ("further research into the specific drivers is needed"), never into a category or example cause of your own.
- DO NOT RECHARACTERISE A MEASURED PROPORTION: a percentage or count is exactly what it is — never relabel it with a qualitative size word the evidence didn't measure. Do not call a measured share "a minority", "a vocal minority", "a small group", "most", "the majority", "widespread" or similar unless the number itself supports that word AND no other measured figure in the evidence contradicts it. In particular, if one finding puts negative sentiment at (say) 51%, you may not simultaneously describe the negative group as "a minority" — that contradicts the report's own measured figure.
- DO NOT USE ONE SOURCE'S POPULATION TO REDEFINE THE SCALE OF ANOTHER: different sources measure different populations (a survey's respondents are not a social-listening feed's mentioners are not a document's cited sample). Never net one source's proportion against another's to imply a measured group is smaller or larger than its own source states — e.g. do not call survey-measured dislike "a vocal minority" on the grounds that social-media mentions skew positive. Report what EACH source measured within its own population, and where they diverge, present the divergence as an unresolved difference — never as evidence that one of the two figures is really smaller than it says.
- NO CROSS-MARKET TRANSFER: evidence about one market, audience or segment must never be presented as a remedy, model, avenue, cause or explanation for a different one, or for "other markets" generally. A driver that is positive in one market is evidence about that market only. Even if a theme's own anchor findings happen to include evidence from a second market (you did not choose this, but you may be given it), keep each market's evidence attributed to its own market: report what each market's evidence shows, and if they differ, say they differ — never bridge them by suggesting one market's positive driver "could be a model for" or "offers an approach to improving" another market or markets generally. State a pattern only across the exact markets a source actually measured together, never one you infer across a boundary the evidence never crossed.
- Every finding or quote you cite must itself be scoped to the subject you are using it for, or you must treat it as general context, not specific evidence about that subject's particular outcome. A finding or quote with no stated country, market or audience (marked "no stated market/scope", or a finding that names no market) may be used as general context, but must never be presented as explaining a specific, market-scoped outcome unless it explicitly names that market.
- STRATEGIC IMPLICATIONS vs INVENTED OUTCOMES: drawing out what the evidence implies for the Research Question is a legitimate, wanted part of the analysis — but keep the line between evidence and inference visible ("Gen Z's stated emphasis on brand ethics suggests values-aligned sponsorship may matter to them", framed as a possibility grounded in a finding). What you must NOT do is assert an unmeasured commercial outcome as a result — never state that something "will/could enhance brand loyalty", "boost engagement", "increase affinity", "strengthen the brand", or any equivalent outcome-shaped claim, unless a source above actually measured that outcome. An implication grounded in a cited finding is fine; a promised result the evidence never measured is invented, whatever verb dresses it.
- EVIDENCE-BACKED DIRECTION vs ANALYST HYPOTHESIS, non-negotiable: a strategic DIRECTION the evidence genuinely supports may be stated as such (e.g. "the evidence points to reaching this audience through short-form video on the platforms they actually use"). But a specific TACTIC, format, execution, activation or content idea that the evidence does not itself name is YOUR hypothesis, not the evidence's conclusion — things like "behind-the-scenes footage", "player interviews", "an interactive fan zone", "a loyalty programme", "a youth academy" are concrete executions the sources did not state. You may still offer them, but you must frame them explicitly as options to test or hypotheses ("one execution worth testing would be...", "a possible format to explore is..."), never as something the evidence establishes or recommends. Do not let a chain of reasoning slide from an evidenced direction into a specific invented tactic presented as a conclusion; name the direction as evidenced, and mark any concrete execution as the untested idea it is.
- NO UNSUPPORTED PREMISE BEHIND A DIRECTION, non-negotiable: a strategic direction, implication or recommendation may rest only on premises the evidence actually established. Do not introduce a concept, audience need, motivation, value, preference, concern, expectation or market characteristic that no cited finding measured or stated, and then build a direction on it. Phrases like "initiatives that resonate with local values and concerns", "content that speaks to their sense of community", "addressing the underlying anxieties of this market", or "aligning with what this audience cares about" assert audience values, needs or characteristics as known when the evidence never identified them — that is inventing the premise the recommendation stands on, not drawing an implication from evidence, and the vagueness of the language is what hides it. You may only reference values, needs, concerns, motivations, preferences or market characteristics that a cited finding actually establishes; where the relevant driver is genuinely unknown, say the direction depends on drivers not yet identified (and that identifying them is the further research needed) rather than inventing a plausible-sounding one to fill the gap. This does not forbid legitimate evidence-backed implication — a direction grounded in a stated finding is exactly the wanted analysis; it forbids only manufacturing the premise the direction rests on.

STRUCTURE, non-negotiable — do NOT use analytical scaffolding as sentence or paragraph openers, ANYWHERE in the prose. Never write "The anchor findings establish...", "The wider evidence pool [reveals/shows/indicates]...", "The additional evidence adds...", "What remains unresolved is...", or any close variant. They turn analysis into visible boilerplate. Refer to evidence by what it actually is — "31% of Spanish fans...", "the survey data...", "in Germany, by contrast..." — never by its role in your reasoning structure.

Ban stock filler phrases anywhere, including as a closing flourish: never write "in conclusion", "overall", "it is worth noting", "it is interesting to note", or "ultimately" to open a summarising sentence. Do not end a section with an "In conclusion, ..." wrap-up — a strong analytical section simply ends on its last real point. Do not rate your own confidence anywhere in this output.`;

// ── Phase 1: one call PER THEME. Given the full wider pool and told to
// analyse this one theme comprehensively — depth scaling with the volume
// of relevant evidence, not competing with other themes for a shared
// budget. See analyseFullResearchReport()'s own header comment for why
// this is one call per theme rather than one shared call. ──
function buildThemeDeepDivePrompt(
  project: { project_name: string; research_question: string },
  executiveReport: ExecutiveReport,
  widerPool: KeyFinding[],
  quotePool: QuoteCandidate[],
  chartMenu: FullResearchReportChartSpec[],
  themeIndex: number
): string {
  const theme = executiveReport.major_themes[themeIndex];
  const anchorText = theme.supporting_findings
    .map(idx => executiveReport.key_findings[idx])
    .filter((f): f is typeof executiveReport.key_findings[number] => !!f)
    .map(f => `  - (${f.corroboration === "cross_source" ? "supported by more than one source" : "single-source"}) ${f.finding}`)
    .join("\n") || "  (none)";
  // Other themes shown by name only — enough to know a finding genuinely
  // about one of them is out of scope here, without inviting this call to
  // write about them.
  const otherThemesText = executiveReport.major_themes
    .map((t, i) => (i === themeIndex ? null : `  [${i}] ${t.theme}`))
    .filter(Boolean)
    .join("\n") || "  (none)";

  return `You are a senior research director at Fanometrix, writing ONE section of a Full Research Report — the comprehensive analytical expansion of a Research Project's already-approved Executive Report. The Executive Report's strategic architecture is already approved by a human; you are deepening one of its themes against the full evidence pool, not re-deciding anything.

RESEARCH PROJECT: "${project.project_name}"
RESEARCH QUESTION: "${project.research_question}"
APPROVED RESEARCH ANSWER (fixed context, never contradict): "${executiveReport.research_answer}"

THE THEME YOU ARE WRITING: "${theme.theme}"
Its approved synthesis (fixed — your analysis may deepen and substantiate this, never contradict, override or replace it):
  ${theme.synthesis}
This theme's anchor findings (the Executive Report's own selected evidence for it):
${anchorText}

THE OTHER APPROVED THEMES (context only — evidence genuinely about one of these belongs to that theme, not here; do not pull it into your section):
${otherThemesText}

WIDER EVIDENCE POOL — every validated Key Finding across every approved source. This is your material: work through ALL of it for relevance to your theme, not just the anchors above:
${describeWiderPool(widerPool)}

QUOTE POOL — verbatim, tagged by sentiment/market/topic where available:
${describeQuotePool(quotePool)}

AVAILABLE CHARTS (reference one by its bracketed id only if it genuinely strengthens a point; every value is exact and frozen, never alter, recombine or invent one):
${describeChartMenu(chartMenu)}

YOUR TASK: write one deep, evidence-grounded analytical section for the theme above.

COMPREHENSIVE RETRIEVAL, non-negotiable: work through the ENTIRE wider evidence pool and identify every finding and quote genuinely relevant to THIS theme's subject — do not stop at the first two or three, and do not leave a relevant finding unexamined. But within your theme's subject only — this is not a licence to annex another theme's evidence:
- A finding whose subject is plainly one of the OTHER approved themes listed above (e.g. a finding about Gen Z's media habits when a separate "Gen Z" theme exists, or about one market when a separate market theme exists) belongs to that theme, NOT yours. Do not claim it for your section merely because you can construct a connection to it. Building a new strategic bridge between your theme and another theme's evidence ("this theme's positioning could be used to engage that theme's audience") is exactly the kind of fresh cross-theme synthesis this report must not invent — the approved Executive Report kept those themes separate, and so must you.
- Stay within your theme's own subject and analyse it deeply there. You must never force an irrelevant finding in to look thorough, and equally never reach into a neighbouring theme's territory to inflate your section. Account for all the evidence genuinely about YOUR theme, not a token sample of it and not a raid on other themes.
Tag every finding you draw on in "additional_findings" (its 0-based wider-pool index) and every quote in "quote_ids".

DEPTH SCALES WITH EVIDENCE, non-negotiable: develop this theme to exactly the depth its relevant evidence supports — never a word target, never padding. Where several relevant findings exist, do the analytical work on them: what they collectively establish, how they corroborate, complicate or differ from one another, what interpretation they reasonably support, the strategic implications for the Research Question, and what genuinely remains unresolved. A theme rich in relevant evidence (many distinct findings) should naturally become a substantial, multi-movement analysis; a theme resting on one or two findings should stay concise and not be inflated. Match the depth to the evidence, in both directions.
- SYNTHESISE, don't list: relate and combine findings into genuine analytical points, never a bullet-by-bullet or sentence-by-sentence walk through the evidence. The output is analysis, not an annotated evidence list.
- Every relevant finding you retrieve into "additional_findings" should genuinely inform the prose — individually or synthesised with others. Citing a finding you don't actually use is as wrong as ignoring one you should have used.
- ENGAGE COMPLICATING AND COUNTER-EVIDENCE, non-negotiable: do not build a one-sided narrative from only the evidence that supports the theme's direction. Actively look, in the wider pool, for findings that QUALIFY, LIMIT, COMPLICATE or TENSION this theme's emerging interpretation — and where a materially relevant one exists, engage it, do not quietly leave it out because it makes the story less clean. For example, if a theme is about engaging an audience through a channel, evidence that the same audience is shrinking, disengaging, facing a cost barrier, or preferring a different channel is directly relevant and must be reckoned with, not omitted. This is NOT a quota and NOT a licence to drag in irrelevant findings — relevance is still the bar. It simply forbids selecting only the evidence that makes an easy narrative while ignoring evidence in the same pool that genuinely complicates it. A theme that has honestly weighed its complicating evidence is stronger and more trustworthy than one that reads as advocacy.

SINGLE-SOURCE THEMES, when they arise: if this theme's relevant evidence comes predominantly or entirely from ONE source (especially a source presenting its own framework, archetype, taxonomy or opinion), two things. First, do NOT manufacture cross-source connections to make the theme look more synthesised — never borrow another theme's evidence or invent a link the evidence doesn't support just to add breadth (a single-source theme that stays single-source is honest). Second, and equally, do NOT simply restate or paraphrase the source — that is summary, not analysis. Analyse it critically: distinguish what the source ESTABLISHES (measured facts) from what it ASSERTS (its own framing/opinion, which stays attributed to it by name); assess the limitations and transferability of its framework to this project's actual Research Question and context; and be explicit about what it leaves unresolved or unaddressed. Analysing a single source means examining and testing its claims against the Research Question, not repeating them.

GOVERNANCE — analyse freely, never override: you may analyse the wider evidence as comprehensively as it warrants; depth is unlimited. What you may NOT do is contradict, override or silently replace the theme's approved synthesis or the approved Research Answer. The approved synthesis is authoritative as an INTERPRETATION, not merely as background prose to acknowledge: where it has already RESOLVED how a set of findings relate — for example, that two findings measure different constructs and so are NOT a contradiction, or that a relationship between findings is (or is not) established — you must adopt that resolved interpretation and build on it. You may NOT re-derive a conflicting interpretation straight from the raw findings (for instance re-labelling as a "dichotomy", "discrepancy", "divergence" or "tension" a relationship the approved synthesis has explicitly settled as not a contradiction). This is not a licence to shrink the analysis into a repeat of the synthesis: you still add all the wider supporting and complicating evidence, the corroboration and counter-evidence, the nuance and the open questions the concise synthesis had no room for — you simply do that work WITHIN the interpretation the human has already approved, deepening it rather than reversing it. Surface genuine NEW tension the wider evidence raises as an explicit open question; never reverse an established conclusion or overturn a relationship the approved synthesis has already resolved.

${SHARED_EVIDENCE_DISCIPLINE}

Return ONLY valid JSON:
{
  "deep_dive": "Connected analytical prose developing this theme to the depth its evidence supports — establishing what the evidence shows, how findings relate and differ, what can reasonably be interpreted, the strategic implications, and what remains unresolved, as flowing analysis (not labelled movements, not a list of findings)",
  "additional_findings": [/* every wider-pool index you genuinely drew on — as many as are relevant, not a fixed count */],
  "quote_ids": [],
  "chart_id": null
}`;
}

// ── Phase 2: ONE synthesis call, after all deep-dives are complete. Sees
// every finished deep-dive and the full pool annotated with what the
// deep-dives already used — so the Strategic Conclusion synthesises the
// whole report (not a concatenation) and Additional Insights can reliably
// find material evidence no theme covered. See the header comment. ──
function buildSynthesisPrompt(
  project: { project_name: string; research_question: string },
  executiveReport: ExecutiveReport,
  deepDives: { theme: string; deep_dive: string }[],
  widerPool: KeyFinding[],
  usedFindingIndices: Set<number>,
  quotePool: QuoteCandidate[],
  methodologySources: FullResearchReportMethodologySource[],
  methodDiversity: "single_method" | "mixed_method"
): string {
  const deepDivesText = deepDives.map(d => `### ${d.theme}\n${d.deep_dive}`).join("\n\n");
  const annotatedPool = widerPool
    .map((f, i) => `[${i}]${usedFindingIndices.has(i) ? " (already covered by a theme deep-dive)" : " (NOT yet used by any deep-dive)"} (${getSourceLabel(f.source as EvidenceTypeId)}: ${f.source_label}) ${f.text}`)
    .join("\n");

  return `You are a senior research director at Fanometrix, writing the whole-report synthesis of a Full Research Report whose theme-by-theme deep-dive sections are already complete and shown below. You are NOT rewriting the deep-dives and NOT re-analysing raw sources — you work only from the finished deep-dives and the evidence shown here. Where the approved report or a completed deep-dive has already RESOLVED how findings relate — for instance that two measures are different constructs, populations or contexts rather than a contradiction — treat that as settled: do not re-frame it as a contradiction, dichotomy, discrepancy, divergence, disconnect or tension in the summary or the conclusion. Opposite sentiment across two different measures is not a conflict to resolve; both can hold at once.

RESEARCH PROJECT: "${project.project_name}"
RESEARCH QUESTION: "${project.research_question}"
APPROVED RESEARCH ANSWER (fixed, never contradict or exceed): "${executiveReport.research_answer}"
APPROVED EXECUTIVE SUMMARY (fixed context): ${executiveReport.executive_summary}

COMPLETED THEME DEEP-DIVES (the report's analytical body — already written and validated, treat as finished):

${deepDivesText}

WIDER EVIDENCE POOL, annotated with what the deep-dives already used:
${annotatedPool}

QUOTE POOL — verbatim, tagged by sentiment/market/topic where available:
${describeQuotePool(quotePool)}

RESEARCH SOURCES ACTUALLY USED (the factual inventory behind this report — for the methodology narrative below; describe it, never treat it as a new finding):
${describeMethodology(methodologySources, methodDiversity)}

YOUR TASK: four whole-report outputs, each with a DISTINCT job. The Executive Summary and the Strategic Conclusion must not be two versions of the same text — they do different work at opposite ends of the report, and a reader who reaches the conclusion should learn something the summary did not already tell them.

"expanded_executive_summary" — EXECUTIVE SYNTHESIS, at the top of the report. Its job is to give a senior decision-maker, up front, the integrated headline answer and the two or three most decision-relevant implications, woven together as genuine synthesis. It is NOT a sequential walk through the themes: do not write "The first theme... The second theme... The third theme..." or a paragraph per theme in order — that is a table of contents, not an executive summary. Lead with what the evidence, taken together, means for the Research Question, then the handful of implications that most matter for a decision, integrated into flowing prose. Do NOT end by restating the approved Research Answer verbatim — you are consistent with it throughout, so you never need to quote it as a closing line. It must not be shorter than or a bare restatement of the approved executive_summary, and never a different conclusion.

"additional_insights": material, Research-Question-relevant evidence that NO deep-dive covered — every such finding is marked "NOT yet used by any deep-dive" in the pool above. Capture each genuinely material one. It qualifies when it is BOTH relevant to the Research Question AND drawn only from "NOT yet used" findings. Typically this catches a whole market with its own measured sentiment that no theme is about, a source's own framework or a scale/reach figure about the brand's role no theme covers, or an overall cross-market signal the market-specific themes missed. Each insight's "based_on_findings" must reference only "NOT yet used" indices. These are strictly SUBORDINATE to the approved Executive Report — evidence-led observations, never approved strategic conclusions; present each as "the evidence also shows...", never a correction of a theme. An empty array is acceptable if the deep-dives truly covered everything material, and you must never manufacture an insight or promote trivial evidence — but do not leave a whole uncovered market or a clearly Research-Question-relevant signal on the table either.

"strategic_conclusion" — CROSS-THEME SYNTHESIS, at the bottom of the report. Its job is fundamentally different from the Executive Summary's, and it is not "integrate all the themes" in the weak sense of listing them and saying they combine. Its actual analytical task is to find the genuine INTERACTIONS between the themes and state the deeper answer that emerges from them: where do two themes REINFORCE each other (the same force showing up in both), where do they COMPLICATE each other (one theme's finding qualifies another's), and above all where do they create genuine TENSION (two themes pulling in different directions that a strategy has to reconcile)? Name the specific interactions the themes in THIS report actually create — a real tension between two of these themes is worth more than a paragraph of harmonious integration. Then state the deepened answer to the Research Question that only becomes visible once the themes are read together — something a reader could not get from any single theme or from the Executive Summary. Explicitly do NOT walk theme by theme; do NOT repeat the Executive Summary's sentences or reuse a deep-dive's closing lines; do NOT restate the approved Research Answer verbatim; do NOT settle for "Coca-Cola should do all three things" — that is a list, not a synthesis. If the only thing you can write is a recap of points already made above, you have not done the synthesis. Bound by all the same discipline: the interactions and the deepened answer must trace to what the themes already established — invent no new fact, introduce no cause or recommendation not already established in the deep-dives, never contradict or exceed the approved Research Answer, and preserve every genuine uncertainty rather than resolving it for a tidier ending.

"methodology_narrative" — a concise, project-specific account (roughly 2-4 sentences, one short paragraph) of HOW this research was conducted and analysed to answer the Research Question. This is about METHOD and PROCESS, not findings. Draw only on the RESEARCH SOURCES ACTUALLY USED listed above and the analysis this report performed: name the overall approach (single vs mixed method) and the specific source types actually used (Survey Intelligence, Conversation Intelligence, uploaded industry documents, etc.), the markets and date ranges the evidence actually covers, and how evidence across those sources was analysed and synthesised against the Research Question to identify the themes, agreements, differences, evidence gaps and implications — noting that the analysis is AI-assisted with every finding traceable to its source and reviewed by a human before approval. STRICT LIMITS: state NO new finding, statistic, result, conclusion, recommendation or analytical claim here, and claim NO method, source, market or timeframe that is not in the inventory above (do not say "interviews" or "focus groups" or "a nationally representative sample" unless the sources actually are that). If a detail (e.g. a date range) is not present in the inventory, simply omit it — never invent one. It must read as a specific methodology statement for THIS project, not generic boilerplate, and must not repeat the Executive Summary or Strategic Conclusion.

${SHARED_EVIDENCE_DISCIPLINE}

Return ONLY valid JSON:
{
  "expanded_executive_summary": "A fuller executive summary opening the report, informed by all deep-dives, expanding (never contradicting) the approved research_answer and executive_summary",
  "additional_insights": [
    { "insight": "A material, Research-Question-relevant observation drawn only from 'NOT yet used' findings, framed as a subordinate addition ('the evidence also shows...'). Empty array if nothing genuinely qualifies.", "based_on_findings": [25], "quote_ids": [] }
  ],
  "strategic_conclusion": "The closing whole-report synthesis: what the complete report establishes about the Research Question, deepening the answer without inventing facts, preserving genuine uncertainty, never contradicting the approved Research Answer",
  "methodology_narrative": "A concise, project-specific methodology narrative (how the research was conducted and analysed), drawn only from the sources actually used, introducing no findings, claims or invented methods"
}`;
}

function normaliseQuoteIds(ids: string[] | undefined | null, validIds: Set<string>): string[] {
  if (!ids) return [];
  return [...new Set(ids)].filter(id => validIds.has(id));
}

function normaliseChartId(chartId: string | null | undefined, menuIds: Set<string>): string | null {
  return chartId && menuIds.has(chartId) ? chartId : null;
}

export async function analyseFullResearchReport(projectId: string): Promise<FullResearchReport> {
  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("project_name, research_question, research_mode")
    .eq("id", projectId)
    .single();

  if (!project) throw new IntelligenceError(404, "Research project not found");
  if (!project.research_question?.trim()) {
    throw new IntelligenceError(400, "This project has no Research Question set, a Full Research Report has nothing to expand without one.");
  }

  // Gated on the SAME approval Editorial Article/Conclusion already
  // require — this file never independently re-synthesises the evidence,
  // it expands what's already been approved, so nothing here can run
  // ahead of that approval.
  const executiveReportRow = await getSummary<ExecutiveReport>("research_project", projectId, "executive_report");
  if (!executiveReportRow || (executiveReportRow.status !== "approved" && executiveReportRow.status !== "published")) {
    throw new IntelligenceError(
      400,
      "This project's Executive Report must be approved before a Full Research Report can be generated, it expands the approved report's architecture, it doesn't synthesise the evidence again."
    );
  }
  const executiveReport = executiveReportRow.edited_content ?? executiveReportRow.content;

  // Key Findings has no approval lifecycle of its own (always current,
  // regenerates freely) — this reads whatever is currently stored, the
  // same way Article/Conclusion read the stored Executive Report rather
  // than regenerating it themselves.
  const keyFindingsRow = await getSummary<KeyFindingsReport>("research_project", projectId, "key_findings");
  if (!keyFindingsRow) {
    throw new IntelligenceError(400, "This project has no Key Findings yet. Generate Key Findings before generating a Full Research Report.");
  }
  const keyFindingsReport = keyFindingsRow.edited_content ?? keyFindingsRow.content;
  const widerPool = keyFindingsReport.findings;

  // Reuse the Executive Report's own inclusion decision exactly as
  // Editorial Article already does — never its own readiness/inclusion
  // logic, and can never cite a source the Executive Report excluded.
  const includedSources = executiveReport.evidence_strength.sources_included;

  // Document Intelligence's research_summary row is keyed by the
  // research_project_evidence row's OWN id (migration 102), never
  // evidence_id (library_documents.id) — the same id
  // evidence_strength.sources_included carries for display purposes.
  // Resolved once here via a fresh lookup, the same distinction
  // analyseExecutiveReport.ts itself already has to make when it first
  // fetches each document's summary.
  const { data: documentEvidenceRows } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, evidence_id")
    .eq("research_project_id", projectId)
    .eq("evidence_type", "document");
  const documentRowIdByEvidenceId = new Map((documentEvidenceRows ?? []).map(r => [r.evidence_id, r.id as string]));

  const methodologySources: FullResearchReportMethodologySource[] = [];
  const structuredEvidence: StructuredEvidenceBlock[] = [];
  const quotePool: QuoteCandidate[] = [];

  for (const src of includedSources) {
    if (src.evidence_type === "document") {
      const evidenceRowId = documentRowIdByEvidenceId.get(src.evidence_id);
      const summary = evidenceRowId
        ? await getSummary<{ quotes: { id: string; text: string; attribution: string | null }[]; document_summary?: { document_type?: string; source_publisher?: string | null } }>("document_project", evidenceRowId, "research_summary")
        : null;
      const content = summary ? (summary.edited_content ?? summary.content) : null;
      if (content?.quotes) {
        quotePool.push(...content.quotes.map(q => ({
          id: `document:${src.evidence_id}:${q.id}`,
          source_type: "document" as const,
          source_id: src.evidence_id,
          source_label: src.label,
          text: q.text,
          attribution: q.attribution,
        })));
      }
      // Documents have no sample-size/market/date-range concept
      // (deliberately — see analyseDocumentForProject.ts), so they carry a
      // document-appropriate descriptor (its type and publisher) instead of
      // the survey/conversation stat line, rather than being excluded from
      // Methodology & Provenance — they are approved research sources and
      // belong there.
      const docType = content?.document_summary?.document_type?.replace(/_/g, " ") ?? null;
      const docPublisher = content?.document_summary?.source_publisher ?? null;
      const descParts = [docType ? `Uploaded document (${docType})` : "Uploaded document"];
      if (docPublisher) descParts.push(docPublisher);
      methodologySources.push({
        evidence_type: "document", evidence_id: src.evidence_id, label: src.label,
        sample_size: null, date_range: null, publishers: [], countries: [],
        description: descParts.join(" · "),
      });
      continue;
    }

    // Conversation Search's own quotes are ephemeral — analyseConversation.ts
    // samples them fresh from raw mention rows purely to feed its own
    // prompt, and never persists them on InsightReport. Unlike Document
    // Intelligence's quotes (genuinely stored, genuinely reusable), there
    // is nothing here to read after the fact — this is a real, honest gap,
    // not a bug: Conversation-sourced quotes simply don't contribute to
    // the quote pool below. Re-deriving them from raw social_mentions rows
    // would mean duplicating that sampling logic here, a second
    // independent extraction path this file deliberately avoids.
    if (src.evidence_type === "survey") {
      const summary = await getSummary<SurveyIntelligenceReport>("survey", src.evidence_id, "research_summary");
      if (!summary) continue;
      const content = summary.edited_content ?? summary.content;
      methodologySources.push({
        evidence_type: src.evidence_type, evidence_id: src.evidence_id, label: src.label,
        sample_size: content.response_count,
        date_range: content.sources_summary.date_range,
        publishers: content.sources_summary.publishers,
        countries: content.sources_summary.countries,
        description: null,
      });
      structuredEvidence.push(...(content.structured_evidence ?? []));
    } else {
      const summary = await getSummary<InsightReport>("conversation_search", src.evidence_id, "research_summary");
      if (!summary) continue;
      const content = summary.edited_content ?? summary.content;
      methodologySources.push({
        evidence_type: src.evidence_type, evidence_id: src.evidence_id, label: src.label,
        sample_size: content.mention_count,
        date_range: content.sources_summary.date_range,
        publishers: content.sources_summary.platforms,
        countries: content.sources_summary.markets,
        description: null,
      });
      structuredEvidence.push(...(content.structured_evidence ?? []));
    }
  }

  const chartMenu = buildChartMenu(structuredEvidence);
  const methodDiversity: FullResearchReport["methodology"]["method_diversity"] =
    new Set(includedSources.map(s => s.evidence_type)).size > 1 ? "mixed_method" : "single_method";

  const validQuoteIds = new Set(quotePool.map(q => q.id));
  const menuIds = new Set(chartMenu.map(c => c.id));

  // ── Phase 1: one call PER THEME, run in parallel. Each theme gets the
  // full wider pool and its own token budget, so depth scales with the
  // relevant evidence rather than four themes competing for one shared
  // completion (the root cause of the earlier one-paragraph-per-theme
  // compression). A theme whose call fails or returns nothing still isn't
  // dropped — it falls back to its own already-approved synthesis text,
  // never blank, never invented, just not narratively deepened. ──
  const rawDeepDives = await Promise.all(
    executiveReport.major_themes.map((_, i) =>
      completeJSON<RawSingleDeepDive>({
        prompt: buildThemeDeepDivePrompt(
          { project_name: project.project_name, research_question: project.research_question },
          executiveReport, widerPool, quotePool, chartMenu, i
        ),
        model:       "gpt-4o",
        temperature: 0.3,
        // Per theme now, not shared across all of them — room for a
        // genuinely developed section where the evidence warrants it.
        maxTokens:   3072,
      }).catch(() => null)
    )
  );

  const theme_deep_dives: FullResearchReportThemeDeepDive[] = executiveReport.major_themes.map((theme, i) => {
    const d = rawDeepDives[i];
    return {
      theme_index: i,
      theme: theme.theme,
      deep_dive: d?.deep_dive?.trim() || theme.synthesis,
      additional_findings: clampReferences(d?.additional_findings, widerPool.length),
      quote_ids: normaliseQuoteIds(d?.quote_ids, validQuoteIds),
      chart_id: normaliseChartId(d?.chart_id, menuIds),
    };
  });

  // The union of every finding the deep-dives actually used — this is
  // what the synthesis call is shown as "already covered", so Additional
  // Insights can reliably target only the genuinely-uncovered remainder,
  // and it's the same set the insight validation below enforces in code.
  // Deliberately only the deep-dives' own additional_findings (wider-pool
  // indices) — a theme's supporting_findings index into the Executive
  // Report's key_findings, a different array/index space entirely.
  const findingsUsedByThemes = new Set(theme_deep_dives.flatMap(d => d.additional_findings));

  // ── Phase 2: ONE synthesis call, after all deep-dives exist. Sees every
  // finished deep-dive plus the pool annotated with what they used, so the
  // Strategic Conclusion synthesises the whole report and Additional
  // Insights can find material evidence no theme covered. ──
  const rawSynthesis = await completeJSON<RawSynthesis>({
    prompt: buildSynthesisPrompt(
      { project_name: project.project_name, research_question: project.research_question },
      executiveReport,
      theme_deep_dives.map(d => ({ theme: d.theme, deep_dive: d.deep_dive })),
      widerPool, findingsUsedByThemes, quotePool,
      methodologySources, methodDiversity
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    maxTokens:   3072,
  }).catch(() => null);

  // Additional Evidence-Led Insights — validated the same way as a
  // deep-dive's references (clampReferences / quote-id membership), plus
  // the structural rule enforced in code, not just prompt: an insight may
  // only rest on wider-pool findings NO theme deep-dive already used.
  // Drop-if-empty so an insight that has nothing genuinely new to stand on
  // is removed, never fabricated.
  const additional_insights: FullResearchReportAdditionalInsight[] = (rawSynthesis?.additional_insights ?? [])
    .map(a => ({
      insight: a.insight?.trim() ?? "",
      based_on_findings: clampReferences(a.based_on_findings, widerPool.length).filter(idx => !findingsUsedByThemes.has(idx)),
      quote_ids: normaliseQuoteIds(a.quote_ids, validQuoteIds),
    }))
    .filter(a => a.insight && a.based_on_findings.length > 0);

  const usedChartIds = new Set(theme_deep_dives.map(d => d.chart_id).filter((id): id is string => id !== null));
  const chart_menu = chartMenu.filter(c => usedChartIds.has(c.id));

  // Reviewer-facing fallback trail: which sections reverted to existing
  // approved content because their AI call failed (a null raw result, or a
  // blank string, after completeJSON's own retries were exhausted). This is
  // the same condition each `... || <fallback>` below keys off — computed
  // here once so the review UI can tell the human "this section wasn't
  // freshly generated, check it," without changing any report prose. Empty
  // in the normal case where everything generated cleanly.
  const generation_fallbacks: string[] = [];
  theme_deep_dives.forEach((d, i) => {
    if (!rawDeepDives[i]?.deep_dive?.trim()) generation_fallbacks.push(`Theme deep-dive — ${d.theme}`);
  });
  if (!rawSynthesis?.expanded_executive_summary?.trim()) generation_fallbacks.push("Executive Summary");
  if (!rawSynthesis?.strategic_conclusion?.trim()) generation_fallbacks.push("Strategic Conclusion");

  const expectedSimulated = project.research_mode === "simulated";

  return {
    research_question:  project.research_question,
    research_answer:    executiveReport.research_answer,
    answer_status:       executiveReport.answer_status,
    // Falls back to the Executive Report's own executive_summary if the
    // model ever returns an empty string — never blank, same discipline
    // as every other never-invented-but-never-blank fallback in this file.
    executive_summary:  rawSynthesis?.expanded_executive_summary?.trim() || executiveReport.executive_summary,
    methodology: {
      // Null (not "") when the model returns nothing, so the render can
      // cleanly hide the section rather than show an empty Methodology
      // block — same defensive stance as every other optional field.
      narrative: rawSynthesis?.methodology_narrative?.trim() || null,
      sources: methodologySources,
      method_diversity: methodDiversity,
    },
    theme_deep_dives,
    additional_insights,
    areas_of_agreement:  executiveReport.areas_of_agreement,
    areas_of_difference: executiveReport.areas_of_difference,
    evidence_gaps:       executiveReport.evidence_gaps,
    opportunities:       executiveReport.opportunities,
    risks:               executiveReport.risks,
    recommendations:     executiveReport.recommendations,
    // Never blank — falls back to the approved Research Answer if the
    // model returns an empty conclusion, same never-invented-but-never-
    // blank discipline as executive_summary above.
    strategic_conclusion: rawSynthesis?.strategic_conclusion?.trim() || executiveReport.research_answer,
    evidence_appendix:   widerPool,
    quote_pool:          quotePool,
    chart_menu:          chart_menu,
    sources_included:    executiveReport.evidence_strength.sources_included,
    sources_excluded:    executiveReport.evidence_strength.sources_excluded,
    generated_at:        new Date().toISOString(),
    executive_report_generated_at: executiveReport.generated_at,
    research_mode:       project.research_mode,
    synthetic_notice:    expectedSimulated ? FULL_RESEARCH_REPORT_SYNTHETIC_NOTICE_TEXT : null,
    generation_fallbacks,
  };
}
