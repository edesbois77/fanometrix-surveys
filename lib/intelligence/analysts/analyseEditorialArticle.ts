// Reusable analyst: the Editorial Article — a public-facing,
// data-journalism-style story built downstream of a Research Project's
// already approved Executive Report AND Full Research Report, not a second
// synthesis pass over raw evidence. Deliberately one call, not the
// Executive Report's two-call pipeline: that split existed because Call 1
// there had to turn raw, undisciplined source material into
// evidence-disciplined atoms, and same-call self-reported confidence didn't
// reliably constrain same-call prose. This analyst's inputs are already
// disciplined and human-approved — key_findings are already evidence-only,
// areas_of_difference are already tagged resolved/unresolved,
// recommendations are already tagged investigation-vs-decided, and the Full
// Research Report's deeper analysis has already been reviewed and approved —
// so its job is editorial synthesis and re-narration of already-validated
// material, not fresh interpretation of raw evidence.
//
// Three inputs, kept structurally distinct by ROLE:
//   1. The approved Executive Report — the STRUCTURED, TRACEABLE BACKBONE.
//      A pool of validated claims (key_findings, major_themes,
//      opportunities, risks, recommendations, areas_of_difference,
//      evidence_gaps, research_answer, executive_summary), not a template
//      to fill in. Every factual claim in the article traces back here and
//      ONLY here: EditorialSection.based_on indexes these arrays, so the ER
//      remains the single authority for what is true and citable.
//   2. The approved Full Research Report — approved analytical DEPTH and
//      CONTEXT, never a citation target. Only its narrative-depth fields are
//      exposed (theme_deep_dives, additional_insights, strategic_conclusion,
//      and its own fuller executive_summary) so the article can develop
//      each theme with the nuance, counter-evidence and cross-theme
//      synthesis the concise Executive Report has no room for. The FRR's
//      full evidence pool (evidence_appendix) and quote pool are
//      deliberately NOT exposed — the article never re-selects raw evidence,
//      and never cites a finding the Executive Report didn't curate. The FRR
//      is used to write a RICHER original article, never copied or
//      summarised.
//   3. Frozen structured_evidence from each source the Executive Report
//      itself included (via its own evidence_strength.sources_included) —
//      exact numbers for citation and charting ONLY. Read via the shared
//      lib/intelligence/structured-evidence.ts contract, so this analyst
//      never needs bespoke knowledge of Survey vs Conversation
//      Intelligence's own internal shapes, and never needs a future source
//      type's internals either — a source with no structured data simply
//      contributes nothing here, which is valid. Never a source for
//      independent re-analysis.
//
// Charts are the one place a model could invent numbers, so they are
// deliberately not modelled that way: buildChartMenu() deterministically
// turns (2) into a fixed candidate list with stable IDs and exact values,
// entirely in code, before the model ever runs. The model's only power
// over charts is picking a candidate's ID for a section, or "null" — it
// cannot write a chart's title, values or categories. Every reference a
// section makes (based_on into the Executive Report's own arrays, and
// chart_id into the menu) is validated and dropped if invalid, same
// "derived, not freeform" discipline as clampReferences/normaliseTarget in
// analyseExecutiveReport.ts.
//
// Manually-added sections survive regeneration, deterministically, not by
// asking the model to "take them into account": a section a human adds
// directly in Edit mode (the page's own "+ Add Section") always has
// based_on: [], since it traces to no Executive Report index — that empty
// array IS the marker of "manual, not AI-authored." Regeneration reads
// the currently-stored article, pulls out every section with based_on: []
// unchanged, and appends them after the freshly-generated ones. This is
// deliberately NOT done by feeding old article text back into the prompt:
// doing that would either get ignored, or worse, get half-absorbed into
// new prose in a way that could smuggle unvalidated claims past the
// evidence-discipline rules below. A pure code-level carry-forward is
// predictable instead — what you wrote by hand is what reappears, always,
// until you remove it yourself. An AI-written section (based_on
// populated) has no such protection, regeneration replaces it exactly
// like every other AI-authored field always has.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { getSummary } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import type { ExecutiveReport } from "@/lib/intelligence/analysts/analyseExecutiveReport";
import type { FullResearchReport } from "@/lib/intelligence/analysts/analyseFullResearchReport";
import type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";
import type { InsightReport } from "@/lib/intelligence/analysts/analyseConversation";
import type { StructuredEvidenceBlock } from "@/lib/intelligence/structured-evidence";
import type { ReportImage } from "@/app/components/intelligence/ReportImageAsset";
import type { EvidenceTypeId } from "@/lib/research-sources/registry";

