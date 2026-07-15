// Reusable analyst: synthesises every included Research Source's approved
// Intelligence into one Executive Report — the first of what will be a
// family of Report output types (see supabase-migration-074.sql).
//
// Two-call staged pipeline, not one — this replaced a single completeJSON
// call that asked one model pass to move directly from raw source material
// to key_findings, opportunities, recommendations, research_answer AND
// executive_summary in the same breath. That let unsupported strategic
// confidence propagate freely: research_answer could read as a settled
// conclusion even when the very findings/recommendations generated
// alongside it, in the same completion, only supported a tentative one —
// same-call "check yourself against your own output" instructions proved
// unreliable in practice (see the design discussion this file's git history
// captures). The fix isn't more instructions, it's removing the model's
// ability to invent research_answer's confidence level at all:
//   Call 1 (buildEvidenceSynthesisPrompt) — reads the raw source material,
//     produces key_findings, areas_of_agreement (tagged with structured
//     `supporting_findings`, validated to genuinely span two source types
//     or dropped), areas_of_difference (each tagged with a structured
//     `resolved` boolean, not prose alone), evidence_gaps, opportunities,
//     risks and recommendations (each optionally `targets`-ing a specific
//     finding/gap/difference index). Never sees or writes
//     research_answer/executive_summary/headline.
//   Between calls (pure code) — answer_status/answer_basis are computed
//     deterministically from Call 1's own validated output, never asked of
//     any model. This is the actual fix: the confidence tier is a fact
//     established before Call 2 ever runs, not a field Call 2 can choose.
//   Call 2 (buildResearchAnswerPrompt) — receives ONLY Call 1's finished,
//     validated synthesis (serialised back as plain text) plus the fixed
//     answer_status and why, never the raw source material again. Its
//     schema has no answer_status field to invent, so it can only write
//     within the tier it's given, not decide a different one.
//
// Same "derived, not freeform" principle as every other trust/status value
// in this app (lib/research-project-status.ts, lib/campaign-status.ts) —
// just now applied to the confidence tier itself, not only to
// key_findings[].corroboration.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { getSummary } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { clampReferences } from "@/lib/intelligence/validate-references";
import { computeReportReadiness, assertReportReadiness, type ReadinessEvidenceItem } from "@/lib/report-readiness";
import { getEvidenceTypesWithIntelligence, getIntelligenceSourceType, getSourceLabel, type EvidenceTypeId } from "@/lib/research-sources/registry";
import type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";
import type { InsightReport } from "@/lib/intelligence/analysts/analyseConversation";
import type { DocumentIntelligenceReport } from "@/lib/intelligence/analysts/analyseDocumentForProject";

export type ExecutiveReportFinding = {
  finding: string;
  /** AI-tagged: which included sources actually back this finding. */
  supporting_sources: ("survey" | "conversation_search" | "document")[];
  /** Code-derived from supporting_sources.length >= 2 — never AI-authored. */
  corroboration: "single_source" | "cross_source";
};

export type ExecutiveReportDifference = {
  finding: string;
  explanation: string;
  /** AI-tagged: did the sources actually establish a cause for this
   * divergence (true), or does the explanation only honestly say the cause
   * isn't established (false)? A structured signal, not a prose pattern
   * code has to guess at — see normaliseResolvedFlag's fallback for the
   * rare case this is missing or malformed. */
  resolved: boolean;
  /** AI-tagged 0-based indices into key_findings this divergence is built
   * from — the same discipline ExecutiveReportAgreement.supporting_findings
   * already has, added so the two can be checked against each other: an
   * agreement and a difference citing the same evidence cannot both be
   * true (one claims convergence, the other divergence), see
   * dropContradictedAgreements. */
  supporting_findings: number[];
};

export type ExecutiveReportAgreement = {
  finding: string;
  /** AI-tagged 0-based indices into key_findings this claimed agreement is
   * built from. Unlike a single key finding's own supporting_sources tag
   * (a claim about one finding, which code merely reads), a claim of
   * "agreement" spans multiple findings, so it gets its own check — see
   * normaliseAgreements. An item only survives validation if the union of
   * its cited findings' own supporting_sources genuinely spans two
   * distinct source types; a claim that doesn't clear that bar is dropped
   * entirely, never rewritten to look like it clears it. */
  supporting_findings: number[];
};

/** What a recommendation is actually responding to, so an "investigate X"
 * recommendation has to point at a real, already-named finding, evidence
 * gap or unresolved difference rather than free-floating on an invented
 * solution category. Validated (bounds-checked, not fabricated) in
 * normaliseTarget — a missing or invalid target becomes null, it is never
 * invented to fill the gap. */
export type RecommendationTarget = { type: "finding" | "gap" | "difference"; index: number };

export type ExecutiveReportRecommendation = {
  action: string;
  rationale: string;
  /** AI-tagged 0-based indices into key_findings — the evidence-to-action trace. */
  based_on_findings: number[];
  targets: RecommendationTarget | null;
};

// "substantially_answered" sits between the two extremes — added because
// the original 3-tier gate was all-or-nothing: ANY unresolved difference
// or evidence gap forced "partially_answered" regardless of how much else
// the evidence established, which meant a report drawing on a broad,
// four-source pool with one open contradiction read exactly as
// hedged/uncertain as a report with almost nothing established at all. See
// computeAnswerAssessment's own doc comment for the actual (still
// deterministic, still code-derived) rule this status now reflects.
export type AnswerStatus = "fully_answered" | "substantially_answered" | "partially_answered" | "not_answered";

/** Computed entirely in code from Call 1's validated output — never asked
 * of either model call. See computeAnswerAssessment(). Not rendered
 * anywhere in the client-facing report — validation/auditability only. */
export type AnswerBasis = {
  /** 0-based indices into key_findings that are actually cross_source. */
  corroborated_findings: number[];
  /** 0-based indices into areas_of_difference where resolved === false. */
  unresolved_differences: number[];
  /** Copied verbatim from Call 1's own evidence_gaps — informational, not
   * independently re-verified beyond what Call 1 already validated. */
  evidence_gaps: string[];
};

export type EvidenceStrengthSourceRef = {
  evidence_type: EvidenceTypeId;
  evidence_id: string;
  label: string;
};

export type EvidenceStrength = {
  /** @deprecated Compressed Evidence Coverage, Method Diversity and
   * Cross-source Corroboration into one client-facing judgement — a report
   * with broad coverage and mixed methods but zero finding-level
   * corroboration could still read "Substantiated", which is misleading.
   * Kept computed (unchanged) purely so this type's shape doesn't change
   * for already-stored reports; no longer rendered, exported or fed into
   * Conclusion generation anywhere. Use method_diversity,
   * corroborated_findings/total_findings and sources_included/excluded
   * directly instead — those three stay independent and are always
   * accurate on their own. */
  tier: "provisional" | "substantiated" | "robust";
  /** @deprecated Same reason as tier above — the sentence blended source
   * count into the word "corroborated", which described coverage, not
   * agreement. Kept computed, unused. */
  summary: string;
  method_diversity: "single_method" | "mixed_method";
  corroborated_findings: number;
  total_findings: number;
  sources_included: EvidenceStrengthSourceRef[];
  sources_excluded: (EvidenceStrengthSourceRef & { reason: string })[];
};

export const SYNTHETIC_NOTICE_TEXT =
  "This report is based entirely on simulated evidence generated for demonstration purposes. It does not reflect real research findings.";

/** A materially relevant thread the evidence speaks to, in relation to the
 * Research Question — the depth layer beneath the concise Research
 * Answer/Executive Summary, giving a reader who wants to know "why" a
 * theme-organised synthesis with its own evidence trail. No arbitrary cap
 * on how many themes exist, same "scale with the evidence, don't pad or
 * truncate to a target count" principle as key_findings itself.
 *
 * Split across both calls, matching their existing division of labour:
 * Call 1 identifies theme + supporting_findings (structural tagging, the
 * same kind of work it already does for supporting_sources/
 * supporting_findings elsewhere) — validated exactly like
 * areas_of_agreement.supporting_findings: clampReferences against the
 * real key_findings array, and a theme with ZERO valid references after
 * validation is dropped entirely, never kept with a fabricated or empty
 * evidence trail. This is the direct fix for the Germany incident — a
 * theme can no longer carry a material claim with nothing tracing back to
 * it. Call 2 (which already receives the full validated Call 1 output,
 * just never the raw sources) writes the connective `synthesis` prose per
 * theme and decides which of Call 1's own already-validated opportunities/
 * risks/recommendations relate to it — never a second, independently
 * re-authored copy of that content, always a reference into the one
 * canonical list, so the Strategic Themes section and the flat legacy
 * sections can never silently disagree with each other. */
export type StrategicTheme = {
  theme: string;
  /** Validated 0-based indices into key_findings — every retained theme
   * has at least one. */
  supporting_findings: number[];
  /** What the linked evidence collectively means for this theme, in
   * relation to the Research Question — reasons across and connects the
   * findings, not a restatement of each one in turn. */
  synthesis: string;
  /** Cross-references into the top-level opportunities/risks/recommendations
   * arrays below — never every theme's own independent list, and never
   * forced to be non-empty. A theme with no directly-related opportunity,
   * risk or recommendation simply has empty arrays here; that's expected
   * for a purely descriptive/contextual theme, not an error. */
  related_opportunities: number[];
  related_risks: number[];
  related_recommendations: number[];
};

export type ExecutiveReport = {
  headline: string;
  /** One declarative sentence, direct answer to the project's research_question. Rendered above (never inside) executive_summary. */
  research_answer: string;
  /** Computed in code from Call 1's output, before Call 2 ever runs — see
   * computeAnswerAssessment(). Governs how confidently research_answer/
   * executive_summary are allowed to read. Not surfaced prominently in the
   * client-facing report, used for validation and auditability only. */
  answer_status: AnswerStatus;
  answer_basis: AnswerBasis;
  executive_summary: string;
  /** The Strategic Themes section — the depth layer beneath research_answer/
   * executive_summary, rendered in full on-screen, in the PDF/print
   * output, and in the PPTX export. See StrategicTheme's own doc comment. */
  major_themes: StrategicTheme[];
  key_findings: ExecutiveReportFinding[];
  areas_of_agreement: ExecutiveReportAgreement[];
  areas_of_difference: ExecutiveReportDifference[];
  /** What the Research Question would need but the approved sources don't
   * cover — Call 1's own output, promoted to a first-class field rather
   * than buried only inside answer_basis. */
  evidence_gaps: string[];
  opportunities: string[];
  risks: string[];
  recommendations: ExecutiveReportRecommendation[];
  evidence_strength: EvidenceStrength;
  generated_at: string;
  /** Server-set from the project — never AI-authored, never client-supplied.
   * Every rendering surface (on-screen, PDF print, PPTX export) reads this
   * directly off the report object it already has, rather than a separate
   * lookup that a different render path could omit. */
  research_mode: "real" | "simulated";
  /** Literal sentence embedded in the content itself, rendered above the
   * headline, when research_mode === 'simulated' — null otherwise. Travels
   * with the report data, not with page chrome around it. */
  synthetic_notice: string | null;
  /** Server-set from the project at generation time — a snapshot, not a
   * live reference. Lets every renderer detect "the project's Research
   * Question has since changed" by comparing this against the project's
   * current one, without a second lookup. */
  research_question: string;
};

