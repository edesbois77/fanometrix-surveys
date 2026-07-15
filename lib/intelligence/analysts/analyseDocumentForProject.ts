// Reusable analyst: Document Intelligence — re-synthesises one Uploaded
// Document's already-approved global analysis (library_document_analysis,
// migration 101) through the lens of ONE Research Project's Research
// Question. The project-specific counterpart to Survey/Conversation
// Intelligence, persisted the same way (research_summaries,
// source_type='document_project' — migration 102), reusing
// lib/intelligence/store.ts's exact draft/edited/approved/published
// contract unchanged.
//
// Architecture (second revision — the first attempt, index-based
// selection over the evidence pool, was still materially thinner than the
// Library analysis it was built from, even after removing an artificial
// output cap): "same evidence depth, different analytical lens." This is
// NOT a second, weaker analysis pipeline — it is lib/intelligence/analysts/
// analyseDocument.ts's own Stage B synthesis mechanic (reorderBySignificance
// + the same "evidence pool, not four separate lists" editorial judgement),
// run again over the exact same full evidence pool Stage A already
// extracted and validated, with the organising question swapped from "the
// document's own central argument" to "this project's Research Question."
// Concretely:
//   - The full key_findings/statistics/quotes/document_recommendations
//     arrays are NEVER filtered down to a subset. They are reordered by
//     relevance/significance to the Research Question (reorderBySignificance,
//     shared with Library mode) — nothing is ever dropped from the record,
//     so the report stays exactly as provenance-traceable and auditable as
//     the Library analysis it's built from, and a large document with only
//     partial relevance to a narrow question never loses material a
//     reviewer might want to check.
//   - The executive_summary is a genuinely fresh, deep synthesis — same
//     caliber of cross-evidence reasoning (tensions, causal relationships,
//     implications) as Library Stage B, oriented around the Research
//     Question instead of the document's own argument. It is not a
//     restatement of a subset.
//   - This project's own recommended_actions, strategic_implications and
//     further_research_questions are the genuinely NEW, project-specific
//     content this pass adds on top of the Library analysis — the parts
//     that couldn't exist before a project's Research Question was known.
//   - evidence_strength/rationale/limitations are carried through
//     unchanged from the Library analysis — code-derived there, never
//     re-judged per project.
// Visual evidence is inherited "for free": Stage A already resolved a
// visual chunk's content into a finding/statistic/quote tagged
// evidence_kind='visual' in its provenance, so this pass — which, like
// Library Stage B, only ever reads Stage A's validated output, never raw
// chunks again — sees it exactly the same way Library mode does.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { clampReferences } from "@/lib/intelligence/validate-references";
import { getCurrentAnalysis } from "@/lib/library-documents/analysis-store";
import {
  reorderBySignificance, buildOriginalIndexLookup,
  describeFindingsForPrompt, describeStatisticsForPrompt, describeRecommendationsForPrompt,
  describeQuotesForPrompt, describeFrameworkForPrompt,
} from "@/lib/intelligence/analysts/documentSynthesis";
import type {
  DocumentAnalysisContent, DocumentFinding, DocumentStatistic, DocumentQuote, DocumentRecommendation,
  DocumentLimitation, EvidenceStrength,
} from "@/lib/library-documents/analysis-schema";