export const EDITORIAL_ARTICLE_SYNTHETIC_NOTICE_TEXT =
  "This article is based entirely on simulated evidence generated for demonstration purposes. It does not reflect real research findings.";

/** What an article section is actually retelling — the same "point at a
 * real, already-named thing, never a free-floating claim" principle as
 * analyseExecutiveReport.ts's RecommendationTarget, widened to cover every
 * array the Executive Report exposes. */
export type EditorialSectionReference = {
  type: "finding" | "opportunity" | "risk" | "recommendation" | "difference";
  index: number;
};

export type EditorialSection = {
  subheading: string;
  body: string;
  /** Validated non-empty — a section that traces to nothing in the
   * approved Executive Report is dropped entirely, never kept with a
   * fabricated trace. See analyseEditorialArticle()'s filter step.
   * Deliberately a list, not a single reference: one section is expected
   * to draw on several validated items of different types (a finding, an
   * unresolved difference, a related risk) to build one connected point —
   * this is what keeps traceability structural and invisible to the
   * reader, rather than forcing a one-item-per-section mapping. */
  based_on: EditorialSectionReference[];
  /** A stable ID into the deterministic chart menu, or null. Never a
   * chart's own content — see buildChartMenu(). */
  chart_id: string | null;
  /** Editorial presentation only — attached by a human in Edit mode via
   * ReportImageAsset, never by generation. analyseEditorialArticle()
   * always sets this to null; RawArticle (below) has no image field at
   * all, so there is nothing for the model to invent or select even in
   * principle. Entirely outside based_on/chart validation and the
   * Executive Report: removing or swapping an image can never affect a
   * claim, a chart, or the article's evidence. */
  image: ReportImage | null;
};

/** A structured_evidence block, deterministically assigned a globally
 * unique ID and a chart type — the only "chart data" a model ever sees or
 * can reference, never asked to invent one. */
export type ArticleChartSpec = StructuredEvidenceBlock & {
  id: string;
  chart_type: "bar" | "pie" | "line";
};

export type EditorialArticleResearchBasis = {
  sources: { evidence_type: EvidenceTypeId; evidence_id: string; label: string }[];
  date_range: { from: string; to: string } | null;
  /** Code-generated, not model-authored — a factual appendix line, not
   * another place for invented claims. */
  methodology_note: string;
};

export type EditorialArticle = {
  headline: string;
  standfirst: string;
  /** Optional, deliberately — a standalone takeaways list is a real
   * article convention some stories benefit from and others don't. Null
   * means the model judged this story didn't need one, not a missing
   * field to backfill. */
  key_takeaways: string[] | null;
  /** Optional for the same reason — earns its place by setting up a
   * specific angle, or is omitted when the first section already opens
   * the story directly. */
  introduction: string | null;
  /** Same as EditorialSection.image above — editorial presentation only,
   * attached by a human, never touched by generation. Rendered beneath
   * the headline/standfirst/metadata and before the article body. */
  hero_image: ReportImage | null;
  sections: EditorialSection[];
  /** Optional — what the evidence leaves the reader understanding, never
   * a new recommendation or unsupported strategic conclusion. Null when
   * the last section already closes the story on its own. */
  conclusion: string | null;
  /** Only the chart menu items actually referenced by a surviving
   * section — kept embedded so the stored article is self-contained for
   * rendering, without re-deriving the menu from live source data again. */
  charts: ArticleChartSpec[];
  research_basis: EditorialArticleResearchBasis;
  generated_at: string;
  research_mode: "real" | "simulated";
  synthetic_notice: string | null;
  research_question: string;
  /** Snapshots of the two upstream approved reports' own generated_at at the
   * moment this article was built, so the review page can detect "an
   * upstream report has changed since" and prompt a regenerate — the same
   * staleness idea the Full Research Report already applies against the
   * Executive Report, here extended to BOTH upstreams (the article is
   * downstream of both). Optional: articles generated before these fields
   * existed simply have no staleness signal, never a false one. */
  executive_report_generated_at?: string;
  full_research_report_generated_at?: string;
};

