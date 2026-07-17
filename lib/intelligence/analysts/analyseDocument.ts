// Reusable analyst: the Research Library's global, one-time document
// analysis — title/publisher/date/markets/sports/audiences/brands/topics/
// tags/report framework/key findings/statistics/recommendations/quotes/
// methodology/limitations/research-quality signals, each finding,
// statistic, recommendation and quote citing the exact chunk(s) it was
// drawn from. Same "pure generation only, never persists" contract as
// analyseSurvey.ts/analyseConversation.ts, but its output is validated by
// validateDocumentAnalysisContent (lib/library-documents/analysis-schema.ts)
// rather than returned as raw model JSON — a document's stable finding ids
// and resolved page provenance are load-bearing (see that file's header
// comment on why), not optional polish, so validation happens here, before
// the caller ever stores anything.
//
// Two stages, mirroring lib/intelligence/analysts/analyseExecutiveReport.ts's
// proven "extract atomic evidence, then synthesise from the validated
// result, never the raw source again" split — applied here for the same
// reason: a single call asked to both extract disciplined atomic facts AND
// write a genuinely connective narrative in the same generation risks the
// narrative drifting from what was actually validated, and can't cross-check
// itself against anything (there is nothing yet to check against, in a
// single pass).
//   Stage A (runSingleCallAnalysis / runMapReduceAnalysis) — sees every
//     chunk (text + visual), extracts everything except executive_summary
//     and author_perspective. Validated immediately via
//     validateDocumentAnalysisContent, which is what assigns every item's
//     stable id and resolves provenance.
//   Stage B (runStageB) — sees ONLY Stage A's validated, structured output
//     (never the raw chunks again), writes the genuinely cross-theme
//     executive_summary and (if a publisher is known) the author
//     perspective's independence note. Cheap relative to Stage A — its
//     input is compact structured JSON, not the source document.
//
// Single-call for most documents in Stage A (buildDocumentAnalysisPrompt
// sees every chunk at once); a real two-stage map-reduce
// (runMapReduceAnalysis) is used only once the chunk text exceeds
// SINGLE_CALL_CHAR_BUDGET — most business reports never reach it, but the
// 150-page ceiling this app advertises can. Stage B runs identically
// either way, since it only ever sees Stage A's already-assembled output.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import {
  validateDocumentAnalysisContent,
  normaliseAuthorPerspective,
  nullableText,
  type DocumentAnalysisContent,
  type RawDocumentAnalysis,
  type ChunkLookup,
} from "@/lib/library-documents/analysis-schema";
import { DOCUMENT_TYPES } from "@/lib/library-documents/constants";
import {
  reorderBySignificance, describeFindingsForPrompt, describeStatisticsForPrompt,
  describeRecommendationsForPrompt, describeQuotesForPrompt, describeFrameworkForPrompt,
} from "@/lib/intelligence/analysts/documentSynthesis";

export type AnalyseDocumentChunk = ChunkLookup & { chunk_text: string };

// ~15k tokens of chunk text at a rough 4 chars/token — generous headroom
// under gpt-4o's context window once the prompt's own instructions and the
// JSON output budget are accounted for. Most industry reports/case studies/
// benchmarks land well under this; only unusually text-dense, long
// documents need the map-reduce path below.
const SINGLE_CALL_CHAR_BUDGET = 60000;
// Per-batch budget for the map stage — kept well under the single-call
// budget since each batch call also carries its own instructions.
const BATCH_CHAR_BUDGET = 24000;

// ── Stage A: extraction ──────────────────────────────────────────────────