export type DocumentIntelligenceReport = {
  headline: string;
  executive_summary: string;

  // The FULL evidence pool from the approved Library analysis, reordered
  // (never filtered) by significance to this project's Research Question —
  // same arrays, same items, same provenance as the Library analysis,
  // just re-prioritised. See this file's header comment.
  key_findings: DocumentFinding[];
  statistics: DocumentStatistic[];
  quotes: DocumentQuote[];
  /** The document's OWN recommendations — background evidence only, same
   * "never copied forward as this report's own recommendation" rule
   * analyseExecutiveReport.ts already applies to every source's own
   * recommended actions. This project's actual recommendations are
   * recommended_actions below, freshly written. */
  document_recommendations: DocumentRecommendation[];

  recommended_actions: {
    action: string;
    rationale: string;
    /** 0-based indices into key_findings (this report's own, already
     * reordered array) — same evidence-to-action trace every other
     * Intelligence report carries. */
    based_on_findings: number[];
  }[];

  /** Forward-looking, for this project specifically — not a restatement of
   * a finding's fact, mirrors Executive Report's opportunities/risks
   * distinction (evidence vs. interpretation), unified into one list since
   * a single document rarely warrants separating them. */
  strategic_implications: string[];
  /** What this project should investigate further given this evidence,
   * empty array if nothing meaningful to add — never padded. */
  further_research_questions: string[];

  /** Carried through unchanged from the approved Library analysis —
   * code-derived there (see computeEvidenceStrength), never re-judged per
   * project. */
  evidence_strength: EvidenceStrength;
  evidence_strength_rationale: string;
  /** Author-disclosed limitations, carried through unchanged — a fact
   * about the document itself, not something a project's lens changes. */
  limitations: DocumentLimitation[];

  generated_at: string;
  // Computed from the document itself, never model-generated — "where did
  // this evidence actually come from," same reasoning as
  // SurveyIntelligenceReport.sources_summary in analyseSurvey.ts.
  document_summary: {
    id: string;
    title: string;
    document_type: string;
    source_publisher: string | null;
  };
};

/** Thrown (via IntelligenceError) whenever the underlying document isn't
 * ready to be interpreted for a project yet — surfaced verbatim to the
 * review page so it can explain the gate rather than showing a generic
 * failure. */
const NOT_APPROVED_MESSAGE =
  "This document's Research Library analysis must be approved before Document Intelligence can be generated for a project.";

type RawProjectSynthesis = {
  headline?: string;
  executive_summary?: string;
  /** 0-based indices from the KEY FINDINGS/STATISTICS lists shown in the
   * prompt, reordered from most to least significant to the Research
   * Question — same "include every index exactly once, reorder only"
   * contract as analyseDocument.ts's Stage B. */
  key_finding_order?: number[];
  statistic_order?: number[];
  recommended_actions?: { action: string; rationale: string; based_on_findings: number[] }[];
  strategic_implications?: string[];
  further_research_questions?: string[];
};