type RawArticle = {
  headline: string;
  standfirst: string;
  key_takeaways: string[] | null;
  introduction: string | null;
  sections: { subheading: string; body: string; based_on: EditorialSectionReference[]; chart_id: string | null }[];
  conclusion: string | null;
};

/** Pure, deterministic: exact values and labels copied straight from each
 * source's own frozen structured_evidence, never recomputed or
 * transformed. The only judgement call made here is chart TYPE, and even
 * that defers to the source analyst's own suggestion — see
 * StructuredEvidenceBlock.suggested_chart_type's own doc comment. */
function buildChartMenu(blocks: StructuredEvidenceBlock[]): ArticleChartSpec[] {
  return blocks.map(b => ({
    ...b,
    id:         `${b.source_type}:${b.source_id}:${b.id}`,
    chart_type: b.suggested_chart_type ?? "bar",
    series:     b.series.slice(0, 8),
  }));
}

function describeChartMenu(menu: ArticleChartSpec[]): string {
  if (!menu.length) return "(none available — write this article without a chart reference on any section)";
  return menu
    .map(c => {
      const scopeText = c.scope ? ` (${c.scope})` : "";
      const seriesText = c.series.map(s => `${s.label}: ${s.value}${c.unit === "percent" ? "%" : ""}`).join(", ");
      return `[${c.id}] ${c.title}${scopeText} — ${seriesText}`;
    })
    .join("\n");
}