/** Call 1's raw shape — everything grounded directly in the source
 * material. Deliberately has no headline/research_answer/executive_summary
 * field at all, those don't exist until Call 2. */
type RawEvidenceSynthesis = {
  // significance is AI-declared, transient — used only to detect an
  // orphaned "material" finding between the two calls (see
  // findOrphanedMaterialFindings), never carried into the stored
  // ExecutiveReportFinding, so no downstream consumer (this report's own
  // page, PPTX export, Full Research Report) needs to know it exists.
  key_findings: { finding: string; supporting_sources: ("survey" | "conversation_search" | "document")[]; significance?: "material" | "supporting" }[];
  areas_of_agreement: { finding: string; supporting_findings: number[] }[];
  areas_of_difference: { finding: string; explanation: string; resolved: boolean; supporting_findings: number[] }[];
  evidence_gaps: string[];
  // Tagged with based_on_findings, the same discipline recommendations
  // already use — public ExecutiveReport.opportunities/risks stay plain
  // string[] (no rendering/editing code changes needed), this richer
  // shape only exists transiently between the two calls, to let the
  // theme-coverage backstop below check completeness deterministically.
  opportunities: { text: string; based_on_findings: number[] }[];
  risks: { text: string; based_on_findings: number[] }[];
  recommendations: { action: string; rationale: string; based_on_findings: number[]; targets: RecommendationTarget | null }[];
  // Structural only at this stage (theme + which findings establish it) —
  // deliberately LAST in this type and in the JSON shape the prompt asks
  // for, after key_findings, opportunities, risks and recommendations all
  // already exist: themes must account for every one of those, so they
  // all need to already exist for the model to check completeness against
  // before finalising this list (see COMPLETENESS CHECK in the prompt).
  // The connective synthesis prose is Call 2's job, see StrategicTheme's
  // own doc comment for why.
  major_themes: { theme: string; supporting_findings: number[] }[];
};

/** Call 2's raw shape. No answer_status field: there is nothing for Call 2
 * to invent, the status is handed to it as an already-decided fact in the
 * prompt itself. theme_synthesis is Call 2's own contribution to
 * StrategicTheme — see that type's doc comment for the split. */
type RawResearchAnswer = {
  headline: string;
  research_answer: string;
  executive_summary: string;
  theme_synthesis: {
    /** 0-based index into the major_themes list Call 2 was shown (the
     * same order/numbering as ValidatedEvidenceSynthesis.major_themes) —
     * never a freeform theme name match, so a typo or paraphrase can't
     * silently fail to attach. */
    theme_index: number;
    synthesis: string;
    related_opportunities: number[];
    related_risks: number[];
    related_recommendations: number[];
  }[];
};

/** A theme after Call 1's own structural validation (clampReferences on
 * supporting_findings, dropped entirely if nothing valid survives) but
 * before Call 2 has written its synthesis/related_* — see StrategicTheme's
 * doc comment for the two-call split this reflects. */
type ValidatedTheme = { theme: string; supporting_findings: number[] };

/** Call 1's output after clampReferences/normaliseTarget/normaliseAgreements
 * and the generic-fix-it recommendation filter have run — this is what
 * Call 2 is actually built from, never the raw completion. */
type ValidatedEvidenceSynthesis = {
  major_themes: ValidatedTheme[];
  key_findings: ExecutiveReportFinding[];
  areas_of_agreement: ExecutiveReportAgreement[];
  areas_of_difference: ExecutiveReportDifference[];
  evidence_gaps: string[];
  opportunities: string[];
  risks: string[];
  recommendations: ExecutiveReportRecommendation[];
};

type IncludedSource = {
  evidence_type: EvidenceTypeId;
  evidence_id: string;
  label: string;
  content: SurveyIntelligenceReport | InsightReport | DocumentIntelligenceReport;
};

function describeSource(s: IncludedSource): string {
  const lines: string[] = [];
  if (s.evidence_type === "survey") {
    const c = s.content as SurveyIntelligenceReport;
    lines.push(`### ${s.label}, Survey Intelligence (quantitative)`);
    lines.push(`Headline: ${c.headline}`);
    lines.push(`Executive Summary: ${c.executive_summary}`);
    lines.push("Key Findings:");
    lines.push(...c.key_findings.map(f => `- ${f}`));
    if (c.notable_differences.length) {
      lines.push("Notable Differences:");
      lines.push(...c.notable_differences.map(d => `- ${d.finding} (${d.segments.join(", ")})`));
    }
    lines.push("Recommended Actions (this source's own conclusions, background context only — do not carry forward as this report's own recommendation, see rules below):");
    lines.push(...c.recommended_actions.map(a => `- ${a.action}: ${a.rationale}`));
  } else if (s.evidence_type === "social_search") {
    const c = s.content as InsightReport;
    lines.push(`### ${s.label}, Conversation Intelligence (qualitative)`);
    lines.push(`Headline: ${c.headline}`);
    lines.push(`Executive Summary: ${c.executive_summary}`);
    lines.push("Positive Drivers:");
    lines.push(...c.positive_drivers.map(f => `- ${f}`));
    lines.push("Key Concerns:");
    lines.push(...c.key_concerns.map(f => `- ${f}`));
    if (c.market_differences.length) {
      lines.push("Market Differences:");
      lines.push(...c.market_differences.map(d => `- ${d.finding} (${d.markets.join(", ")})`));
    }
    lines.push("Recommended Actions (this source's own conclusions, background context only — do not carry forward as this report's own recommendation, see rules below):");
    lines.push(...c.recommended_actions.map(a => `- ${a.action}: ${a.rationale}`));
  } else {
    const c = s.content as DocumentIntelligenceReport;
    lines.push(`### ${s.label}, Document Intelligence (uploaded document, already interpreted against this project's Research Question)`);
    lines.push(`Headline: ${c.headline}`);
    lines.push(`Executive Summary: ${c.executive_summary}`);
    lines.push("Key Findings (reordered by significance to this project's Research Question, most significant first — note: a document's own key findings may include that document's own analytical framework, taxonomy or opinion, not only directly observed facts, see SOURCE FRAMEWORK ATTRIBUTION below):");
    lines.push(...c.key_findings.map(f => `- ${f.text}`));
    if (c.statistics.length) {
      lines.push("Statistics:");
      lines.push(...c.statistics.map(st => `- ${st.value ? `${st.value}: ` : ""}${st.text}`));
    }
    if (c.strategic_implications.length) {
      lines.push("Strategic Implications (this source's own, background context — not this report's opportunities/risks unless independently supported):");
      lines.push(...c.strategic_implications.map(imp => `- ${imp}`));
    }
    lines.push("Recommended Actions (this source's own conclusions, background context only — do not carry forward as this report's own recommendation, see rules below):");
    lines.push(...c.recommended_actions.map(a => `- ${a.action}: ${a.rationale}`));
  }
  return lines.join("\n");
}