const STAGE_A_RESPONSE_SHAPE = `{
  "title": "The document's actual title, as written — not a paraphrase",
  "author": "The document's author(s) or byline exactly as written — a person or team name — or null if the document itself doesn't state one. Not the publisher.",
  "source_publisher": "Publisher or issuing organisation, or null if not stated",
  "publisher_description": "What the document itself says about its publisher's business, expertise or focus, e.g. an 'about us' section or byline — else null. Never anything you may know about this publisher from outside the document.",
  "publication_date": "ISO date (YYYY-MM-DD) if stated, else your best single-date estimate from context, else null — never a range",
  "suggested_document_type": "One of: ${DOCUMENT_TYPES.map(t => t.value).join(", ")}",
  "markets": ["Countries or regions this document is actually about or covers"],
  "sports_competitions": ["Named sports, competitions or clubs actually discussed"],
  "audience_segments": ["Named fan/audience segments actually discussed, e.g. 'Gen Z fans', 'season ticket holders'"],
  "brands_mentioned": ["Brands or organisations actually named in the document"],
  "topics": ["3-8 topics/themes the document actually covers"],
  "tags": ["5-10 tags a researcher would search by later — prefer widely reusable thematic tags where they genuinely apply (e.g. Women's Football, Men's Football, Tournament, Club Football, International Football, UEFA, FIFA, Financial, Sponsorship, Fan Behaviour, Audience Research, Broadcast, Social Media, Brand, Commercial, Technology) alongside any document-specific ones"],
  "report_framework": {
    "name": "The report's own named model/framework if it proposes one (e.g. a set of named pillars or principles it organises its argument around), else the JSON literal null",
    "components": [{ "label": "A named component of the framework, exactly as the report names it", "description": "What this component means, per the report" }]
  },
  "key_findings": [
    { "text": "A specific fact the document states, not your interpretation of what it means", "provenance": [{ "chunk_index": 0, "quote": "a short exact phrase from that chunk supporting this" }] }
  ],
  "statistics": [
    { "text": "What the statistic measures", "value": "The exact figure as stated, e.g. '63%' or '£1.2bn'", "provenance": [{ "chunk_index": 0, "quote": "..." }] }
  ],
  "document_recommendations": [
    { "text": "A recommendation or piece of advice THIS DOCUMENT ITSELF makes (not your own recommendation)", "provenance": [{ "chunk_index": 0, "quote": "..." }] }
  ],
  "quotes": [
    { "text": "An exact, verbatim quote from the document", "attribution": "Who said it, if named, else null", "theme": "The finding or theme this quote substantiates or explains", "provenance": [{ "chunk_index": 0 }] }
  ],
  "methodology_notes": ["How the document's own findings were produced, e.g. sample size, method, fieldwork dates — empty array if not stated"],
  "limitations": ["Caveats or limitations the document itself states or that are evident from its methodology — empty array if none"],
  "research_quality": {
    "methodology_disclosed": true,
    "sample_size_disclosed": true,
    "geography_disclosed": true,
    "fieldwork_dates_disclosed": true,
    "demographic_definitions_disclosed": true,
    "source_type": "One of: primary, secondary, mixed, unclear"
  }
}`;

function describeChunksForPrompt(chunks: AnalyseDocumentChunk[]): string {
  return chunks
    .map(c => {
      const pageLabel = c.printed_page_label ?? (c.page_start !== null ? (c.page_start === c.page_end ? `PDF page ${c.page_start}` : `PDF pages ${c.page_start}-${c.page_end}`) : null);
      const location = c.section_label ? `Section: "${c.section_label}"` : pageLabel ?? "Location unknown";
      const kindLabel = c.evidence_kind === "visual" ? " — visual page description" : "";
      return `[chunk_index ${c.chunk_index}] (${location}${kindLabel})\n${c.chunk_text}`;
    })
    .join("\n\n---\n\n");
}

const COVERAGE_INSTRUCTIONS = `COVERAGE, non-negotiable — select findings by significance to the document's central argument, not by ease of extraction:
- Actively look for, and do not skip: demographic or motivational breakdowns (e.g. reasons respondents give, broken out by age, segment or group — not just top-line averages), values- or attitudinal findings (e.g. what respondents say matters to them, not only what they do), and any finding that recurs or is reinforced across multiple sections — a repeated theme is itself evidence of its importance to the document's argument.
- If the document proposes a named framework, model or set of pillars it organises its own argument around, you MUST capture it in "report_framework" with each named component — this is the document's own structuring logic, do not just fold it into "topics" as a loose theme.
- Aim for genuine coverage: a typical business report supports 8-15 key findings, not 3-4. If the document only supports fewer, do not pad — but do not stop at the first handful of easy, isolated statistics either.
- Some chunks are visual page descriptions (charts, pull-quotes, callout stats spotted on a rendered page image), not extracted body text — treat these as equally valid evidence to cite, on the same footing as text chunks, not as a lesser or separate category.`;