function buildArticlePrompt(
  project: { project_name: string; research_question: string; topic: string | null },
  report: ExecutiveReport,
  frr: FullResearchReport,
  chartMenu: ArticleChartSpec[]
): string {
  const findingsText = report.key_findings
    .map((f, i) => `[${i}] (${f.corroboration === "cross_source" ? "supported by more than one source" : "single-source"}) ${f.finding}`)
    .join("\n") || "(none)";
  const opportunitiesText = report.opportunities.map((o, i) => `[${i}] ${o}`).join("\n") || "(none)";
  const risksText = report.risks.map((r, i) => `[${i}] ${r}`).join("\n") || "(none)";
  const differencesText = report.areas_of_difference
    .map((d, i) => `[${i}] ${d.finding} — ${d.resolved ? "cause established: " : "cause NOT established: "}${d.explanation}`)
    .join("\n") || "(none)";
  const gapsText = report.evidence_gaps.map(g => `- ${g}`).join("\n") || "(none)";
  const recommendationsText = report.recommendations
    .map((r, i) => `[${i}] ${r.action}: ${r.rationale} [${r.targets ? "an open investigation, not yet a decided direction" : "a specific action directly evidenced"}]`)
    .join("\n") || "(none)";

  // ER Strategic Themes — the thematic scaffold. NOT a based_on target (only
  // the arrays above are), but the map of what distinct strands the research
  // actually covers, so the article can develop several where the evidence
  // warrants rather than collapsing into one.
  const themesText = report.major_themes.length
    ? report.major_themes.map((t, i) => `[Theme ${i + 1}] ${t.theme}${t.synthesis ? ` — ${t.synthesis}` : ""}`).join("\n")
    : "(none)";

  // Approved analytical DEPTH from the Full Research Report — context to
  // write richer, more developed sections, NEVER a citation target and
  // NEVER to be copied or summarised. Only the narrative-depth fields; the
  // FRR's raw evidence pool is deliberately absent.
  const deepDivesText = frr.theme_deep_dives.length
    ? frr.theme_deep_dives.map(d => `### ${d.theme}\n${d.deep_dive}`).join("\n\n")
    : "(none)";
  const additionalInsightsText = (frr.additional_insights ?? []).length
    ? frr.additional_insights.map((a, i) => `[${i + 1}] ${a.insight}`).join("\n\n")
    : "(none)";

  return `You are a research journalist at a publication like YouGov's own editorial team, writing a genuine, publishable research article. It is built downstream of a Research Project whose Executive Report AND Full Research Report have both already been synthesised, validated, reviewed and approved by humans. You are not re-analysing any evidence and you are not rewriting an internal report in a friendlier voice. You are writing an ORIGINAL editorial synthesis: telling the strongest, fullest story the approved research genuinely supports, the way a professional research publisher would explain it to a reader who has never seen this project.

Two bodies of approved material feed this article, with DIFFERENT roles:
- The EXECUTIVE REPORT is your factual backbone: the curated, validated, citable claims. Every factual statement in your article must trace to an item in it (see the based_on rule below). It is the single authority for what is true here.
- The FULL RESEARCH REPORT is approved analytical DEPTH: deeper per-theme analysis, nuance, counter-evidence and cross-theme synthesis you may use to understand and develop the story more richly than the concise Executive Report allows. It is NOT a citation target, and it is NOT to be copied or summarised — you write your own article, informed by it.

RESEARCH PROJECT: "${project.project_name}"
RESEARCH QUESTION: "${project.research_question}"
${project.topic ? `Topic: ${project.topic}\n` : ""}
APPROVED RESEARCH ANSWER: "${report.research_answer}"
APPROVED EXECUTIVE SUMMARY: ${report.executive_summary}

STRATEGIC THEMES (the distinct strands this research actually covers — your thematic scaffold; develop the ones the evidence genuinely supports, do not force any that it doesn't):
${themesText}

VALIDATED EVIDENCE — the TRACEABLE, CITABLE pool. Treat every item as fact; you are not re-analysing or second-guessing any of it. Every factual claim you write must cite the specific items here it rests on, via "based_on":

Key Findings:
${findingsText}

Opportunities:
${opportunitiesText}

Risks:
${risksText}

Areas of Difference:
${differencesText}

Evidence Gaps:
${gapsText}

Recommendations:
${recommendationsText}

APPROVED ANALYTICAL DEPTH (Full Research Report) — context to help you write richer, more developed sections. Use it to understand the deeper analysis, the nuance and the counter-evidence behind the claims above, and to see how the themes relate. Do NOT reproduce, summarise or lift sentences from it, and do NOT treat anything here as a new citable fact — every factual claim in your article still traces to the VALIDATED EVIDENCE above, never to this section. This material is here to raise the ceiling on how well you can tell the story, not to be retold:

Per-theme deep analysis:
${deepDivesText}

Additional evidence-led insights (material the themes did not centrally cover):
${additionalInsightsText}

Cross-theme strategic conclusion:
${frr.strategic_conclusion || "(none)"}

Fuller executive synthesis:
${frr.executive_summary || "(none)"}

AVAILABLE CHARTS (reference one by its bracketed ID only if it genuinely strengthens a point you're making; every value shown here is exact and frozen, you are never allowed to alter, recombine or invent a value, category or chart not listed):
${describeChartMenu(chartMenu)}

YOUR TASK
Identify the strongest editorial narrative the approved research genuinely supports, and tell it in full. This is NOT "find the single most interesting angle and discard the rest" — a rich, multi-theme, multi-source project should produce a correspondingly rich article that develops several of its distinct themes, while a genuinely thin project should produce a shorter one. Let the DEPTH and BREADTH of the article scale to the actual richness of the approved research above:
- Where the Strategic Themes and evidence genuinely support several distinct strands (different themes, markets, audiences, or tensions), develop them — do not collapse a multi-theme project into a single finding. The current failure mode this replaces was an article that revolved entirely around one contrast while ignoring most of the research; do not do that.
- Where the research genuinely rests on one sharp point, a shorter article is correct. Depth must be earned by evidence, never manufactured.
- DEVELOP WHAT YOU INCLUDE, non-negotiable: once you decide a theme or angle belongs in the article, do not merely mention it in a sentence or two — develop it to the depth its approved analysis actually supports. A section that names a theme and states one figure is under-developed: draw on the Full Research Report's deep analysis for that theme to build it out into multiple connected paragraphs where the approved material genuinely supports that much — what the evidence establishes, the nuance and counter-evidence behind it, what remains contested or unresolved, and how it connects to the other strands of the story. A rich, multi-source theme should become a substantial multi-paragraph section; a thin one stays short. This is emphatically NOT a licence to pad: never inflate a genuinely thin point with generic commentary, repetition or filler to make a section look longer. Develop where the approved analysis gives you real material to develop with, and stay concise where it does not. There is no target or minimum length — depth tracks the evidence, in both directions.

DO NOT REPEAT ONE POINT ACROSS THE ARTICLE, non-negotiable: the headline, standfirst, key_takeaways, each section and the conclusion must each do DISTINCT work and advance the story. Do not restate the same finding (e.g. one market's single contrast) in the headline, then the standfirst, then a takeaway, then a section, then the conclusion. If a point has already been made, the next element develops the story further or covers a different strand — it does not say the same thing again in new words.

STRUCTURE, flexible by design, this is not a report template and this is not a fixed section count:
- "headline" and "standfirst" are always required, exactly as in a real published article.
- "sections" is the article's real body: an ordered sequence of narrative blocks, each with a subheading. Let the number of genuinely distinct, evidence-supported strands decide the count — a rich multi-theme project may genuinely warrant many sections, a thin one only a few. Never pad to hit a number, never split one point across extra sections to look thorough, and equally never compress several genuinely distinct, evidenced themes into one thin section or omit them — covering the real breadth of the research is the point.
- "key_takeaways", "introduction" and "conclusion" are each OPTIONAL. Return the JSON literal null for any this particular story doesn't genuinely benefit from. Do not manufacture any of the three merely to fill a field; equally, a richer article usually does benefit from a takeaways list and a genuine conclusion — use them when they add something the sections don't already carry.
- If you write an introduction, it must earn its place by setting up the specific angle you chose, not by restating the research question in generic terms.

ORIGINAL SYNTHESIS, NOT A REPORT SUMMARY, non-negotiable: you are writing an article for an external reader, not summarising the Full Research Report or the Executive Report. Do not walk through the themes in order as an internal report would; do not reproduce the Full Research Report's structure or sentences. Start from the story a reader would find genuinely interesting and build it with your own journalistic prose, drawing the approved material into that narrative.

WRITING STYLE, non-negotiable — this is what separates a real article from a reformatted report:
- Open with a clear news angle in the very first paragraph, the way a real article leads with what's actually newsworthy. Do not open with scene-setting preamble about the research project.
- Write flowing narrative: connected paragraphs that build on each other, never a list of disconnected fact-statements bolted together. Use transitions that explain how one finding relates to the next, e.g. "while X shows..., Y tells a different story...", "that pattern holds in..., but breaks down when...". Two facts placed next to each other with no connective reasoning between them is not narrative.
- Weave percentages and evidence naturally into sentences the way a journalist writes them, never as a citation bolted onto the end of a sentence.
- Sections should normally contain multiple connected paragraphs (separate paragraphs with a blank line) when the evidence genuinely supports that much development: explain what is established, what remains contested or unknown, and how the pieces connect. A single thin sentence is under-developed, expand it with what the evidence actually supports, never pad with generic commentary just to look longer.
- One section may, and often should, draw on several validated items of different types together (a finding and an unresolved difference and a related risk, for instance) to build a single connected point — that is preferable to one item per section. "based_on" must list every item actually drawn on, however many that is, not just one for form's sake.
- Write in neutral, confident journalistic language, no commercial filler, no brand-advisory tone, no sales language.
- Ban these specific phrases and any close equivalent: "this study aims to", "the evidence presents a complex picture", "poses a significant challenge", "could provide valuable insights", "future engagement strategies", "it is worth noting", "in conclusion", "overall", "it is interesting to note".
- Recommendations, opportunities and risks are never required reading, use one only when it is directly relevant to the angle you chose, never to fill space.

EVIDENCE DISCIPLINE, non-negotiable — the same boundary the Executive Report itself is held to, this article inherits it exactly, it is never loosened for readability:
- State only what the validated evidence establishes. Apply this test to every clause: if removing it would lose none of the actual evidenced content, that clause is commentary, not evidence, and it does not belong, however it is worded. This bans, in any phrasing: a qualitative relabelling of what a number means, a commercial implication or potential, a desired outcome, a causal interpretation, strategic meaning, an inferred consequence, or solution language.
- Never invent a cause the evidence doesn't establish. Never resolve an area of difference tagged "cause NOT established" into a settled explanation, that unresolved contradiction is part of the story, not a gap to paper over.
- Never generalise a finding to a broader market or geography than what is named above.
- If you use a recommendation, it must retain its existing evidence status exactly: one tagged "an open investigation, not yet a decided direction" must stay an open question in your prose, describe only that it remains open, never what answering it might be worth, achieve or lead to — a phrase like "would provide valuable insights for future strategies" invents a benefit the evidence never established, that is banned just as much as turning it into a decided recommendation or a commercial call to action outright.
- Every statistic you cite must be one that already appears in the validated evidence above, exactly as given, never rounded differently, recombined or invented.
- Only reference a chart by its bracketed ID from AVAILABLE CHARTS above, and only when it genuinely strengthens that point. Never invent one, never reference an ID not listed. "chart_id": null is correct and common.
- Every section's "based_on" must cite the actual finding/opportunity/risk/recommendation/difference indices it draws on, this is what keeps the article traceable, invisibly to the reader, to validated evidence. A section with nothing genuine to trace to does not belong in this article.

Return ONLY valid JSON:
{
  "headline": "A concise, finding-led editorial headline, not a generic report title",
  "standfirst": "One or two sentences framing the central story, not a repeat of the headline",
  "key_takeaways": "the JSON literal null, or an array of 3-6 concise evidence-backed points if a standalone list genuinely earns its place here, not a restatement of the sections below",
  "introduction": "the JSON literal null, or a short opening that earns its place by setting up the specific angle, if the first section doesn't already open the story directly",
  "sections": [
    { "subheading": "A finding-led subheading stating a real point", "body": "One or more connected paragraphs, separated by a blank line, weaving in specific statistics and explaining how they relate, developed as fully as the evidence supports", "based_on": [{ "type": "finding", "index": 0 }, { "type": "difference", "index": 0 }], "chart_id": "survey:abc123:q1" }
  ],
  "conclusion": "the JSON literal null, or what the evidence leaves the reader understanding, never a new recommendation, if the last section doesn't already close the story on its own"
}

Write like a research journalist publishing a real article, not an AI filling in a report template. Never more certain than the validated evidence above allows.`;
}