// ── Call 1: Evidence Synthesis ──────────────────────────────────────────
function buildEvidenceSynthesisPrompt(
  project: { project_name: string; research_question: string; objective: string | null; study_type: string; topic: string | null },
  sources: IncludedSource[]
): string {
  return `You are a senior research director at Fanometrix, building the evidence base a later stage will use to write an Executive Report's headline and Research Answer. Your job is that later stage's only input, it will not see the raw sources below, it sees only what you produce here, so be precise, complete and honest about what is and isn't established. You write with more authority than a single-source analyst report, authority means being precise and decisive about exactly what the evidence does and doesn't establish, not sounding more confident than the evidence allows.

RESEARCH PROJECT: "${project.project_name}"
RESEARCH QUESTION: "${project.research_question}"
${project.objective ? `OBJECTIVE: ${project.objective}\n` : ""}Study type: ${project.study_type}${project.topic ? ` · Topic: ${project.topic}` : ""}

RESEARCH SOURCES INCLUDED IN THIS SYNTHESIS (${sources.length}):

${sources.map(describeSource).join("\n\n")}

YOUR TASK
Synthesise these sources into one coherent evidence base that speaks to the Research Question above. Do not simply concatenate each source's findings, combine them into a single coherent narrative, organised by insight, not by source. Do not write a final answer to the Research Question here, a separate stage does that from your output alone, once you return, your output is treated as finished and is not revisited.

STRATEGIC THEME COVERAGE, non-negotiable:
- Think through every major strategic theme the evidence above materially speaks to, in relation to the Research Question, BEFORE deciding what to write in "key_findings" — a theme is "major" if multiple pieces of evidence substantively address it, or a single source addresses it in real depth, not every passing mention, but not only the single most dramatic fact either. There is no fixed number of themes — a broad Research Question drawing on several rich sources should surface more themes than a narrow one drawing on a single thin source.
- SCOPE ATOMICITY: each key finding must cover exactly one country, market, segment or distinct strategic subject — never combine two differently-scoped facts into a single finding merely because the source material states them in the same sentence or paragraph. If the source material says one thing about Market/Subject A and a separate thing about Market/Subject B, even a related or contrasting one (e.g. "positive sentiment about sponsorship in Country X, but negative sentiment about matchday experience in Country Y"), write these as two separate key_findings. A finding that silently bundles two scopes together makes it impossible for one of those scopes to ever get its own theme later, since a theme can only reference whole findings, never part of one.
- "key_findings" must represent EVERY theme you identified, not just the one or two most attention-grabbing facts. There is likewise no fixed number of key findings — scale with the breadth and complexity of the evidence, exactly as the theme count does. Never pad with duplicate or genuinely minor facts to inflate the count, and never omit a materially relevant theme just because a more dramatic or specific finding exists elsewhere in the evidence. Completeness across the themes you identified matters more than reaching, or staying under, any particular length.
- Tag every key finding with "significance": "material" if it represents a distinct strategic thread genuinely relevant to the Research Question, one that deserves to be reflected somewhere in this output (a theme, an opportunity, a risk, or a recommendation) — "supporting" if it's genuinely secondary or contextual evidence that legitimately does not need its own downstream treatment. Most findings are "supporting" — reserve "material" for findings that would represent a real gap in the analysis if nothing else in this output ever referenced them. This is not a formality: it is checked below, and a finding you mark "material" that ends up connected to nothing will be treated as a genuine gap in your own output, not a valid outcome.
- "major_themes" is the LAST thing you write in this output, after key_findings, opportunities, risks and recommendations all already exist below — this is deliberate. For each theme, "supporting_findings" is the 0-based indices into key_findings that establish it. Every theme you list MUST have at least one supporting finding — a theme with no finding behind it doesn't belong in this output, it's not a real theme, it's an unsupported label. If a theme genuinely spans multiple distinct facts (e.g. a market-sentiment theme covering more than one country), reference every finding that actually supports it, not just the most convenient one — a theme's claim about a specific market, country or segment must trace to a finding that specifically names that market, country or segment, never generalised in from a differently-scoped finding.
- COLLECTIVE SCOPE — the theme NAME must accurately represent the collective scope of ALL its supporting findings, not just one of them, non-negotiable. This is the reverse of the rule above and equally binding: the rule above says "if you name a market, have a finding for it"; this says "if you include a finding, the name must cover it." Concretely: if you name a theme after ONE specific market, country, segment or subject (e.g. "Brand sentiment in Spain"), then EVERY supporting finding must be about that same market/subject — a single Spain-named theme may not contain a Germany finding. If the findings you have grouped genuinely span more than one market or subject (e.g. Spain dislike AND Germany positivity), you must do ONE of two things, deliberately: (a) if they cohere as one broader theme, NAME it for that collective scope — "Regional brand sentiment", "Brand sentiment across markets", "Cross-market sentiment" — never after just one of the markets it covers; or (b) if a finding does not genuinely belong with the others, give it its own theme instead of grouping it under a name that doesn't represent it. A theme whose name is narrower than the evidence it groups is a mislabel, not a valid theme — the reader must be able to trust that "Brand sentiment in Spain" is about Spain, and that a multi-market theme is named as such. Cross-market grouping is fully allowed and often valuable; it just has to be named honestly as cross-market.
- COMPLETENESS CHECK, non-negotiable: before finalising "major_themes", go through every opportunity and risk you wrote and confirm the finding(s) its own "based_on_findings" points to are covered by some theme's "supporting_findings". If they genuinely are — the opportunity/risk is really just another angle on a theme you already identified — add that finding to the existing theme if it isn't already listed there. If they are not, and the opportunity/risk represents a genuinely distinct strategic thread in its own right, add a new theme for it. Do not leave a material opportunity or risk resting on evidence that no theme covers. This is about correcting genuine gaps, not inflating the count — a risk or opportunity that is only a minor restatement of a theme you already have needs no new theme, it is already covered.
- Then separately, go through every key finding you tagged "material" and confirm it is covered by some theme's "supporting_findings", or by some opportunity/risk/recommendation's own "based_on_findings". If it is, nothing more to do. If it is not, decide: does it genuinely belong inside an existing theme (add it to that theme's "supporting_findings"), or does it represent a strategic thread distinct enough to deserve its own new theme? Either way, it must end up connected to something — a "material" finding connected to nothing by the time you finish is a contradiction of your own significance tag, not an acceptable output. A finding tagged "supporting" never needs this, whether or not anything else ends up referencing it.
- A contradiction between sources (an area of difference) is one analytical signal among the themes you identified — real, worth tagging and explaining, but it must never by default become the sole organising theme of the whole synthesis merely because it is the most dramatic single item, when other major themes above also have genuine evidentiary weight. It may legitimately be the dominant conclusion only if the evidence itself shows that: every other theme is comparatively thin, tangential to the Research Question, or the contradiction is what the Research Question is actually asking about. That must be a conclusion the evidence supports, never a default assumption made simply because a contradiction happens to be present.

CONSTRUCT COMPARABILITY GATE for areas_of_difference, non-negotiable — read this before you write a single area of difference:
Two findings are a contradiction ONLY if they measure the SAME thing and disagree about it. Opposite sentiment direction is NOT, by itself, a contradiction. Before you put any pair of findings in "areas_of_difference", pass them through this gate by asking, for each finding: WHAT exactly was measured, in WHOM, and about WHAT? If the answers differ, the findings are not comparable and are not a contradiction — no matter how tempting the "one is negative, one is positive" framing is.
- Different CONSTRUCT: how much people like the brand/product itself is a different thing from sentiment about the brand's sponsorship, marketing or a specific activity. A person can dislike a product yet approve of its sponsorship of an event. So "X% dislike the brand" (a brand-liking measure) and "Y% positive about the sponsorship" (a sponsorship-sentiment measure) do NOT contradict — they measure two different constructs and can both be true at once. This is the single most common false contradiction; do not create it.
- Different POPULATION: survey respondents, social-media posters, and a document's cited sample are different populations. One being more positive than another is not a contradiction, it is two populations.
- Different CONTEXT/QUESTION: a general-attitude question and an event- or campaign-specific reaction are different questions.
If a candidate pair fails this gate, they are related-but-different findings: keep them as separate key findings, or note them as complementary, or (only if they genuinely converge on the SAME construct) as an area of agreement — but do NOT place them in areas_of_difference and do NOT write an "explanation" for a contradiction that isn't one. Only a genuine same-construct, comparable-population, comparable-context disagreement is an area of difference. This gate is a GENERAL rule for every project and every pair of measures — it is not about any specific source type, market or topic, the brand-vs-sponsorship case above is only the clearest worked example of the general principle.

SOURCE FRAMEWORK ATTRIBUTION, non-negotiable:
- A source above, especially an uploaded Document, may present its OWN named framework, taxonomy, archetype, persona or subjective interpretation — recognisable because the source is characterising, categorising or labelling something (e.g. assigning a proprietary brand "archetype" or persona, offering a strategic opinion) rather than reporting a percentage, count or direct observation it measured. This is different from a fact and must be written differently.
- When a key finding, opportunity, risk or recommendation rests on this kind of claim, explicitly attribute it to the source by name (the source's title, as shown in its own header above) rather than stating it as settled, independently-established fact. Correct: "[Source title] positions Coca-Cola as a 'Captain' brand within its own sponsorship archetype framework." Incorrect: "Coca-Cola is a 'Captain' brand."
- This does not mean weakening, hedging away, or dropping a valuable single-source framework — a well-evidenced interpretation from one source remains genuinely useful and can still ground a real opportunity or recommendation. The requirement is attribution, not exclusion or dilution: name the source, then use its framework with the same commercial decisiveness you would use for any other finding.
- Write the attribution as part of the finding/opportunity/risk/recommendation's own sentence, not a footnote — the next stage only ever sees the text you write here, if the attribution isn't in the sentence itself it will not survive into the report.

HOUSE STYLE, non-negotiable:
- Every key finding must state only what the approved source intelligence actually establishes, specific enough to be useful (a real percentage, count or direct observation), never a vague, generic restatement, but also never more than the evidence itself says. A key finding must NOT add: a qualitative relabelling of what a measurement means (describing a percentage as "favorable", "strong", "significant interest" or similar, when that framing isn't itself the measured fact), a commercial implication or potential, a desired outcome, an opportunity, a causal interpretation, strategic meaning, an inferred consequence, or solution language, in any phrasing. This is a general test, not a closed list to route around: apply it to every clause in a candidate finding by asking whether removing that clause would lose any of the actual measured content — if the sentence would still contain 100% of the same fact without it, that clause is not evidence, it is commentary on the evidence, and it does not belong in a key finding, however it is worded. That is what opportunities, risks and recommendations are for, a key finding states the fact, it does not characterise or say what the fact might mean. Example: if a source shows 29% of UK respondents consume Coca-Cola "now and again", the finding may report that fact and a supported comparative context (e.g. the highest such share among the surveyed countries). It must NOT add "indicating potential for increased brand affinity" or "indicating a favorable perception" or any equivalent — neither clause adds a measured fact, both are commentary invented during synthesis, and neither belongs in a key finding under any wording. Tag each with "supporting_sources": which of the sources above ("survey", "conversation_search", "document", or any combination) actually back it. Be honest — never claim a source supports a finding it doesn't.
- Every recommendation must cite "based_on_findings": the 0-based index/indices into the key_findings array that justify it. A recommendation with no finding behind it doesn't belong in this report.
- Areas of Difference: an area of difference must FIRST pass the CONSTRUCT COMPARABILITY GATE (its own section above) — only genuinely comparable findings that actually disagree belong here. For a difference that passes that gate: first check whether the evidence actually establishes WHY sources diverge, before choosing an explanation. Do not default to a plausible-sounding category (methodology, market, timing, audience) just because it is an allowed one, if the sources don't actually establish that it's the reason for this specific divergence. If the evidence does establish a cause, state it as whichever of methodology/market/timing/audience it genuinely is, and set "resolved" to true. If it does not, say so plainly in "explanation", e.g. "The available evidence shows this difference but does not establish why it exists", and set "resolved" to false — that is more honest and more valuable than inventing a plausible-sounding cause. Never explain away conflicting evidence merely because a plausible explanation exists in the abstract, it must be grounded in what the sources actually measured or said. Tag it with "supporting_findings": the 0-based indices into key_findings that the two (or more) genuinely-diverging sources actually are — the same discipline "areas_of_agreement" already uses. This is checked against "areas_of_agreement" in code: the same set of findings cannot honestly support both a claim of convergence and a claim of divergence, so tag only the findings that genuinely are in conflict with each other.
- "evidence_gaps" lists anything the Research Question would need but the sources don't cover, empty array if nothing is missing. Be specific about what's missing, not just that something is.
- Ban stock filler phrases: "it is worth noting", "in conclusion", "overall", "it is interesting to note".
- Preserve the real numbers already cited in the source material above wherever a finding carries one, so claims should be backed by a percentage or count, not softened into a bare qualitative statement during synthesis.
- Do not rate your own confidence anywhere in this output, that is computed separately from the tags you provide.

DE-DUPLICATION, non-negotiable — each field below has a distinct job AND a distinct evidentiary standard, the same fact should appear in exactly ONE of them, chosen for where it does the most work, not repeated in different words because it could technically fit several:
- "key_findings" = what the evidence establishes, and nothing more. No interpretation, implication or inferred meaning belongs here, see EVIDENCE SPECIFICITY below for the exact, non-negotiable boundary this field is held to.
- "areas_of_agreement"/"areas_of_difference" = how the sources relate to each other, where they converge or diverge, not new facts of their own. "areas_of_agreement" is NOT a second list of findings, only include an item here if it adds something a key finding's own corroboration tag doesn't already say, specifically, why this convergence matters, not just that it exists, empty array if nothing meets that bar, do not manufacture agreement to fill the section. Critically, "agreement" means genuine cross-source convergence, not two different findings from the same single source, and not one source's own internal comparison between two markets or segments — tag every item with "supporting_findings": the 0-based indices into key_findings that together establish it, and that set must genuinely include findings backed by different source types, this is checked in code, an item that doesn't clear that bar is removed regardless of how the prose reads. "areas_of_difference" is a genuine conflict or divergence between sources, not a difference already fully captured as two separate key findings.
- "evidence_gaps" = what the Research Question would need but the sources don't cover, a fact about the evidence's own coverage, not an opinion or a judgement call.
- "opportunities"/"risks" = cautious interpretation of what the evidence may imply, forward-looking, for the client, not a restatement of a key finding's fact, and not the same specific action as a recommendation stated again in different words. If a specific action belongs in "recommendations", name the underlying potential or concern in "opportunities"/"risks" instead, not the same tactic twice. Include as many as the evidence genuinely supports, up to 5 opportunities and 4 risks, never pad to reach those numbers. Tag each with "based_on_findings": the 0-based index/indices into key_findings it's grounded in, the same discipline recommendations already use — used to check theme coverage below, leave it empty only if a risk/opportunity is genuinely a broad pattern not tied to one specific finding.
- "recommendations" = what should be investigated, tested, validated or acted on, within the boundary the evidence actually supports, traced to its findings via based_on_findings, it should not re-explain the finding in prose.

EVIDENCE SPECIFICITY, non-negotiable — keep what the evidence says separate from what you are proposing or inferring in response to it:
- "key_findings" must contain no qualitative relabelling, inferred commercial consequence, desired outcome, opportunity, causal interpretation, strategic meaning or solution language whatsoever, state only what was measured or directly observed, stop at the fact itself — apply the removability test from HOUSE STYLE above to every finding before including it. The source material above may itself contain a single specific example (a named idea, initiative or format one respondent or a handful of mentions raised). Do not lift that one specific detail into a "key_finding" as if it were a broadly evidenced fact — a key finding must describe the pattern the evidence actually supports (e.g. "fans want community investment"), not the single most quotable example of it, and it must never add what that fact might mean for the brand.
- "opportunities" and "risks" may interpret the evidence, that is their job, but each one must make the line between evidence and inference visible in its own sentence ("X shows Y, which could mean Z", not "Z is happening" stated as settled fact), and must not assert an invented cause, consequence or solution as though it were established. An opportunity names where potential exists, not the specific tactic to run there NOR the desired commercial outcome itself, that is what recommendations are for — this bans both generic solution-shaped phrasing ("through tailored sponsorship initiatives", "via community-focused programs" name a solution type just as much as a fully named idea does) AND naming any commercial outcome or metric you expect the client to gain, whatever noun is used for it. Apply this test, not a fixed list: is the named outcome (engagement, presence, affinity, awareness, loyalty, consumption growth, brand strengthening, or any other outcome-shaped noun) itself something a source above directly measured? If not, it is invented, drop it — an opportunity may say potential exists in a market or theme, it must not say what increases as a result, even using a different word than the ones in this paragraph. An opportunity should name only the market or theme and that potential exists there, nothing about how to act on it or what acting on it would achieve. A risk must distinguish a plausible future risk from a measured consequence, and must not imply an unsupported causal relationship: name what could go wrong and why, framed as a genuine possibility grounded in the evidence (e.g. "strong dislike could affect brand perception if unaddressed" is a plausible risk; stating that it "will harm the brand's image" as settled fact is not, that consequence was never measured), never as a confident prediction.
- Every recommendation must pass a test before it can name a specific execution: does a source above directly support that specific action, not just the underlying theme or problem? If yes, name it, and say so plainly in the rationale, e.g. "fans want community investment; a possible execution is funding local youth academies" is honest when a finding genuinely supports it. If the evidence only establishes a problem, gap or contradiction without establishing the right response, the recommendation must investigate that actual gap, cause or contradiction, never a preselected solution: "investigate why fans report concerns about X" or "investigate the reasons behind Y" is valid, "investigate ways to enhance X" or "investigate ways to improve Y" is NOT, that still assumes enhancement or improvement is the correct response before the cause is even understood. A generic fix-it phrasing that just restates the problem with an action verb attached ("enhance X", "improve X", "address X concerns") is not a validated solution either when X is only known to be a problem, not a tested intervention, that must default to investigating the actual gap instead, exactly the same as a more elaborately invented tactic would. Watch for this same preselection hiding in a trailing purpose clause on an otherwise valid investigation: "investigate the reasons behind the dislike" is valid on its own, appending "to develop targeted engagement strategies" smuggles a solution category back in before the cause is even known, drop the purpose clause, or replace it with something that names what the investigation itself should determine (e.g. "...to determine what response, if any, is warranted"), never a specific solution type. Critically, an "investigate" recommendation must set "targets" to the specific finding, evidence gap or unresolved difference it is actually investigating (e.g. {"type": "difference", "index": 0} for "investigate why sentiment differs between survey and social data in Spain"), never leave the object of investigation as a restated solution category (NOT {"type": null} paired with "investigate engagement strategies" when nothing established engagement strategy is the right response, that just relocates the same invented specificity one level down). Set "targets" to null only when a recommendation is specific and directly evidenced enough that it doesn't need to point back to a gap. A specific recommendation is valuable and encouraged when the evidence genuinely supports it, this rule exists to stop invented specificity, not to make every recommendation vague. A recommendation's "rationale" must describe the actual supporting evidence accurately, it must not retroactively make that evidence more specific than it was.
- Never add a fact, cause or tactic during synthesis that is absent from the source material above. You may combine sources, generalise across them, or draw out a pattern none of them stated alone, but every specific detail in your output (a named idea, initiative, format or causal explanation) must already appear in at least one source. Each source's own "Recommended Actions" listed above are background context for understanding what that source itself concluded, they are NOT pre-approved content for this report and must never be copied forward merely because they already name a specific tactic. Every recommendation you write must independently satisfy the recommendations rule above, evaluated fresh against the evidence available to you, regardless of what a source itself already recommended — a source-level recommendation can itself be a preselected solution or an unhedged strategic claim, and this report's stricter evidence discipline must not inherit that by copying it forward.
- Every percentage in the source material above was computed at a specific level, overall, a specific market, or a specific survey question/option, never per-topic within a market. Preserve that exact scope when you reuse it during synthesis: a source's overall or market-wide percentage is not evidence for one specific idea mentioned within that market unless the source explicitly measured that idea itself. Do not combine a broad percentage with a narrow theme as if the percentage measured the narrow theme.
- If a source describes a market, segment or publisher as its largest by response or mention count, that is sample composition, not evidence of audience size, popularity or commercial value. Never synthesise a "largest audience", "most valuable" or "priority" claim from how much evidence was collected from a group, only from what that group actually said (its own sentiment or percentages). This overrides "preserve the real numbers already cited" above when the two conflict — if a source's own key finding already states a popularity, value or priority claim derived only from response or mention count, do not carry it into this report as-is. Either drop it, or restate only the underlying count as a plain fact of sample composition, with no popularity, value or priority language attached.
- A fact, driver, concern or theme evidenced for one specific market, segment, source or timeframe must not be extended to another unless a source explicitly supports that broader or different scope. When combining across sources, preserve each finding's own scope, never merge two separately-scoped findings into one claim that applies a scope-specific attribute to a scope it wasn't evidenced for — e.g. "positive sponsorship sentiment in Spain" plus "community investment is a driver in Germany" must not become "community-focused initiatives are an opportunity in Spain and Germany," Spain's own evidence never mentioned community specifically. This also applies to generalising a single market's finding upward into an untested broader geography: positive sentiment evidenced only in Spain must not become an opportunity "across Europe" or any other broader region, name only the specific markets the evidence actually covers, never a broader region or continent that wasn't itself sampled. You may combine sources that genuinely say the same thing about the same scope, never combine two different scopes into one broader claim.

Return ONLY valid JSON:
{
  "key_findings": [
    { "finding": "What the evidence establishes, a specific fact (a real percentage, count or direct observation) and nothing more. Apply the removability test: if a clause could be deleted without losing any measured content, delete it, it is commentary, not evidence, whatever words it uses (a qualitative relabelling, a commercial implication, a desired outcome, an opportunity, a causal interpretation, strategic meaning or an inferred consequence) — that commentary belongs in opportunities/risks/recommendations instead, never here. One country, market or subject per finding — see SCOPE ATOMICITY above.", "supporting_sources": ["survey", "conversation_search", "document"], "significance": "material" }
  ],
  "areas_of_agreement": [
    { "finding": "Only where genuine convergence adds explanatory value beyond a finding's own corroboration tag, why it matters, not that it exists. Empty array if there is nothing to add.", "supporting_findings": [0, 2] }
  ],
  "areas_of_difference": [
    { "finding": "A genuine contradiction where sources measuring the SAME construct, population and context disagree — only after passing the CONSTRUCT COMPARABILITY check above; different measures with different sentiment directions are NOT a contradiction and do not belong here", "explanation": "Why this difference is established to exist (methodology, market, timing or audience), grounded in what the sources actually measured or said — or, if the evidence does not establish why, say so plainly instead of guessing", "resolved": true, "supporting_findings": [0, 4] }
  ],
  "evidence_gaps": [
    "What the Research Question would need but the sources don't cover, specific about what's missing, empty array if nothing is missing"
  ],
  "opportunities": [
    { "text": "Up to 5 forward-looking commercial opportunities identified across all evidence, naming only where potential exists, never a specific tactic or solution type (e.g. not '...through tailored sponsorship initiatives'), and never a commercial outcome or metric (engagement, presence, affinity, consumption, brand strength, or any other outcome-shaped noun) unless a source above directly measured that exact outcome, whatever word names it — if it wasn't measured, don't name it as the thing that would increase, tactic and outcome both belong in recommendations, not here, and not a restatement of a key finding. If grounded in a source's own framework or interpretation, attribute it by name — see SOURCE FRAMEWORK ATTRIBUTION above.", "based_on_findings": [4] }
  ],
  "risks": [
    { "text": "Up to 4 forward-looking risks or conflicting signals the client should watch, framed as a plausible possibility grounded in the evidence, never a measured consequence stated as settled fact and never an unsupported causal claim, not a restatement of a key finding", "based_on_findings": [1] }
  ],
  "recommendations": [
    { "action": "A specific action only if a source directly supports that exact action, otherwise an investigation naming the actual gap, cause or contradiction (e.g. 'Investigate why...'), never a preselected solution ('...ways to enhance X') and never a purpose clause that smuggles one in ('...to develop X strategies')", "rationale": "Why, based on the evidence", "based_on_findings": [0, 2], "targets": { "type": "finding", "index": 0 } }
  ],
  "major_themes": [
    { "theme": "A short name that represents the collective scope of ALL its supporting_findings — e.g. 'Brand sentiment in Spain' ONLY if every finding is about Spain; 'Regional brand sentiment' if the findings span several markets. Never name a theme after one market when its findings cover more, see COLLECTIVE SCOPE above.", "supporting_findings": [0, 4] }
  ]
}

Be specific and insightful about what the evidence supports, and commercially decisive in your opportunities, risks and recommendations specifically, never in key_findings, which stay strictly factual. Decisive does not mean overconfident: it is entirely decisive to conclude that a cause isn't established or that a gap needs investigating, that is a real, useful output, not a weaker one. Never write generic observations.`;
}