function buildProjectSynthesisPrompt(
  project: { project_name: string; research_question: string; objective: string | null; study_type: string; topic: string | null },
  doc: { title: string; document_type: string; source_publisher: string | null },
  analysis: DocumentAnalysisContent
): string {
  const frameworkText = describeFrameworkForPrompt(analysis.report_framework);
  const findingsText = describeFindingsForPrompt(analysis.key_findings);
  const statsText = describeStatisticsForPrompt(analysis.statistics);
  const recommendationsText = describeRecommendationsForPrompt(analysis.document_recommendations);
  const quotesText = describeQuotesForPrompt(analysis.quotes);
  const qualityText = `${analysis.research_quality.evidence_strength} — ${analysis.research_quality.rationale}`;

  return `You are a senior research analyst at Fanometrix. A document already in the Research Library has been thoroughly catalogued and synthesised below ("${doc.title}") — that synthesis already exists independent of any project. Your job now is the SAME editorial judgement Fanometrix already applies to catalogue this document in general, applied again with a different organising question: not the document's own central argument, but ONE Research Project's Research Question. You are not re-reading the source document, everything below is already validated and extracted — your job is judgement about significance and meaning, not extraction.

RESEARCH PROJECT: "${project.project_name}"
RESEARCH QUESTION: "${project.research_question}"
${project.objective ? `OBJECTIVE: ${project.objective}\n` : ""}Study type: ${project.study_type}${project.topic ? ` · Topic: ${project.topic}` : ""}

DOCUMENT: "${doc.title}" (${doc.document_type}${doc.source_publisher ? `, published by ${doc.source_publisher}` : ""})
NAMED FRAMEWORK: ${frameworkText}

KEY FINDINGS:
${findingsText}

STATISTICS:
${statsText}

THE DOCUMENT'S OWN RECOMMENDATIONS (background context, not pre-approved for this project):
${recommendationsText}

QUOTES:
${quotesText}

RESEARCH QUALITY: ${qualityText}

YOUR TASK

1. Treat the KEY FINDINGS, STATISTICS, RECOMMENDATIONS and QUOTES above as ONE pool of evidence, not four separate categories — exactly as you would cataloguing this document in general, except your organising question is now the Research Question above.

2. Identify what this evidence, taken together, actually means for the Research Question. Rank evidence by how much it matters to answering that question, never by the order it happens to appear above. If any item above would materially change how this project should interpret its Research Question, it must be foregrounded regardless of its position in the lists.

3. Explain tensions, apparent contradictions and plausible causal relationships between pieces of evidence AS THEY BEAR ON THE RESEARCH QUESTION, not each fact in isolation. Ground every causal or interpretive claim strictly in what's listed above — state a cause or connection only when the evidence genuinely supports it; if the evidence shows a pattern but doesn't establish why, say that plainly rather than inventing a plausible-sounding explanation.

4. If this document has limited bearing on the Research Question, say so plainly and honestly in the executive summary rather than manufacturing relevance that isn't there — an honest, focused synthesis is more valuable than an inflated one.

5. A quote may illustrate or add texture to a point your synthesis is already making — never treat a quote's content as a new, separate fact to report on its own.

6. If a named framework exists, use it as an organising thread only where the evidence actually supports doing so for THIS Research Question — don't force it.

7. RECOMMENDED ACTIONS — this project's own, not the document's. Each must cite "based_on_findings": the ORIGINAL 0-based indices from the KEY FINDINGS list above (the exact numbering shown, before any reordering) that justify it. Do not copy the document's own recommendations forward as if they were this project's — a source's own recommendation can be a preselected solution or an unhedged claim; evaluate independently whether each is actually warranted for this Research Question.

8. STRATEGIC IMPLICATIONS — forward-looking, specific to this project, grounded only in the evidence above. Not a restatement of a finding's fact — say what it could mean, visibly distinguishing evidence from inference (e.g. "X shows Y, which could mean Z", not "Z is happening" stated as settled fact).

9. FURTHER RESEARCH QUESTIONS — what this evidence suggests this project should investigate further, if anything. Empty array if nothing genuinely follows, never padded.

HOUSE STYLE, non-negotiable:
- Never invent a fact, number or quote absent from the material above.
- Ban stock filler phrases: "it is worth noting", "in conclusion", "overall", "it is interesting to note".
- Do not restate the Research Quality assessment above in your own words as if reassessing it — it is a fixed, code-derived fact about the document, carried through unchanged regardless of this project's lens.

Write as many sentences in "executive_summary" as the evidence genuinely supports to do this properly — usually 4-7, never padded to reach a count, never rushed past a genuine tension or implication to stay short.

Return ONLY valid JSON:
{
  "headline": "One punchy, specific headline connecting this document's evidence to the Research Question (max 15 words)",
  "executive_summary": "What this evidence collectively means for THIS project's Research Question, reasoning through tensions, causal relationships and implications, grounded strictly in the evidence above.",
  "key_finding_order": [${analysis.key_findings.map((_, i) => i).join(", ")}],
  "statistic_order": [${analysis.statistics.map((_, i) => i).join(", ")}],
  "recommended_actions": [
    { "action": "What this project should do in light of this evidence", "rationale": "Why, based on the evidence", "based_on_findings": [0, 2] }
  ],
  "strategic_implications": [
    "Forward-looking implications specific to this project, grounded in the evidence, distinguishing what's shown from what's inferred"
  ],
  "further_research_questions": [
    "What this evidence suggests should be investigated further, if anything"
  ]
}

Be specific and insightful. Never write generic observations.`;
}