const QUOTES_INSTRUCTIONS = `QUOTES — selective, not exhaustive:
- Extract 3-8 quotes only where a quote adds something a paraphrase wouldn't: a vivid respondent voice, or the document's own words for a named theme or framework component.
- Never extract a quote that only restates a statistic you've already captured in "statistics".
- Every quote must be copied exactly, verbatim, from the source text above — never paraphrased, never invented.`;

const RESEARCH_QUALITY_INSTRUCTIONS = `RESEARCH QUALITY SIGNALS — tag each truthfully based only on what the document explicitly states, never inferred or assumed:
- "methodology_disclosed": does the document explain HOW the research was conducted (e.g. online survey, interviews, desk research, secondary synthesis)?
- "sample_size_disclosed": does it state how many respondents, participants or data points the findings are based on?
- "geography_disclosed": does it state which country, countries or region the research actually covers?
- "fieldwork_dates_disclosed": does it state when the research was conducted, even just a year or quarter?
- "demographic_definitions_disclosed": does it define the segments/groups it discusses (e.g. what age range counts as "Gen Z" here)?
- "source_type": is this the publisher's own original ("primary") research, does it mainly cite/synthesise other sources ("secondary"), a mix of both ("mixed"), or genuinely unclear?
Mark a signal true only if the document plainly states it — if you have to guess or infer, mark it false.`;

function buildDocumentAnalysisPrompt(fileTitle: string, chunksText: string): string {
  return `You are a research librarian at Fanometrix, cataloguing a document being added to a reusable Research Library. Your job is to describe what this document IS and extract what it actually states, thoroughly — not to interpret it for any particular research question (that happens later, separately, when this document is attached to a specific project), and not to write a final summary (a later stage does that from your validated output alone).

UPLOADED FILE: "${fileTitle}"

DOCUMENT CONTENT, split into numbered chunks — cite the exact chunk_index (and, optionally, a short exact quote) for every finding, statistic, recommendation and quote you report. Never cite a chunk_index that isn't listed below:

${chunksText}

YOUR TASK
Catalogue this document accurately and thoroughly. Ground every field in what the document actually says.

HOUSE STYLE, non-negotiable:
- "key_findings", "statistics" and "document_recommendations" must state only what the document itself says — never your own interpretation, implication, or a conclusion you draw from combining facts the document states separately. If the document doesn't state something directly, it doesn't belong here.
- Every key finding, statistic, recommendation and quote must cite at least one "chunk_index" from the list above, in "provenance". Never cite a chunk_index not listed. An item you can't trace to a specific chunk doesn't belong in this output.
- "tags" must be genuinely specific to this document's actual content, never generic filler like "research" or "report" alone.
- "methodology_notes" and "limitations" reflect what the document itself discloses — if it discloses nothing about method or limitations, return empty arrays, do not invent plausible-sounding ones.
- "publisher_description" is grounded strictly in what THIS document says about itself — never anything you may separately know about this publisher. Null if the document says nothing about its own publisher's business.
- Ban stock filler phrases: "it is worth noting", "in conclusion", "overall".

${COVERAGE_INSTRUCTIONS}

${QUOTES_INSTRUCTIONS}

${RESEARCH_QUALITY_INSTRUCTIONS}

Return ONLY valid JSON, exactly this shape:
${STAGE_A_RESPONSE_SHAPE}`;
}

async function runSingleCallAnalysis(fileTitle: string, chunks: AnalyseDocumentChunk[]): Promise<RawDocumentAnalysis> {
  return completeJSON<RawDocumentAnalysis>({
    prompt: buildDocumentAnalysisPrompt(fileTitle, describeChunksForPrompt(chunks)),
    model: "gpt-4o",
    temperature: 0.3,
    maxTokens: 4096,
  });
}