// ── Call 2: Research Answer ─────────────────────────────────────────────
// Deliberately built from ONLY the validated Call 1 output below, never the
// raw source material again — this call cannot independently reinterpret
// the evidence, it can only narrate what Call 1 already established.
function buildResearchAnswerPrompt(
  project: { project_name: string; research_question: string },
  synthesis: ValidatedEvidenceSynthesis,
  answerStatus: AnswerStatus,
  answerReason: string
): string {
  const findingsText = synthesis.key_findings
    .map((f, i) => `[${i}] (${f.corroboration === "cross_source" ? "supported by more than one source" : "single-source"}) ${f.finding}`)
    .join("\n") || "(none)";
  // Each theme's own linked findings, spelled out in full so Call 2 never
  // needs to cross-reference back into the Key Findings list itself to
  // know what a theme is actually about — reduces the chance it writes a
  // synthesis sentence that drifts from what the theme is actually backed
  // by.
  const themesText = synthesis.major_themes
    .map((t, i) => `[${i}] ${t.theme}\n${t.supporting_findings.map(idx => `  - (finding ${idx}) ${synthesis.key_findings[idx].finding}`).join("\n")}`)
    .join("\n") || "(none)";
  const agreementText = synthesis.areas_of_agreement.map(a => `- ${a.finding}`).join("\n") || "(none)";
  const differenceText = synthesis.areas_of_difference
    .map((d, i) => `[${i}] ${d.finding} — ${d.resolved ? "cause established: " : "cause NOT established: "}${d.explanation}`)
    .join("\n") || "(none)";
  const gapsText = synthesis.evidence_gaps.map(g => `- ${g}`).join("\n") || "(none)";
  // Indexed (unlike the earlier version of this prompt) so Call 2 can cite
  // exactly which of these already-written, already-validated items
  // relate to a given theme via related_opportunities/related_risks/
  // related_recommendations, rather than re-authoring a second copy of
  // any of them — see StrategicTheme's own doc comment for why that
  // matters (the Strategic Themes section and these flat lists must never
  // be able to silently disagree with each other).
  const opportunitiesText = synthesis.opportunities.map((o, i) => `[${i}] ${o}`).join("\n") || "(none)";
  const risksText = synthesis.risks.map((r, i) => `[${i}] ${r}`).join("\n") || "(none)";
  // Tagged by the structural `targets` field, not by scanning the verb the
  // action happens to use ("investigate", "explore", "test"...) — a
  // recommendation with a target is, by construction (see the recommendations
  // rule in buildEvidenceSynthesisPrompt), an open investigation rather than
  // a decided direction, regardless of how it's phrased. This is what lets
  // the HOUSE STYLE rules below key off a concept instead of a word list.
  const recommendationsText = synthesis.recommendations
    .map((r, i) => `[${i}] ${r.action}: ${r.rationale} [${r.targets ? "an open investigation, not yet a decided direction" : "a specific action directly evidenced"}]`)
    .join("\n") || "(none)";

  return `You are a senior research director at Fanometrix, writing the concise Executive Answer AND the fuller Strategic Themes synthesis beneath it, for an Executive Report. A separate stage has already synthesised and validated the evidence below, it is finished, you are not re-analysing the sources, you did not see them and do not need to, your only job is to write from exactly what's given here, nothing more.

RESEARCH PROJECT: "${project.project_name}"
RESEARCH QUESTION: "${project.research_question}"

VALIDATED EVIDENCE SYNTHESIS (already finalised, treat as fact, do not add to it or second-guess it):

Major Strategic Themes, each with the specific findings that establish it (0-based theme index shown, use it in theme_synthesis below — when writing a theme's synthesis, use only the finding(s) listed under it, never a fact from elsewhere):
${themesText}

Key Findings:
${findingsText}

Areas of Agreement:
${agreementText}

Areas of Difference:
${differenceText}

Evidence Gaps:
${gapsText}

Opportunities:
${opportunitiesText}

Risks:
${risksText}

Recommendations:
${recommendationsText}

ANSWER STATUS, already determined from the synthesis above, non-negotiable: "${answerStatus}"
Why: ${answerReason}

YOUR TASK
You are writing two layers of the same report: a concise Executive Answer at the top ("headline", "research_answer", "executive_summary"), and a fuller synthesis underneath it ("theme_synthesis", one entry per Major Strategic Theme above). The concise layer and the theme layer must never contradict each other — they are two views of the same conclusions, one compressed, one expanded.

CONCISE LAYER — "headline", "research_answer", "executive_summary":
Write these using only the validated synthesis above, consistent with the answer status you were given, which you may not change, upgrade or contradict. Your answer must be the organising strategic answer to the Research Question, synthesising the full breadth the Major Strategic Themes above establish — not a report about whichever single theme happens to be most dramatic. Weight each theme by its actual evidentiary strength (how many findings back it, whether it's corroborated, how directly it bears on the Research Question), and let that weighting — not narrative drama — decide how much space each theme earns. An area of difference (a contradiction) is one theme among these: name it clearly, as an important risk or open question, but only let it take over the whole answer if the evidence genuinely shows every other theme is comparatively thin or tangential — that must be a conclusion the evidence itself supports, never a default.

THEME LAYER — "theme_synthesis":
Write one entry per Major Strategic Theme listed above, using its own "theme_index" to identify which theme it's for. Every theme must get an entry, none skipped.
- "synthesis": what the theme's own linked findings collectively mean for the Research Question, reasoning across and connecting them where more than one exists — not a bare restatement of each finding one after another. Ground every claim strictly in that theme's own listed findings, never a fact, market or scope from a different theme or from outside this material entirely. Length should reflect how much the theme's own evidence actually supports: a theme with several corroborated findings earns a fuller synthesis than one resting on a single data point — do not pad a thin theme to match a rich one, and do not compress a rich theme to match a thin one.
- "related_opportunities"/"related_risks"/"related_recommendations": the 0-based indices of any Opportunities/Risks/Recommendations above that are specifically about this theme. Leave any of these empty if nothing above genuinely relates — most themes will NOT have all three, some may have none, that is expected and correct, never force a connection that isn't genuinely there.

HOUSE STYLE, non-negotiable:
- Write "research_answer" to match answer status exactly: "fully_answered" — one declarative sentence, as specific as the evidence genuinely supports, decisive language is fine but it must stay evidence-specific, never broader than what the cross-source finding(s) above actually establish, never hedge on a claim it actually establishes ("it appears that…", "this may suggest…", "it is possible that…" are never acceptable here). "substantially_answered" — write with genuine confidence about what the broad evidence base establishes across the major themes above, the same decisive register as fully_answered, then explicitly name the specific unresolved difference(s) or evidence gap(s) as a clearly-scoped caveat within that answer (e.g. "...though the reasons behind [specific contradiction] remain unresolved and warrant further investigation") — the caveat is part of a comprehensive answer, not a replacement for one, and must not make the whole sentence read as hedged or uncertain. "partially_answered" — must begin with visibly qualified wording such as "The available evidence indicates…" or "The research partially supports…", must never open with "The evidence establishes", and must identify what is supported and what remains unresolved. "not_answered" — state plainly what the evidence above does establish and what further evidence is needed, never manufacture a strategic answer merely to complete the report, e.g. "The evidence gathered does not establish an answer to [the question]; [specific further research] would be needed." A confident-sounding generic statement invented to fill a gap the evidence doesn't support is never acceptable.
- "research_answer" must never be more definitive than the recommendations, opportunities, risks and areas of difference above, they describe the same evidence and must stay consistent. Every recommendation above is tagged "[an open investigation, not yet a decided direction]" or "[a specific action directly evidenced]" — that tag is the fact, not the verb used to phrase it. For any recommendation tagged as an open investigation, "research_answer" must not assert its subject as a settled strategic direction, whatever verb the action itself uses (investigate, explore, test, validate, or any other wording all mean the same thing here: not yet decided). If an area of difference above remains unresolved, "research_answer" must not treat that market's evidence as settled or as an uncomplicated asset to leverage.
- "executive_summary" supports and expands the research_answer, it never just restates it, and is bound by the exact same discipline: never assert strategic promise, necessity or value (for example "a promising avenue", "a need to address", "could be leveraged", "must", "critical", "essential", "an opportunity to enhance/optimise/strengthen X") for anything whose only backing above is a recommendation tagged as an open investigation. Describe that recommendation's subject as an area warranting further exploration, not as a certainty, an imperative, or an opportunity already worth acting on — this rule applies by the tag, not by whether the action happens to say "investigate" specifically. A recommendation tagged as a specific action directly evidenced may be described with genuine confidence, that confidence was earned by the evidence behind it. Where multiple major themes have genuine evidentiary weight, "executive_summary" must give each its own clause or sentence, proportional to its weight — never one theme's full paragraph followed by everything else compressed into a single trailing "Additionally, ..." clause.
- "headline" is one punchy, specific line summarising the organising strategic answer to the Research Question (max 15 words) — not merely the single most dramatic finding or contradiction, unless the evidence genuinely shows that IS the answer. It is bound by the same discipline as research_answer, never more confident than it.
- Never generalise a finding to a broader region than what is actually named above — if the synthesis names Spain and Great Britain specifically, do not claim it applies "across Europe" or any other broader area that wasn't itself sampled.
- Any finding, opportunity, risk or recommendation above that attributes a claim to a specific source's own name, framework, taxonomy or interpretation (e.g. "[Source title] positions X as...") must keep that same attribution wherever you reference it here, in headline, research_answer, executive_summary or theme_synthesis. Never restate an attributed interpretation as a settled, unattributed fact, and never strip the source name out for brevity.
- Ban stock filler phrases: "it is worth noting", "in conclusion", "overall", "it is interesting to note".
- Do not rate your own confidence anywhere in this output, that is computed separately.

Return ONLY valid JSON:
{
  "headline": "One punchy, specific headline summarising the organising strategic answer to the Research Question (max 15 words), no more confident than research_answer",
  "research_answer": "Governed by answer status above: a direct, comprehensive answer synthesising the major themes if fully_answered or substantially_answered (substantially_answered adds a clearly-scoped caveat naming what remains unresolved). If partially_answered, must begin with visibly qualified wording such as \\"The available evidence indicates…\\" and never with \\"The evidence establishes\\", stating what is supported and what remains unresolved. If not_answered, state what the evidence does establish and what further evidence is needed, never a manufactured strategic answer.",
  "executive_summary": "3-6 sentences expanding the research_answer with supporting context across the major themes it draws on, proportional to each theme's evidentiary weight, not a repeat of the answer and not one theme's story with everything else as an afterthought. Matches the same answer status, never more confident than research_answer.",
  "theme_synthesis": [
    {
      "theme_index": 0,
      "synthesis": "What this theme's own linked findings collectively mean for the Research Question, length proportional to how much evidence actually backs it, grounded strictly in the findings listed under this theme above",
      "related_opportunities": [0],
      "related_risks": [],
      "related_recommendations": [1]
    }
  ]
}

Your job here is to summarise the validated synthesis and the fixed answer status above in clear, specific, client-ready language — not to add a strategic implication, a benefit, an outcome or a rhetorical flourish that isn't already in the synthesis you were given. If the synthesis doesn't say it, neither should you, including in a closing line: a summary that ends on an invented note ("...and optimise its strategic role") is adding new content at exactly the point a reader remembers most. Decisive does not mean overconfident: a decisive report can decisively state that a finding is provisional or that further validation is needed, that is still a useful, decisive conclusion, not a weaker one. Never write generic observations.`;
}