/** Same validate-or-drop discipline as clampReferences/normaliseTarget in
 * analyseExecutiveReport.ts, widened to a list: an invalid or duplicate
 * reference is dropped individually, never fabricated to fill the gap. */
function normaliseSectionReferences(
  refs: EditorialSectionReference[] | undefined | null,
  counts: Record<EditorialSectionReference["type"], number>
): EditorialSectionReference[] {
  if (!refs) return [];
  const seen = new Set<string>();
  const out: EditorialSectionReference[] = [];
  for (const r of refs) {
    if (!r || !(r.type in counts)) continue;
    if (!Number.isInteger(r.index) || r.index < 0 || r.index >= counts[r.type]) continue;
    const key = `${r.type}:${r.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: r.type, index: r.index });
  }
  return out;
}

/** An unrecognised or invented chart_id becomes null — never fabricated
 * to look like a valid reference. */
function normaliseChartId(chartId: string | null | undefined, menuIds: Set<string>): string | null {
  return chartId && menuIds.has(chartId) ? chartId : null;
}

export async function analyseEditorialArticle(projectId: string): Promise<EditorialArticle> {
  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("project_name, research_question, research_mode, topic")
    .eq("id", projectId)
    .single();

  if (!project) throw new IntelligenceError(404, "Research project not found");
  if (!project.research_question?.trim()) {
    throw new IntelligenceError(400, "This project has no Research Question set, an Editorial Article has nothing to tell a story about without one.");
  }

  // Deliberately not a second synthesis pass — see this file's header
  // comment. The article synthesises the two approved upstream reports, it
  // never independently reanalyses raw evidence.
  //
  // The Executive Report is the structured, traceable BACKBONE. Required
  // approved: the article cites only its curated arrays.
  const report = await getSummary<ExecutiveReport>("research_project", projectId, "executive_report");
  if (!report || (report.status !== "approved" && report.status !== "published")) {
    throw new IntelligenceError(
      400,
      "This project's Executive Report must be approved before an Editorial Article can be generated, the article retells the approved report's story, it doesn't synthesise the evidence again."
    );
  }
  const reportContent = report.edited_content ?? report.content;

  // The Full Research Report is the approved analytical DEPTH the article
  // draws on to write richer sections. Also required approved — the article
  // sits downstream of BOTH reports in the hierarchy (Executive Report →
  // Full Research Report → Editorial Article), so both must have passed
  // human review before the article can be published from them. Only its
  // narrative-depth fields are used below; its raw evidence pool is never
  // exposed, and it is never a citation target.
  const frr = await getSummary<FullResearchReport>("research_project", projectId, "full_research_report");
  if (!frr || (frr.status !== "approved" && frr.status !== "published")) {
    throw new IntelligenceError(
      400,
      "This project's Full Research Report must be approved before an Editorial Article can be generated, the article draws on the approved report's deeper analysis for its depth."
    );
  }
  const frrContent = frr.edited_content ?? frr.content;

  // Manually-added sections from whatever's currently stored (if
  // anything) — carried forward unchanged below, see this file's header
  // comment for why this is a deterministic code-level merge rather than
  // something the prompt is asked to "consider".
  const existingArticle = await getSummary<EditorialArticle>("research_project", projectId, "editorial_article");
  const existingContent = existingArticle ? (existingArticle.edited_content ?? existingArticle.content) : null;
  const manualSections = (existingContent?.sections ?? []).filter(s => s.based_on.length === 0);

  // Exactly the sources the Executive Report itself included — reusing
  // its own evidence_strength.sources_included means this never needs its
  // own readiness/inclusion logic, and can never cite a source the
  // Executive Report excluded.
  const includedSources = reportContent.evidence_strength.sources_included;
  const structuredEvidence: StructuredEvidenceBlock[] = [];
  const dateRanges: { from: string; to: string }[] = [];

  for (const src of includedSources) {
    // Document Intelligence has no structured_evidence/sources_summary
    // concept (deliberately, see analyseDocumentForProject.ts's
    // DocumentIntelligenceReport — no chart data or date range for a
    // static uploaded document in this phase), so it contributes no
    // chart/date-range material here, unlike Survey/Conversation.
    if (src.evidence_type === "document") continue;
    const sourceType = src.evidence_type === "survey" ? "survey" : "conversation_search";
    const summary = await getSummary<SurveyIntelligenceReport | InsightReport>(sourceType, src.evidence_id, "research_summary");
    if (!summary) continue;
    const content = summary.edited_content ?? summary.content;
    structuredEvidence.push(...(content.structured_evidence ?? []));
    if (content.sources_summary.date_range) dateRanges.push(content.sources_summary.date_range);
  }

  const chartMenu = buildChartMenu(structuredEvidence);

  const raw = await completeJSON<RawArticle>({
    prompt: buildArticlePrompt(
      { project_name: project.project_name, research_question: project.research_question, topic: project.topic },
      reportContent,
      frrContent,
      chartMenu
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    // Headroom only, not a target: a rich multi-theme article developing
    // several strands with the Full Research Report's depth needs more room
    // than the single-angle article did, but length is governed by the
    // depth-scales-with-evidence instruction, never padded toward a ceiling.
    maxTokens:   6144,
  });

  const counts: Record<EditorialSectionReference["type"], number> = {
    finding:        reportContent.key_findings.length,
    opportunity:    reportContent.opportunities.length,
    risk:           reportContent.risks.length,
    recommendation: reportContent.recommendations.length,
    difference:     reportContent.areas_of_difference.length,
  };
  const menuIds = new Set(chartMenu.map(c => c.id));

  // A section that traces to nothing validated isn't evidence-grounded —
  // dropped entirely, never kept with a fabricated trace. Manually-added
  // sections are appended after the freshly-generated ones, unchanged —
  // see manualSections above and this file's header comment.
  const sections: EditorialSection[] = [
    ...raw.sections
      .map(s => ({
        subheading: s.subheading,
        body:       s.body,
        based_on:   normaliseSectionReferences(s.based_on, counts),
        chart_id:   normaliseChartId(s.chart_id, menuIds),
        // Never set by generation — RawArticle has no image field, see
        // EditorialSection.image's own doc comment.
        image:      null,
      }))
      .filter(s => s.based_on.length > 0),
    ...manualSections,
  ];

  const usedChartIds = new Set(sections.map(s => s.chart_id).filter((id): id is string => id !== null));
  const charts = chartMenu.filter(c => usedChartIds.has(c.id));

  const expectedSimulated = project.research_mode === "simulated";
  const sortedDates = dateRanges.flatMap(d => [d.from, d.to]).sort();

  return {
    headline:       raw.headline,
    standfirst:     raw.standfirst,
    // Defensive ?? null: the model is asked to write the literal null when
    // a field doesn't earn its place, but completeJSON can't guarantee it
    // won't simply omit the key instead — both must resolve the same way.
    key_takeaways:  raw.key_takeaways ?? null,
    introduction:   raw.introduction ?? null,
    // Never set by generation — same reasoning as sections[].image above.
    hero_image:     null,
    sections,
    conclusion:     raw.conclusion ?? null,
    charts,
    research_basis: {
      sources:          includedSources.map(s => ({ evidence_type: s.evidence_type, evidence_id: s.evidence_id, label: s.label })),
      date_range:       sortedDates.length ? { from: sortedDates[0], to: sortedDates[sortedDates.length - 1] } : null,
      methodology_note: `Based on ${includedSources.length} approved Research Source${includedSources.length === 1 ? "" : "s"} attached to this project, as synthesised in the approved Executive Report and Full Research Report.`,
    },
    generated_at:      new Date().toISOString(),
    research_mode:     project.research_mode,
    synthetic_notice:  expectedSimulated ? EDITORIAL_ARTICLE_SYNTHETIC_NOTICE_TEXT : null,
    research_question: project.research_question,
    // Dual-upstream staleness snapshots: this article is downstream of both
    // approved reports, so it becomes stale if EITHER changes after it was
    // built (see the review page's staleness check).
    executive_report_generated_at:      reportContent.generated_at,
    full_research_report_generated_at:  frrContent.generated_at,
  };
}