export async function analyseDocumentForProject(evidenceRowId: string): Promise<DocumentIntelligenceReport> {
  const { data: evidenceRow } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, research_project_id, evidence_type, evidence_id")
    .eq("id", evidenceRowId)
    .single();

  if (!evidenceRow || evidenceRow.evidence_type !== "document") {
    throw new IntelligenceError(404, "This document isn't attached to this project.");
  }

  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("project_name, research_question, objective, study_type, topic")
    .eq("id", evidenceRow.research_project_id)
    .single();

  if (!project) throw new IntelligenceError(404, "Research project not found.");
  if (!project.research_question?.trim()) {
    throw new IntelligenceError(400, "This project has no Research Question set, Document Intelligence has nothing to interpret the evidence against without one.");
  }

  const { data: doc } = await supabaseAdmin
    .from("library_documents")
    .select("id, title, document_type, source_publisher, status")
    .eq("id", evidenceRow.evidence_id)
    .single();

  if (!doc) throw new IntelligenceError(404, "Document not found.");
  if (doc.status !== "approved") {
    throw new IntelligenceError(400, NOT_APPROVED_MESSAGE);
  }

  const analysisRow = await getCurrentAnalysis(doc.id);
  if (!analysisRow || analysisRow.status !== "approved") {
    throw new IntelligenceError(400, NOT_APPROVED_MESSAGE);
  }
  const analysis = analysisRow.edited_content ?? analysisRow.content;

  const raw = await completeJSON<RawProjectSynthesis>({
    prompt: buildProjectSynthesisPrompt(
      { project_name: project.project_name, research_question: project.research_question, objective: project.objective, study_type: project.study_type, topic: project.topic },
      { title: doc.title, document_type: doc.document_type, source_publisher: doc.source_publisher },
      analysis
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    maxTokens:   3072,
  });

  // Reordering, never filtering — the full pool from the approved analysis
  // survives into the report exactly as-is, just re-prioritised. See this
  // file's header comment and reorderBySignificance's own doc comment.
  const key_findings = reorderBySignificance(analysis.key_findings, raw.key_finding_order);
  const statistics = reorderBySignificance(analysis.statistics, raw.statistic_order);

  // recommended_actions[].based_on_findings arrives in the ORIGINAL
  // key_findings index space (the numbering shown in the prompt), but the
  // report exposes only the reordered key_findings array — remapped here
  // via object-identity lookup (buildOriginalIndexLookup), since
  // reorderBySignificance never clones items. A reference to an index the
  // model didn't itself provide a valid original position for is dropped,
  // never fabricated a position for.
  const positionByOriginalIndex = buildOriginalIndexLookup(analysis.key_findings, key_findings);
  const recommended_actions = (raw.recommended_actions ?? []).map(a => ({
    action: a.action,
    rationale: a.rationale,
    based_on_findings: clampReferences(a.based_on_findings, analysis.key_findings.length)
      .map(originalIndex => positionByOriginalIndex.get(originalIndex))
      .filter((position): position is number => position !== undefined),
  }));

  return {
    headline: raw.headline ?? "",
    executive_summary: raw.executive_summary ?? "",
    key_findings,
    statistics,
    quotes: analysis.quotes,
    document_recommendations: analysis.document_recommendations,
    recommended_actions,
    strategic_implications: raw.strategic_implications ?? [],
    further_research_questions: raw.further_research_questions ?? [],
    evidence_strength: analysis.research_quality.evidence_strength,
    evidence_strength_rationale: analysis.research_quality.rationale,
    limitations: analysis.limitations,
    generated_at: new Date().toISOString(),
    document_summary: {
      id: doc.id, title: doc.title, document_type: doc.document_type, source_publisher: doc.source_publisher,
    },
  };
}