// ── Deterministic checks, run between the two calls ─────────────────────
// Every check here normalises (clamps a bad index, drops an invalid
// target) or, where nothing safe can be salvaged, drops the offending item
// outright (an unresolvable generic-fix-it recommendation, an
// agreement claim that isn't genuinely cross-source) — it deliberately
// never rewrites prose to make a semantically invalid item merely look
// valid, see isGenericFixIt's own doc comment for why that was tried and
// reverted. A generation still never fails outright over a
// content-quality issue, same principle lib/intelligence/validate-references.ts's
// clampReferences already established, it just means "fail" here is
// "the item is absent from the report," never "the whole request errors."
// Nothing here substitutes for the staged architecture above, it's a
// backstop for the mechanical, unambiguous cases (an out-of-range index, a
// literal fix-it phrasing, an unattributed cross-source claim), not a
// replacement for Call 2 genuinely never having the raw material or a
// status field to misuse in the first place.
const ESTABLISHES_OPENING = /^\s*the evidence establishes/i;
const UNRESOLVED_DIFFERENCE_PATTERN = /does not establish why|does not establish the cause|shows this contradiction but does not establish/i;
const GENERIC_FIX_IT_PATTERN = /^(enhanc(?:e|ing)|improv(?:e|ing)|address(?:ing)?|boost(?:ing)?|strengthen(?:ing)?)\s+/i;
const TENTATIVE_VERB_PATTERN = /^(investigate|explore|test|validate|research|study)\b/i;