// ── Map-reduce path for unusually long documents ────────────────────────
function batchChunks(chunks: AnalyseDocumentChunk[]): AnalyseDocumentChunk[][] {
  const batches: AnalyseDocumentChunk[][] = [];
  let current: AnalyseDocumentChunk[] = [];
  let currentChars = 0;
  for (const chunk of chunks) {
    if (currentChars > 0 && currentChars + chunk.chunk_text.length > BATCH_CHAR_BUDGET) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(chunk);
    currentChars += chunk.chunk_text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

type RawBatchSummary = { summary: string };

function buildBatchSummaryPrompt(fileTitle: string, batch: AnalyseDocumentChunk[]): string {
  return `You are pre-summarising one section of a long document ("${fileTitle}") ahead of a later cataloguing step. List every concrete fact, finding, statistic, recommendation or notable verbatim quote stated in the excerpt below, each on its own line, each ending with its exact source in square brackets, e.g. "63% of fans engage via mobile. [chunk_index 4]". If this excerpt names or describes part of a framework/model the report organises itself around, states anything about the report's own methodology, sample size, geography, fieldwork dates or demographic definitions, or describes the publisher's own business/expertise (e.g. an "about us" section or byline), include those as their own lines too, clearly labelled (e.g. "Framework component: Affordability — low or no cost to participate. [chunk_index 2]", "Methodology: online survey of loyal fans. [chunk_index 1]", "Publisher self-description: a social-first content agency. [chunk_index 0]"). Some excerpt chunks are visual page descriptions (charts, pull-quotes, callout stats), not extracted text — treat their content as equally valid fact lines. Do not interpret or combine facts across lines. Be exhaustive about concrete facts, brief about everything else.

EXCERPT:
${describeChunksForPrompt(batch)}

Return ONLY valid JSON: { "summary": "one fact per line, each ending with its [chunk_index N] source" }`;
}

function buildSynthesisFromSummariesPrompt(fileTitle: string, summaries: string[]): string {
  return `You are a research librarian at Fanometrix, cataloguing a long document ("${fileTitle}") from pre-extracted section summaries below. Each line in these summaries already ends with its exact source, e.g. "[chunk_index 4]" — when you cite "provenance" in your output, use exactly the chunk_index numbers already present in these lines. Never invent a chunk_index that doesn't appear in the summaries below.

SECTION SUMMARIES (in document order):
${summaries.map((s, i) => `--- Section ${i + 1} ---\n${s}`).join("\n\n")}

YOUR TASK
Catalogue this document from the summaries above: what it is, and what it actually states, thoroughly. A later stage writes the final summary from your validated output alone — do not attempt one here.

HOUSE STYLE, non-negotiable:
- "key_findings", "statistics" and "document_recommendations" must state only what the summaries say — never your own interpretation or a conclusion drawn from combining separate facts.
- Every key finding, statistic, recommendation and quote must cite a "chunk_index" that appears in the summaries above, in "provenance". Never invent one.
- "tags" must be genuinely specific to this document's actual content.
- "methodology_notes" and "limitations" reflect only what the summaries disclose — empty arrays if nothing is disclosed.
- "publisher_description" is grounded strictly in what the summaries say the document itself states about its publisher — never anything you may separately know about this publisher. Null if the summaries say nothing about this.
- Ban stock filler phrases: "it is worth noting", "in conclusion", "overall".

${COVERAGE_INSTRUCTIONS}

${QUOTES_INSTRUCTIONS}

${RESEARCH_QUALITY_INSTRUCTIONS}

Return ONLY valid JSON, exactly this shape:
${STAGE_A_RESPONSE_SHAPE}`;
}

async function runMapReduceAnalysis(fileTitle: string, chunks: AnalyseDocumentChunk[]): Promise<RawDocumentAnalysis> {
  const batches = batchChunks(chunks);
  const summaries: string[] = [];
  for (const batch of batches) {
    const result = await completeJSON<RawBatchSummary>({
      prompt: buildBatchSummaryPrompt(fileTitle, batch),
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 1024,
    });
    if (result.summary?.trim()) summaries.push(result.summary.trim());
  }
  if (summaries.length === 0) {
    throw new IntelligenceError(500, "Document analysis could not extract any content from this document.");
  }
  return completeJSON<RawDocumentAnalysis>({
    prompt: buildSynthesisFromSummariesPrompt(fileTitle, summaries),
    model: "gpt-4o",
    temperature: 0.3,
    maxTokens: 4096,
  });
}

// ── Stage B: synthesis ───────────────────────────────────────────────────
// Sees ONLY Stage A's validated, structured output below — never the raw
// chunks again. This is what makes the executive_summary genuinely
// consistent with what was actually validated (it can't reference
// anything Stage A didn't itself already establish), and is what lets
// author_perspective ground itself in Stage A's own extracted
// document_recommendations rather than needing to re-read the source.

// publisher_description is never re-asked of Stage B — it's already
// validated text from Stage A (see RawDocumentAnalysis.publisher_description's
// own doc comment), carried forward verbatim in code rather than asking
// the model to copy it again, which would only risk paraphrasing drift for
// no benefit. Stage B's own job is strictly the judgement call
// (commercial_interest_note/independence_note), grounded in that
// description plus Stage A's own extracted recommendations.
//
// key_finding_order/statistic_order — added after the first real-document
// test showed Stage A's own extraction order (roughly document order) left
// a materially important statistic (the highest-scoring attitude finding in
// the whole report) sitting last in the list, under-weighted in the
// summary as a result. This is deliberately NOT a second extraction pass —
// Stage B still only re-orders the exact same validated Stage A items by
// significance to the report's central argument; it can't add, remove or
// reword any of them. See reorderBySignificance below for the "never drop,
// never invent" discipline this applies.
type RawStageB = {
  executive_summary?: string;
  summary?: string;
  commercial_interest_note?: string | null;
  independence_note?: string;
  key_finding_order?: number[];
  statistic_order?: number[];
};

const AUTHOR_PERSPECTIVE_INSTRUCTIONS = `AUTHOR PERSPECTIVE — grounded in what's given above only, never in outside/background knowledge you may have about this publisher:
- "commercial_interest_note": only if the RECOMMENDATIONS above concentrate narrowly around a category of service that plainly aligns with the PUBLISHER DESCRIPTION above. Base this purely on the recommendations already listed, not on anything you may know about this publisher from outside this document. The JSON literal null if there's no such pattern.
- "independence_note": one or two sentences, carefully neutral — this is relevant context for HOW to weigh the findings, never an accusation of bias and never a claim that the research is invalid.`;

function buildStageBPrompt(fileTitle: string, stageA: DocumentAnalysisContent, publisherDescription: string | null): string {
  const frameworkText = describeFrameworkForPrompt(stageA.report_framework);
  const findingsText = describeFindingsForPrompt(stageA.key_findings);
  const statsText = describeStatisticsForPrompt(stageA.statistics);
  const recommendationsText = describeRecommendationsForPrompt(stageA.document_recommendations);
  const quotesText = describeQuotesForPrompt(stageA.quotes);

  const hasAuthorContext = !!stageA.source_publisher && !!publisherDescription;

  return `You are a senior research analyst at Fanometrix, writing the final synthesis for a document already thoroughly catalogued below ("${fileTitle}"). You are not re-reading the source document — everything below is already validated and extracted. Your job is editorial judgement: decide what it collectively means, not just what it lists.

NAMED FRAMEWORK: ${frameworkText}

KEY FINDINGS:
${findingsText}

STATISTICS:
${statsText}

THE DOCUMENT'S OWN RECOMMENDATIONS:
${recommendationsText}

SELECTED QUOTES:
${quotesText}

PUBLISHER: ${stageA.source_publisher ?? "unknown"}
PUBLISHER DESCRIPTION (already extracted, what the document itself says about its publisher): ${publisherDescription ?? "(the document says nothing about this)"}

YOUR TASK

1. Treat the KEY FINDINGS, STATISTICS, RECOMMENDATIONS and QUOTES above as ONE pool of evidence, not four separate categories. The strongest synthesis often connects across these lists — a statistic explained by a quote, a finding that changes what a recommendation actually means.

2. Identify the single most important, connected story this evidence tells. Rank evidence by how much it matters to that story, never by the order it happens to appear above or how easy it was to state as a bare number. If any statistic above would materially change how a reader interprets the report's central argument, it must be foregrounded in your summary regardless of its position in the STATISTICS list — a decisive number must never stay buried beneath less consequential ones just because it was listed last.

3. Explain tensions, apparent contradictions and plausible causal relationships BETWEEN pieces of evidence, not each fact in isolation — e.g. if one finding shows declining engagement on one measure while another shows a persistent or even growing behaviour, say what that combination actually implies, don't just report both facts side by side. Ground every causal or interpretive claim strictly in what's listed above: state a cause or connection only when the evidence genuinely supports it. If the evidence shows a pattern but doesn't establish why, say that plainly rather than inventing a plausible-sounding explanation — the same discipline a good analyst applies to their own reasoning, not just to the source material.

4. A quote may illustrate or add texture to a point your synthesis is already making from the findings/statistics — never treat a quote's content as a new, separate fact to report on its own.

5. If a named framework exists, use it as the organising thread only where the evidence actually supports doing so — don't force unrelated findings into it.

6. Never introduce a fact, cause, number or connection that isn't grounded in what's listed above. Ban stock filler phrases: "it is worth noting", "in conclusion", "overall".

Write as many sentences as the evidence genuinely supports to do this properly — usually 4-7, never padded to reach a count, never rushed past a genuine tension or implication to stay short.

Also write "summary": a tight abstract for the top of the document's own page — the way a research paper's abstract sits above the paper, DISTINCT from and shorter than the executive_summary above. In roughly 100-150 words, orientation first: say what this document actually is (its kind, scope and who produced it), state the 2-4 most important findings or conclusions in plain terms, and make clear why it matters to a sports/fan research team deciding whether to open it or use it in analysis. Natural, human prose someone can absorb in about 20 seconds — never a bare list of extracted facts, never padded narrative, and never just a re-wording of the executive_summary. If it runs to more than one short paragraph, separate paragraphs with a blank line (a literal \\n\\n in the JSON string): the first paragraph covering what the document is about, the next its most important findings and why they matter.

Also return "key_finding_order" and "statistic_order": the 0-based indices from the KEY FINDINGS and STATISTICS lists above, each reordered from MOST to LEAST significant to the report's central argument (the same judgement behind your summary, not document order). Include every index exactly once.

${hasAuthorContext ? AUTHOR_PERSPECTIVE_INSTRUCTIONS : `There's no usable publisher description for this document — set both "commercial_interest_note" and "independence_note" to the JSON literal null (independence_note as a JSON null is fine here; there's nothing to note).`}

Return ONLY valid JSON:
{
  "executive_summary": "...",
  "summary": "...",
  "key_finding_order": [${stageA.key_findings.map((_, i) => i).join(", ")}],
  "statistic_order": [${stageA.statistics.map((_, i) => i).join(", ")}],
  "commercial_interest_note": ${hasAuthorContext ? '"..." or null' : "null"},
  "independence_note": ${hasAuthorContext ? '"..."' : "null"}
}`;
}

async function runStageB(fileTitle: string, stageA: DocumentAnalysisContent, publisherDescription: string | null): Promise<RawStageB> {
  return completeJSON<RawStageB>({
    prompt: buildStageBPrompt(fileTitle, stageA, publisherDescription),
    model: "gpt-4o",
    temperature: 0.3,
    maxTokens: 1024,
  });
}

export async function analyseDocument(fileTitle: string, chunks: AnalyseDocumentChunk[]): Promise<DocumentAnalysisContent> {
  if (chunks.length === 0) {
    throw new IntelligenceError(400, "This document has no extracted text to analyse.");
  }

  const totalChars = chunks.reduce((sum, c) => sum + c.chunk_text.length, 0);
  const rawStageA = totalChars <= SINGLE_CALL_CHAR_BUDGET
    ? await runSingleCallAnalysis(fileTitle, chunks)
    : await runMapReduceAnalysis(fileTitle, chunks);

  const stageA = validateDocumentAnalysisContent(rawStageA, chunks);
  const publisherDescription = nullableText(rawStageA.publisher_description);

  const rawStageB = await runStageB(fileTitle, stageA, publisherDescription);

  return {
    ...stageA,
    key_findings: reorderBySignificance(stageA.key_findings, rawStageB.key_finding_order),
    statistics: reorderBySignificance(stageA.statistics, rawStageB.statistic_order),
    executive_summary: rawStageB.executive_summary?.trim() || stageA.executive_summary,
    // The abstract for the document page (falls back to the fuller synthesis
    // if the model omitted it) — promoted to library_documents.description.
    summary: rawStageB.summary?.trim() || rawStageB.executive_summary?.trim() || stageA.executive_summary,
    author_perspective: normaliseAuthorPerspective(
      {
        publisher_description: publisherDescription,
        commercial_interest_note: rawStageB.commercial_interest_note,
        independence_note: rawStageB.independence_note,
      },
      stageA.source_publisher
    ),
  };
}