/** Trusts a self-reported `resolved` boolean when present (the normal
 * case); falls back to a text-pattern scan of the explanation only if the
 * model omitted or malformed the structured field. */
function normaliseResolvedFlag(d: { explanation: string; resolved?: unknown }): boolean {
  if (typeof d.resolved === "boolean") return d.resolved;
  return !UNRESOLVED_DIFFERENCE_PATTERN.test(d.explanation);
}

/** Bounds-checks a self-reported recommendation target against the sizes
 * of the three arrays it could point into — an out-of-range or malformed
 * target becomes null, it is never fabricated to fill the gap. Validation
 * can confirm a target is real, it cannot invent one the model didn't
 * supply. */
function normaliseTarget(
  target: RecommendationTarget | null | undefined,
  counts: { finding: number; gap: number; difference: number }
): RecommendationTarget | null {
  if (!target || (target.type !== "finding" && target.type !== "gap" && target.type !== "difference")) return null;
  const max = counts[target.type];
  if (!Number.isInteger(target.index) || target.index < 0 || target.index >= max) return null;
  return { type: target.type, index: target.index };
}

/** A recommendation that just restates a problem with a fix-it verb
 * attached ("enhance X", "improve X") is not a validated solution — Call
 * 1's prompt says so explicitly, but the model doesn't reliably comply.
 * This used to deterministically rewrite such actions into a hedged
 * "investigate whether to enhance X" phrasing — dropped, for two reasons
 * discovered from a real generation: (1) it broke grammatically on any
 * action that already ended in punctuation ("...concerns.," + the
 * appended clause), and (2) more fundamentally, it could only ever hedge
 * the SAME pre-selected object ("whether to enhance X") — it has no
 * access to why X is a problem, so it can rewrite the sentence's
 * confidence but can never retarget the investigation at the actual
 * underlying cause, which is the only thing that would make it valid.
 * Prose surgery can't manufacture the semantic content it's missing —
 * only Call 1, with the real evidence in front of it, can supply that —
 * so a recommendation that fails this check is dropped entirely rather
 * than patched into something that merely looks compliant. */
function isGenericFixIt(action: string): boolean {
  const trimmed = action.trim();
  return GENERIC_FIX_IT_PATTERN.test(trimmed) && !TENTATIVE_VERB_PATTERN.test(trimmed);
}

/** "areas_of_agreement" claims genuine cross-source convergence — a
 * stronger claim than any single key finding's own supporting_sources tag,
 * since it spans multiple findings. Kept only when the union of its cited
 * findings' own supporting_sources actually spans two distinct source
 * types (real convergence, not one source's internal comparison dressed
 * up as agreement, and not two same-source findings). An item that
 * doesn't clear that bar is dropped, never rewritten to look like it
 * clears it — same "normalize or drop, never fabricate" discipline as
 * normaliseTarget above. */
function normaliseAgreements(
  raw: { finding: string; supporting_findings: number[] }[],
  keyFindings: ExecutiveReportFinding[]
): ExecutiveReportAgreement[] {
  return raw.reduce<ExecutiveReportAgreement[]>((acc, a) => {
    const supporting_findings = clampReferences(a.supporting_findings, keyFindings.length);
    const sourceTypes = new Set(supporting_findings.flatMap(i => keyFindings[i].supporting_sources));
    if (supporting_findings.length >= 2 && sourceTypes.size >= 2) {
      acc.push({ finding: a.finding, supporting_findings });
    }
    return acc;
  }, []);
}

/** An "agreement" and a "difference" that cite an overlapping set of
 * supporting_findings cannot both be true about the same evidence — one
 * claims convergence, the other divergence. Rather than guessing which
 * claim is semantically right (in the case that surfaced this, the
 * agreement misread a positive-sentiment finding as evidence of dislike),
 * the agreement is dropped: same "normalise or drop, never fabricate"
 * discipline as normaliseAgreements above. A difference already carries
 * its own honest resolved/unresolved signal and doesn't need a matching
 * agreement to be a complete output. */
function dropContradictedAgreements(
  agreements: ExecutiveReportAgreement[],
  differences: ExecutiveReportDifference[]
): ExecutiveReportAgreement[] {
  const contestedFindings = new Set(differences.flatMap(d => d.supporting_findings));
  return agreements.filter(a => !a.supporting_findings.some(i => contestedFindings.has(i)));
}

type TaggedItem = { text: string; based_on_findings: number[] };

/** Extends the theme-coverage completeness discipline below to
 * key_findings themselves, not just opportunities/risks — the model is
 * asked to tag each finding's own significance and connect every
 * "material" one to something, but (like the opportunity/risk case)
 * doesn't always follow through. This never guesses at significance
 * itself: it only ever acts on a finding the model already declared
 * "material," checking that declaration for consistency with the rest of
 * its own output. A finding tagged "supporting" is never touched here,
 * however disconnected it stays — some evidence is legitimately
 * secondary, and forcing every finding into a theme was never the goal. */
function findOrphanedMaterialFindings(
  significance: ("material" | "supporting")[],
  themes: ValidatedTheme[],
  opportunities: TaggedItem[],
  risks: TaggedItem[],
  recommendations: ExecutiveReportRecommendation[]
): number[] {
  const referenced = new Set<number>();
  themes.forEach(t => t.supporting_findings.forEach(i => referenced.add(i)));
  opportunities.forEach(o => o.based_on_findings.forEach(i => referenced.add(i)));
  risks.forEach(r => r.based_on_findings.forEach(i => referenced.add(i)));
  recommendations.forEach(r => r.based_on_findings.forEach(i => referenced.add(i)));
  return significance
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s === "material" && !referenced.has(i))
    .map(({ i }) => i);
}

/** Deterministic backstop for the prompt's own COMPLETENESS CHECK
 * instruction above — the model is told to fold every opportunity/risk
 * into an existing or new theme itself, but this is a judgement call it
 * doesn't always get right (the exact failure mode that first surfaced
 * this: a Great Britain matchday-experience risk whose only supporting
 * finding never made it into any theme, even though the theme covering a
 * different, adjacent finding already existed). Two things this
 * deliberately never does: drop or weaken an opportunity/risk to "solve"
 * the gap, or guess a relation to an existing theme it isn't already
 * evidenced in — same "normalise or drop, never fabricate" discipline as
 * every other check in this file, just applied in the additive direction
 * (link or create, never remove).
 *
 * For every opportunity/risk with at least one based_on_findings index:
 * if every one of those findings is already covered by some theme, that
 * item is linked (via seededRelated below) to the first such theme — this
 * is what fixes the "theme exists but nothing points back at the risk"
 * failure mode even when major_themes itself is otherwise complete. If
 * none of those findings are covered by any theme, a new minimal theme is
 * created for exactly the uncovered findings — code cannot author a good
 * short theme name the way Call 1 can, so this fallback is intentionally
 * literal (the finding's own text, truncated for the card title), never
 * invented. This path is rare once the prompt fix above holds; it exists
 * so evidence is never silently dropped from Strategic Themes, not as the
 * primary mechanism.
 *
 * `materialFindingIndices` (from findOrphanedMaterialFindings) extends
 * the same mechanism one stage further upstream: a finding tagged
 * "material" that has no opportunity, risk or recommendation built from
 * it at all still needs a theme, or it is silently orphaned — connected
 * to nothing anywhere in the report. Each one is passed through the same
 * `ensureThemeFor`, no seeding needed since there is no opportunity/risk
 * item to link, just a theme that must exist and cover it. */
function fillOrphanedThemeCoverage(
  themes: ValidatedTheme[],
  keyFindings: ExecutiveReportFinding[],
  opportunities: TaggedItem[],
  risks: TaggedItem[],
  materialFindingIndices: number[] = []
): { themes: ValidatedTheme[]; seededRelated: Map<number, { opportunities: number[]; risks: number[] }> } {
  const covered = new Set(themes.flatMap(t => t.supporting_findings));
  const finalThemes = [...themes];
  const seededRelated = new Map<number, { opportunities: number[]; risks: number[] }>();
  const newThemeIndexByFindingSet = new Map<string, number>();

  function ensureThemeFor(indices: number[]): number | null {
    const uncovered = indices.filter(i => !covered.has(i));
    if (uncovered.length === 0) {
      const owner = finalThemes.findIndex(t => indices.some(i => t.supporting_findings.includes(i)));
      return owner >= 0 ? owner : null;
    }
    const key = uncovered.join(",");
    if (newThemeIndexByFindingSet.has(key)) return newThemeIndexByFindingSet.get(key)!;
    const label = uncovered.map(i => keyFindings[i].finding).join(" ");
    const themeIndex = finalThemes.length;
    finalThemes.push({
      theme: label.length > 80 ? `${label.slice(0, 79)}…` : label,
      supporting_findings: uncovered,
    });
    uncovered.forEach(i => covered.add(i));
    newThemeIndexByFindingSet.set(key, themeIndex);
    return themeIndex;
  }

  function seed(themeIndex: number, kind: "opportunities" | "risks", itemIndex: number) {
    const entry = seededRelated.get(themeIndex) ?? { opportunities: [], risks: [] };
    entry[kind].push(itemIndex);
    seededRelated.set(themeIndex, entry);
  }

  opportunities.forEach((o, i) => {
    if (o.based_on_findings.length === 0) return;
    const themeIndex = ensureThemeFor(o.based_on_findings);
    if (themeIndex !== null) seed(themeIndex, "opportunities", i);
  });
  risks.forEach((r, i) => {
    if (r.based_on_findings.length === 0) return;
    const themeIndex = ensureThemeFor(r.based_on_findings);
    if (themeIndex !== null) seed(themeIndex, "risks", i);
  });
  materialFindingIndices.forEach(i => ensureThemeFor([i]));

  return { themes: finalThemes, seededRelated };
}

/** The actual fix: answer_status/answer_basis computed purely from Call
 * 1's validated output, before Call 2 ever runs. Not a self-report to
 * cross-check, there is nothing here for either model to have invented.
 *
 * Revised from the original all-or-nothing gate (fully_answered required
 * corroborated_findings.length > 0 AND zero unresolved differences AND
 * zero evidence gaps — so ANY single open issue, on a report drawing on
 * however many sources and findings, forced the same "partially_answered"
 * hedged register as a report with almost nothing established). That
 * conflated two different qualities: whether a fact happens to be
 * independently confirmed by two source TYPES (corroboration — often
 * genuinely absent even in a strong report, since different sources often
 * illuminate different themes rather than redundantly re-measuring the
 * same one) versus whether the evidence AS A WHOLE substantially answers
 * the Research Question. Corroboration count is no longer a gate here —
 * it's still computed and exposed in answer_basis for transparency, Call
 * 2 can reference it, it just doesn't block a report from reading as
 * confident when nothing else is actually unresolved.
 *
 * "substantially_answered" (new tier) exists for exactly what the old
 * gate collapsed into "partially_answered": open issues exist, but they
 * are a minority relative to what the evidence actually established —
 * comparing the count of open issues (unresolved differences + evidence
 * gaps) against the count of key findings is a simple, auditable,
 * code-derived proxy for "how much is settled vs. how much is still
 * open," not a judgement call left to either model. */
function computeAnswerAssessment(synthesis: ValidatedEvidenceSynthesis): { answer_status: AnswerStatus; answer_basis: AnswerBasis } {
  const corroborated_findings = synthesis.key_findings.reduce<number[]>((acc, f, i) => {
    if (f.corroboration === "cross_source") acc.push(i);
    return acc;
  }, []);
  const unresolved_differences = synthesis.areas_of_difference.reduce<number[]>((acc, d, i) => {
    if (!d.resolved) acc.push(i);
    return acc;
  }, []);

  const answer_basis: AnswerBasis = {
    corroborated_findings,
    unresolved_differences,
    evidence_gaps: synthesis.evidence_gaps,
  };

  const totalFindings = synthesis.key_findings.length;
  const openIssues = unresolved_differences.length + answer_basis.evidence_gaps.length;

  const answer_status: AnswerStatus =
    totalFindings === 0
      ? "not_answered"
      : openIssues === 0
      ? "fully_answered"
      : totalFindings >= 3 && totalFindings > openIssues
      ? "substantially_answered"
      : "partially_answered";

  return { answer_status, answer_basis };
}

/** Builds the human-readable "why" Call 2's prompt states alongside the
 * locked answer_status — so the status reads as an explained fact, not an
 * arbitrary label. */
function describeAnswerReason(basis: AnswerBasis, totalFindings: number): string {
  const parts: string[] = [];
  parts.push(
    basis.corroborated_findings.length > 0
      ? `${basis.corroborated_findings.length} of ${totalFindings} findings are supported by more than one source`
      : `none of the ${totalFindings} findings are supported by more than one source`
  );
  if (basis.unresolved_differences.length > 0) {
    parts.push(`${basis.unresolved_differences.length} area${basis.unresolved_differences.length === 1 ? "" : "s"} of difference remain${basis.unresolved_differences.length === 1 ? "s" : ""} unresolved`);
  }
  if (basis.evidence_gaps.length > 0) {
    parts.push(`${basis.evidence_gaps.length} evidence gap${basis.evidence_gaps.length === 1 ? "" : "s"} identified`);
  }
  return parts.join("; ") + ".";
}

/** "partially_answered"/"not_answered" can't open with the maximally
 * confident phrase reserved for a claim the evidence genuinely settles —
 * the one remaining text-level check after the architecture change above,
 * kept as a cheap mechanical backstop, not the primary mechanism.
 * "substantially_answered" is allowed to keep it: it's meant to read with
 * the same confident register as "fully_answered" for what IS established,
 * a caveat clause afterwards doesn't require softening the opening too. */
function sanitiseAnswerOpening(text: string, status: AnswerStatus): string {
  if (status !== "fully_answered" && status !== "substantially_answered" && ESTABLISHES_OPENING.test(text)) {
    return text.replace(ESTABLISHES_OPENING, "The available evidence indicates");
  }
  return text;
}

export async function analyseExecutiveReport(projectId: string): Promise<ExecutiveReport> {
  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("project_name, research_question, objective, study_type, topic, research_mode")
    .eq("id", projectId)
    .single();

  if (!project) throw new IntelligenceError(404, "Research project not found");
  if (!project.research_question?.trim()) {
    throw new IntelligenceError(400, "This project has no Research Question set, an Executive Report has nothing to answer without one.");
  }

  const { data: evidenceRows } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, evidence_type, evidence_id")
    .eq("research_project_id", projectId)
    .in("evidence_type", getEvidenceTypesWithIntelligence());

  const rows = (evidenceRows ?? []) as { id: string; evidence_type: EvidenceTypeId; evidence_id: string }[];
  if (!rows.length) {
    throw new IntelligenceError(400, "This project has no Research Sources attached yet, attach a Survey, Conversation Search or Document before generating an Executive Report.");
  }

  const surveyIds = rows.filter(r => r.evidence_type === "survey").map(r => r.evidence_id);
  const searchIds = rows.filter(r => r.evidence_type === "social_search").map(r => r.evidence_id);
  const documentIds = rows.filter(r => r.evidence_type === "document").map(r => r.evidence_id);

  const [{ data: surveys }, { data: searches }, { data: documents }] = await Promise.all([
    surveyIds.length
      ? supabaseAdmin.from("surveys").select("id, name, is_simulated").in("id", surveyIds)
      : Promise.resolve({ data: [] as { id: string; name: string; is_simulated: boolean }[] }),
    searchIds.length
      ? supabaseAdmin.from("social_searches").select("id, name, is_simulated").in("id", searchIds)
      : Promise.resolve({ data: [] as { id: string; name: string; is_simulated: boolean }[] }),
    documentIds.length
      ? supabaseAdmin.from("library_documents").select("id, title").in("id", documentIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  // Documents are excluded from the provenance mismatch check below on
  // purpose — library_documents has no is_simulated column at all,
  // uploaded documents are never simulated content (same reasoning as
  // migration 078's trigger, which already skips this cross-check for
  // 'document' evidence rows).
  const allSources = [...(surveys ?? []), ...(searches ?? [])];
  const nameById = new Map<string, string>([
    ...allSources.map((s): [string, string] => [s.id, s.name]),
    ...(documents ?? []).map((d): [string, string] => [d.id, d.title]),
  ]);

  // Assert, don't assume: every included source's provenance must match
  // the project's — the DB triggers already prevent this state from
  // existing, but an Executive Report is the highest-stakes place for a
  // mixing error to reach a client, so it gets its own loud check on top.
  const expectedSimulated = project.research_mode === "simulated";
  const mismatched = allSources.find(s => s.is_simulated !== expectedSimulated);
  if (mismatched) {
    throw new IntelligenceError(
      500,
      `Evidence provenance mismatch: "${mismatched.name}" is_simulated=${mismatched.is_simulated} does not match project research_mode=${project.research_mode}. Refusing to generate.`
    );
  }

  // Fetch every attached source's own Intelligence summary once, keeping
  // the full row (content included) alongside a lightweight readiness
  // item — computeReportReadiness (lib/report-readiness.ts, the same
  // function the Workspace's Reports section and the Executive Report
  // page's pre-generation confirm dialog already use) does the actual
  // included/excluded/reason classification, so this analyst no longer
  // re-derives that logic independently.
  type SummaryLike = { status: string; content: unknown; edited_content: unknown } | null;
  const summaryByKey = new Map<string, SummaryLike>();
  const readinessItems: ReadinessEvidenceItem[] = [];

  for (const row of rows) {
    const sourceType = getIntelligenceSourceType(row.evidence_type);
    // Document Intelligence's research_summaries row is keyed by the
    // research_project_evidence row's OWN id (migration 102), never
    // evidence_id (library_documents.id) — the same document attached to
    // two projects gets two independent summaries. Every other type is
    // still keyed by evidence_id, unchanged.
    const sourceId = row.evidence_type === "document" ? row.id : row.evidence_id;
    const summary = await getSummary<SurveyIntelligenceReport | InsightReport | DocumentIntelligenceReport>(sourceType, sourceId, "research_summary");
    summaryByKey.set(`${row.evidence_type}:${row.evidence_id}`, summary);

    const baseLabel = nameById.get(row.evidence_id) ?? getSourceLabel(row.evidence_type);
    // Every source shares the project's provenance (asserted above), so
    // this suffix is uniform when present — the point is that each label
    // in evidence_strength.sources_included/excluded reads correctly even
    // if quoted out of context, not that it distinguishes sources from
    // each other. Baked into the label passed to computeReportReadiness
    // below, so the shared function never needs to know about simulation
    // provenance.
    const label = expectedSimulated ? `${baseLabel} (Simulated)` : baseLabel;

    readinessItems.push({
      evidence_type: row.evidence_type,
      evidence_id: row.evidence_id,
      survey: row.evidence_type === "survey" ? { name: label, summary_status: summary?.status ?? null } : null,
      conversationSearch: row.evidence_type === "social_search" ? { name: label, summary_status: summary?.status ?? null } : null,
      document: row.evidence_type === "document" ? { name: label, summary_status: summary?.status ?? null } : null,
    });
  }

  const readiness = computeReportReadiness(readinessItems);
  assertReportReadiness(readiness, "an Executive Report");

  const included: IncludedSource[] = readiness.included.map(ref => {
    const summary = summaryByKey.get(`${ref.evidence_type}:${ref.evidence_id}`);
    return { ...ref, content: (summary!.edited_content ?? summary!.content) as SurveyIntelligenceReport | InsightReport | DocumentIntelligenceReport };
  });
  const excludedRefs: (EvidenceStrengthSourceRef & { reason: string })[] = readiness.excluded;

  // ── Call 1: Evidence Synthesis — the only call that ever sees the raw
  // source material. ──
  const rawSynthesis = await completeJSON<RawEvidenceSynthesis>({
    prompt: buildEvidenceSynthesisPrompt(
      { project_name: project.project_name, research_question: project.research_question, objective: project.objective, study_type: project.study_type, topic: project.topic },
      included
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    // Raised from 3072 — the evidence pool this now synthesises across
    // (up to 4 sources, 2 of them rich Document Intelligence reports) is
    // materially larger than when this budget was set, and key_findings
    // no longer has an implicit ceiling (see STRATEGIC THEME COVERAGE in
    // the prompt above), so the completion genuinely needs more room to
    // cover every major theme without being cut short.
    maxTokens:   5120,
  });

  const key_findings: ExecutiveReportFinding[] = rawSynthesis.key_findings.map(f => ({
    finding:             f.finding,
    supporting_sources:  f.supporting_sources,
    corroboration:       f.supporting_sources.length >= 2 ? "cross_source" : "single_source",
  }));

  const areas_of_difference: ExecutiveReportDifference[] = rawSynthesis.areas_of_difference.map(d => ({
    finding:     d.finding,
    explanation: d.explanation,
    resolved:    normaliseResolvedFlag(d),
    supporting_findings: clampReferences(d.supporting_findings, key_findings.length),
  }));

  const evidence_gaps = rawSynthesis.evidence_gaps ?? [];

  // dropContradictedAgreements runs after both arrays exist — an
  // agreement citing the same findings a difference already cites is a
  // direct structural contradiction (the same evidence can't converge and
  // diverge at once), see that function's own doc comment.
  const areas_of_agreement: ExecutiveReportAgreement[] = dropContradictedAgreements(
    normaliseAgreements(rawSynthesis.areas_of_agreement, key_findings),
    areas_of_difference
  );

  // A hallucinated or out-of-range based_on_findings/targets index must
  // never reach storage or the screen as if it were real evidence. A
  // recommendation that just restates a problem with a fix-it verb
  // attached is not a validated solution either — dropped rather than
  // rewritten, see isGenericFixIt's own doc comment for why.
  const recommendations: ExecutiveReportRecommendation[] = rawSynthesis.recommendations
    .filter(r => !isGenericFixIt(r.action))
    .map(r => ({
      action:             r.action,
      rationale:          r.rationale,
      based_on_findings:  clampReferences(r.based_on_findings, key_findings.length),
      targets:            normaliseTarget(r.targets, {
        finding:    key_findings.length,
        gap:        evidence_gaps.length,
        difference: areas_of_difference.length,
      }),
    }));

  // Opportunities/risks keep their public string[] shape (unchanged — no
  // rendering/editing code needs to know about based_on_findings), but are
  // validated here with their finding-provenance tag intact just long
  // enough to run the theme-coverage backstop below.
  const opportunitiesTagged: TaggedItem[] = (rawSynthesis.opportunities ?? []).map(o => ({
    text: o.text,
    based_on_findings: clampReferences(o.based_on_findings, key_findings.length),
  }));
  const risksTagged: TaggedItem[] = (rawSynthesis.risks ?? []).map(r => ({
    text: r.text,
    based_on_findings: clampReferences(r.based_on_findings, key_findings.length),
  }));

  // A theme's supporting_findings are validated exactly like
  // areas_of_agreement.supporting_findings above (clampReferences against
  // the real key_findings array) — a theme where nothing survives
  // validation is dropped entirely, never kept with an empty or
  // fabricated evidence trail. This is what stops a theme from carrying a
  // material claim (e.g. naming a market) that no actual finding
  // establishes — see StrategicTheme's own doc comment.
  const major_themes_structural: ValidatedTheme[] = (rawSynthesis.major_themes ?? [])
    .map(t => ({ theme: t.theme?.trim() ?? "", supporting_findings: clampReferences(t.supporting_findings, key_findings.length) }))
    .filter(t => t.theme && t.supporting_findings.length > 0);

  // Extends the same completeness discipline to key_findings themselves —
  // a finding Call 1 tagged "material" must connect to something (a theme,
  // an opportunity, a risk or a recommendation); a "supporting" finding
  // never has to, whether or not it ends up unreferenced. Defaults
  // anything not exactly "material" to "supporting" — a missing or
  // malformed tag should never spuriously trigger a new theme.
  const significanceByIndex = rawSynthesis.key_findings.map(f => (f.significance === "material" ? "material" : "supporting") as "material" | "supporting");
  const orphanedMaterialFindings = findOrphanedMaterialFindings(
    significanceByIndex,
    major_themes_structural,
    opportunitiesTagged,
    risksTagged,
    recommendations
  );

  // Deterministic backstop for the prompt's own COMPLETENESS CHECK
  // instruction — see fillOrphanedThemeCoverage's own doc comment.
  const { themes: major_themes_draft, seededRelated } = fillOrphanedThemeCoverage(
    major_themes_structural,
    key_findings,
    opportunitiesTagged,
    risksTagged,
    orphanedMaterialFindings
  );

  const opportunities = opportunitiesTagged.map(o => o.text);
  const risks = risksTagged.map(r => r.text);

  const validatedSynthesis: ValidatedEvidenceSynthesis = {
    major_themes: major_themes_draft,
    key_findings,
    areas_of_agreement,
    areas_of_difference,
    evidence_gaps,
    opportunities,
    risks,
    recommendations,
  };

  const totalFindings = key_findings.length;
  const corroboratedFindings = key_findings.filter(f => f.corroboration === "cross_source").length;
  const corroborationRatio = totalFindings > 0 ? corroboratedFindings / totalFindings : 0;
  const methodDiversity: EvidenceStrength["method_diversity"] =
    new Set(included.map(s => s.evidence_type)).size > 1 ? "mixed_method" : "single_method";

  // Deprecated (see EvidenceStrength.tier's doc comment) — kept computed,
  // unchanged, purely to preserve the stored data shape. Nothing reads
  // tier or summary below anymore.
  const tier: EvidenceStrength["tier"] =
    included.length === 1
      ? "provisional"
      : methodDiversity === "mixed_method" && corroborationRatio >= 0.5
      ? "robust"
      : "substantiated";

  const totalSources = included.length + excludedRefs.length;
  const tierLabel = { provisional: "Provisional", substantiated: "Substantiated", robust: "Robust" }[tier];
  const methodLabel = methodDiversity === "mixed_method" ? "mixed methods" : "a single method";
  const legacySummary =
    `${tierLabel}, corroborated by ${included.length} of ${totalSources} attached source${totalSources === 1 ? "" : "s"} ` +
    `across ${methodLabel}; ${corroboratedFindings} of ${totalFindings} key finding${totalFindings === 1 ? "" : "s"} ` +
    `supported by more than one source.`;

  const evidence_strength: EvidenceStrength = {
    tier,
    summary: legacySummary,
    method_diversity:      methodDiversity,
    corroborated_findings: corroboratedFindings,
    total_findings:        totalFindings,
    sources_included:      included.map(s => ({ evidence_type: s.evidence_type, evidence_id: s.evidence_id, label: s.label })),
    sources_excluded:      excludedRefs,
  };

  // ── Between calls: the actual fix — computed purely from Call 1's
  // validated output, before Call 2 ever runs. Nothing for Call 2 to
  // invent or contradict. ──
  const { answer_status, answer_basis } = computeAnswerAssessment(validatedSynthesis);
  const answerReason = describeAnswerReason(answer_basis, totalFindings);

  // ── Call 2: Research Answer — sees only the validated synthesis above
  // and the locked answer_status, never the raw source material. ──
  const rawAnswer = await completeJSON<RawResearchAnswer>({
    prompt: buildResearchAnswerPrompt(
      { project_name: project.project_name, research_question: project.research_question },
      validatedSynthesis,
      answer_status,
      answerReason
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    // Raised again from 1536 — this call now also writes theme_synthesis,
    // a paragraph per major theme (the actual depth layer), not just the
    // concise headline/research_answer/executive_summary it used to.
    maxTokens:   3072,
  });

  const research_answer = sanitiseAnswerOpening(rawAnswer.research_answer, answer_status);
  const executive_summary = sanitiseAnswerOpening(rawAnswer.executive_summary, answer_status);

  // Merge Call 2's theme_synthesis onto Call 1's already-validated
  // major_themes_draft, matched by theme_index — never the reverse (a
  // theme's existence and evidence trail is decided once, by Call 1's
  // validation, and can't be added to or invented by Call 2). related_*
  // indices are clamped against the FINAL opportunities/risks/
  // recommendations arrays, same discipline as every other reference in
  // this file. A theme Call 2 didn't address at all still isn't dropped
  // silently — see the fallback below.
  const themeSynthesisByIndex = new Map(
    (rawAnswer.theme_synthesis ?? [])
      .filter(t => Number.isInteger(t.theme_index) && t.theme_index >= 0 && t.theme_index < major_themes_draft.length)
      .map(t => [t.theme_index, t])
  );
  const major_themes: StrategicTheme[] = major_themes_draft.map((theme, i) => {
    const s = themeSynthesisByIndex.get(i);
    // Themes the completeness backstop created are seeded with the exact
    // opportunity/risk index that triggered their creation, unioned with
    // whatever Call 2 additionally finds — see fillOrphanedThemeCoverage's
    // own doc comment for why this doesn't rely on Call 2's judgement
    // alone for the one item that's already known to relate.
    const seeded = seededRelated.get(i);
    return {
      theme: theme.theme,
      supporting_findings: theme.supporting_findings,
      // Call 2 is asked to cover every theme; if it genuinely omits one,
      // fall back to the theme's own linked finding text rather than
      // dropping the theme or leaving it blank — still 100% evidence,
      // never invented, just not narratively connected.
      synthesis: s?.synthesis?.trim() || theme.supporting_findings.map(idx => key_findings[idx].finding).join(" "),
      related_opportunities:   clampReferences([...(s?.related_opportunities ?? []), ...(seeded?.opportunities ?? [])], opportunities.length),
      related_risks:           clampReferences([...(s?.related_risks ?? []), ...(seeded?.risks ?? [])], risks.length),
      related_recommendations: clampReferences(s?.related_recommendations, recommendations.length),
    };
  });

  return {
    headline: rawAnswer.headline,
    research_answer,
    answer_status,
    answer_basis,
    executive_summary,
    major_themes,
    key_findings,
    areas_of_agreement,
    areas_of_difference,
    evidence_gaps,
    opportunities,
    risks,
    recommendations,
    evidence_strength,
    generated_at:        new Date().toISOString(),
    research_mode:       project.research_mode,
    synthetic_notice:    expectedSimulated ? SYNTHETIC_NOTICE_TEXT : null,
    research_question:   project.research_question,
  };
}
