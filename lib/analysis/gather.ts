// Gathering: turning approved evidence into one Evidence Frame per Information
// Need (docs/intelligence-model.md §5 FRAMING), and — new in Phase 1 calibration
// — an Evidence Consumption Report proving exactly what reached reasoning.
//
// The seam between Collection and Analysis, and deliberately a thin one. It reads
// approved evidence, asks each item's Source Contract what it supplies and what
// one observation of it is, and hands the result to framing. It makes NO
// epistemic judgements of its own: it never decides what evidence can establish,
// never computes independence, never scores relevance. Every one of those belongs
// to a declaration or a pure function elsewhere, because a gatherer that judges
// is a gatherer that quietly redefines what the platform may say.
//
// What it DOES now own is honesty about consumption. Every source is either
// gathered or accounted for with a reason (the ledger), so "Analysis ignored my
// documents" is a question with an answer on the screen rather than a mystery.
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getProjectSearchStates, type ProjectSearchState,
} from "@/lib/research-sources/project-searches";
import { resolveInformationNeeds } from "@/lib/research-sources/information-needs";
import { flattenNeeds, type FlatNeed } from "@/lib/information-needs";
import { asEvidenceRole } from "@/lib/evidence-role";
import { frameEvidence, DEFAULT_BEARING_FLOOR, type EvidenceFrame, type FramedItem } from "@/lib/analysis/framing";
import {
  CONVERSATION_CONTRACT, NEWS_CONTRACT, SURVEY_CONTRACT, DOCUMENT_CONTRACT, resolve,
} from "@/lib/analysis/source-contract";
import { assignSource } from "@/lib/analysis/assignment";
import { isApproved, type ResearchDesign } from "@/lib/research-design";
import { getSummary } from "@/lib/intelligence/store";
import { getCurrentAnalysis } from "@/lib/library-documents/analysis-store";
import { surveyObservations, type SurveyResponseRow } from "@/lib/analysis/survey-observations";
import { buildLedger, realExclusions, type EvidenceLedger, type LedgerExclusion, type LedgerSource } from "@/lib/analysis/ledger";
import type { DocumentIntelligenceReport } from "@/lib/intelligence/analysts/analyseDocumentForProject";
import type { LocalisedQuestion } from "@/lib/survey-locale";

/** Below this a survey reads nothing reliable off its own responses. The same
 *  floor Survey Intelligence already applies, so one number means one thing. */
const MIN_SURVEY_RESPONSES = 50;
/** Bound the evidence one document contributes, so a long report cannot crowd
 *  out every other source in a frame. */
const MAX_ITEMS_PER_DOCUMENT = 40;

/** An item before framing has judged its fit to a need. */
type BaseItem = Omit<FramedItem, "methodFit" | "bearing">;

// ── Survey ───────────────────────────────────────────────────────────────────

/** Everything a survey establishes, as items — now the FULL evidence base, not a
 *  top-four-options summary: every option (minorities included), and where each
 *  market and segment diverges from the whole (lib/analysis/survey-observations.ts).
 *  The observation unit is the completed response and the dedup key is the
 *  instrument, so two statistics from one survey draw on one pool of respondents. */
async function surveyEvidence(surveyId: string): Promise<{ items: BaseItem[]; responses: number }> {
  const { data: survey } = await supabaseAdmin
    .from("surveys").select("name, questions, is_simulated").eq("id", surveyId).maybeSingle();
  if (!survey) return { items: [], responses: 0 };

  const { data: responseRows } = await supabaseAdmin
    .from("responses")
    .select("q1, q2, q3, country, fan_segment")
    .eq("survey_id", surveyId)
    .eq("is_demo", survey.is_simulated);
  const responses = (responseRows ?? []) as SurveyResponseRow[];
  if (responses.length < MIN_SURVEY_RESPONSES) return { items: [], responses: responses.length };

  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);
  const resolved = resolve(SURVEY_CONTRACT, { surveyId, responses: responses.length });

  const items = surveyObservations({ surveyName: survey.name as string, questions, responses })
    .map((o, j): BaseItem => ({
      evidenceId: `${surveyId}#${j}`,
      // Computed in survey-observations from the real counts, never written by a
      // model. The figure a claim may quote has to be one we calculated.
      content: o.content,
      contribution: resolved.contribution,
      observationKey: resolved.observationKey,
      observations: resolved.observations,
      role: "direct",
      provenance: o.provenance,
    }));
  return { items, responses: responses.length };
}

// ── Document ─────────────────────────────────────────────────────────────────

type DocumentResult =
  | { items: BaseItem[]; findings: number; status: "ok" }
  | { items: []; findings: 0; status: "awaiting_library" | "no_analysis" };

/** What a document establishes, read from its already-approved Document
 *  Intelligence. Prefers a curated, project-specific summary where one has been
 *  approved; otherwise reads the document's approved Research Library analysis
 *  directly — the standalone report is excellent and auto-approves on successful
 *  processing (migration 130), so an approved document reaches Analysis with no
 *  further manual step. Never the source file again: the approved analysis is the
 *  evidence, and re-reading the PDF here would be a second interpretation. */
async function documentEvidence(link: { id: string; evidence_id: string }): Promise<DocumentResult> {
  let keyFindings: { id: string; text: string }[];
  let statistics: { id: string; text: string; value: string | null }[];
  let title: string;

  const projectSummary = await getSummary<DocumentIntelligenceReport>("document_project", link.id, "research_summary");
  if (projectSummary && (projectSummary.status === "approved" || projectSummary.status === "published")) {
    const content = projectSummary.edited_content ?? projectSummary.content;
    keyFindings = content.key_findings;
    statistics = content.statistics;
    title = content.document_summary.title;
  } else {
    // No curated project summary — fall back to the approved Library analysis.
    const { data: doc } = await supabaseAdmin
      .from("library_documents").select("status").eq("id", link.evidence_id).maybeSingle();
    if (!doc || doc.status !== "approved") return { items: [], findings: 0, status: "awaiting_library" };
    const analysis = await getCurrentAnalysis(link.evidence_id);
    if (!analysis) return { items: [], findings: 0, status: "no_analysis" };
    const content = analysis.edited_content ?? analysis.content;
    keyFindings = content.key_findings;
    statistics = content.statistics;
    title = content.title;
  }

  // Authorship decides whether a document is established knowledge or an
  // interested party's claim about itself, and it is not recoverable from the
  // file. Until it is recorded, the more constrained reading applies.
  const resolved = resolve(DOCUMENT_CONTRACT, { documentId: link.evidence_id, authorship: "interested" });

  const entries = [
    ...keyFindings.map(f => ({ id: f.id, text: f.text })),
    ...statistics.map(s => ({ id: s.id, text: s.value ? `${s.value}: ${s.text}` : s.text })),
  ].slice(0, MAX_ITEMS_PER_DOCUMENT);

  const items = entries.map((e): BaseItem => ({
    evidenceId: `${link.evidence_id}#${e.id}`,
    content: e.text,
    contribution: resolved.contribution,
    observationKey: resolved.observationKey,
    observations: resolved.observations,
    role: "direct",
    provenance: title,
  }));
  return { items, findings: entries.length, status: "ok" };
}

// ── Conversation / News rows ─────────────────────────────────────────────────

/** One row as Collection stores it, reduced to what a contract needs. Named
 *  structurally rather than after a table, so the pure mapping below does not
 *  depend on storage. */
export type CollectedRow = {
  id: string;
  content: string;
  contentKind: string | null;      // 'article' marks editorial coverage
  author: string | null;
  publisher: string | null;
  syndicationKey: string | null;
  newsSourceType: string | null;   // as classified at collection
  platform: string | null;
  market: string | null;
  evidenceRole: string | null;
  relevanceScore: number | null;
  publishedAt: string | null;
};

const asNewsSourceType = (v: string | null): "reporting" | "brand_announcement" | "opinion" | "unclear" =>
  v === "reporting" || v === "brand_announcement" || v === "opinion" ? v : "unclear";

/** Where an item came from, for explaining an exclusion concretely. */
function provenanceOf(row: CollectedRow, isArticle: boolean): string | null {
  const parts = isArticle
    ? [row.publisher, row.author, row.publishedAt ? row.publishedAt.slice(0, 10) : null]
    : [row.platform, row.market];
  return parts.filter(Boolean).join(" · ") || null;
}

/** The ledger bucket a collected row belongs to, so News, YouTube and Bluesky
 *  are counted as the distinct things they are. */
function conversationBucket(row: CollectedRow): string {
  if (row.contentKind === "article") return "News articles";
  const p = (row.platform ?? "").toLowerCase();
  if (p.includes("youtube")) return "YouTube comments";
  if (p.includes("bluesky") || p.includes("bsky")) return "Bluesky posts";
  if (p.includes("reddit")) return "Reddit posts";
  return row.platform ? `${row.platform} mentions` : "Other conversations";
}

/** One collected row, offered to one Information Need.
 *
 *  PURE. Contribution kind and observation unit are read from the Source
 *  Contract, method fit from the approved design, and bearing from the
 *  classifier. Nothing is decided here. Returns null for an unscored row: without
 *  a relevance judgement there is no bearing to admit it on. */
export function toFramedItem(row: CollectedRow, need: FlatNeed): FramedItem | null {
  if (typeof row.relevanceScore !== "number") return null;

  const isArticle = row.contentKind === "article";
  const resolved = isArticle
    ? resolve(NEWS_CONTRACT, {
        id: row.id,
        syndicationKey: row.syndicationKey,
        publisher: row.publisher,
        sourceType: asNewsSourceType(row.newsSourceType),
      })
    : resolve(CONVERSATION_CONTRACT, { id: row.id, author: row.author });

  return {
    evidenceId: row.id,
    contribution: resolved.contribution,
    observationKey: resolved.observationKey,
    observations: resolved.observations,
    content: row.content,
    role: asEvidenceRole(row.evidenceRole),
    methodFit: need.method_fit,
    bearing: row.relevanceScore,
    provenance: provenanceOf(row, isArticle),
  };
}

function mapRow(r: Record<string, unknown>): CollectedRow {
  const meta = (r.metadata ?? {}) as { publisher?: unknown; syndication_key?: unknown; news?: { source_type?: unknown } };
  return {
    id: r.id as string,
    content: ((r.content as string | null) ?? "").trim(),
    contentKind: (r.content_kind as string | null) ?? null,
    author: (r.author as string | null) ?? null,
    publisher: typeof meta.publisher === "string" ? meta.publisher : null,
    syndicationKey: typeof meta.syndication_key === "string" ? meta.syndication_key : null,
    newsSourceType: typeof meta.news?.source_type === "string" ? meta.news.source_type : null,
    platform: (r.platform as string | null) ?? null,
    market: (r.market as string | null) ?? null,
    evidenceRole: (r.evidence_role as string | null) ?? null,
    relevanceScore: (r.relevance_score as number | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

// ── Result ───────────────────────────────────────────────────────────────────

export type GatheredNeed = {
  need: FlatNeed;
  frame: EvidenceFrame;
};

export type GatherResult = {
  gathered: GatheredNeed[];
  /** Sources attached to the project that carry no Information Need mapping, so
   *  their evidence cannot yet be framed. Reported rather than dropped: an
   *  unmapped source is a gap in the research design, not an absence of
   *  evidence, and the two need opposite responses. */
  unmapped: { evidenceType: string; evidenceId: string; reason: string }[];
  /** The Evidence Consumption Report: exactly what reached reasoning, and what
   *  did not and why. Built before a single proposition is formed. */
  consumption: EvidenceLedger;
};

/** Build one Evidence Frame per Information Need for a project, and the ledger of
 *  what was consumed.
 *
 *  Reads only ANALYSIS-ELIGIBLE searches and INCLUDED evidence, so the Evidence
 *  Validation gate holds (docs/evidence-validation-blueprint.md), while a search
 *  approved once is not silently evicted by a later collection run. */
export async function gatherFrames(projectId: string): Promise<GatherResult> {
  const unmapped: GatherResult["unmapped"] = [];
  const notes: string[] = [];
  const itemsByNeed = new Map<string, { need: FlatNeed; items: FramedItem[] }>();

  // The approved design supplies the assignment for project-attached evidence and
  // the fallback assignment for searches that carry no Information Needs.
  const { data: projectRow } = await supabaseAdmin
    .from("research_projects").select("research_design").eq("id", projectId).maybeSingle();
  const design = (projectRow?.research_design as ResearchDesign | null) ?? null;
  const requirements = design && isApproved(design) ? design.requirements : [];

  const addItems = (need: FlatNeed, items: FramedItem[]) => {
    const entry = itemsByNeed.get(need.id) ?? { need, items: [] };
    entry.items.push(...items);
    itemsByNeed.set(need.id, entry);
  };

  // ── Conversation / News ────────────────────────────────────────────────────
  const searchStates = await getProjectSearchStates(projectId);
  const eligibleSearches = searchStates.filter(s => s.eligible);

  // Needs per eligible search; where a search carries none, fall back to the
  // approved design's method commissioning (design-assigned, clearly labelled).
  const needsBySearch = new Map<string, FlatNeed[]>();
  let searchesUnmappable = 0;
  for (const s of eligibleSearches) {
    let needs = flattenNeeds(await resolveInformationNeeds({ searchId: s.id }));
    if (needs.length === 0 && requirements.length > 0) {
      const { assigned } = assignSource({ fulfils: ["conversation", "news"], requirements });
      if (assigned.length > 0) {
        needs = assigned.map(a => a.need);
        notes.push(`"${s.name}" was assigned by the approved Research Design, not by its own Information Needs (design-assigned).`);
      }
    }
    if (needs.length === 0) {
      searchesUnmappable++;
      unmapped.push({
        evidenceType: "social_search", evidenceId: s.id,
        reason: requirements.length === 0
          ? "This search has no Information Needs, and the project has no approved Research Design to assign it by."
          : "This search has no Information Needs, and the approved design commissioned no conversation or news research it could answer.",
      });
      continue;
    }
    needsBySearch.set(s.id, needs);
  }

  const mappedSearchIds = [...needsBySearch.keys()];
  const rawByBucket = new Map<string, number>();
  let convCollected = 0, convUnscored = 0, convBelowFloor = 0, convSupplied = 0;

  if (mappedSearchIds.length > 0) {
    // No relevance filter on the query: unscored rows are COUNTED here (and then
    // skipped by toFramedItem) so the ledger can report them, rather than the
    // query hiding them and the count reading as zero.
    const { data } = await supabaseAdmin
      .from("social_mentions")
      .select("id, search_id, content, content_kind, author, platform, market, evidence_role, relevance_score, published_at, metadata")
      .in("search_id", mappedSearchIds)
      .eq("excluded", false)
      .limit(5000);

    const rowsBySearch = new Map<string, CollectedRow[]>();
    for (const raw of (data ?? []) as Record<string, unknown>[]) {
      const searchId = (raw.search_id as string | null) ?? "";
      const row = mapRow(raw);
      convCollected++;
      rawByBucket.set(conversationBucket(row), (rawByBucket.get(conversationBucket(row)) ?? 0) + 1);
      if (typeof row.relevanceScore !== "number") convUnscored++;
      else if (row.relevanceScore < DEFAULT_BEARING_FLOOR) convBelowFloor++;
      else convSupplied++;
      const list = rowsBySearch.get(searchId) ?? [];
      list.push(row);
      rowsBySearch.set(searchId, list);
    }

    // One frame per need. A need served by several searches gathers from all of
    // them, which is how cross-source evidence reaches one question.
    for (const [searchId, needs] of needsBySearch) {
      const rows = rowsBySearch.get(searchId) ?? [];
      for (const need of needs) {
        const items = rows.map(row => toFramedItem(row, need)).filter((x): x is FramedItem => x !== null);
        addItems(need, items);
      }
    }
  }

  // ── Project-attached evidence (surveys, documents) ─────────────────────────
  const { data: attached } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, evidence_type, evidence_id")
    .eq("research_project_id", projectId)
    .in("evidence_type", ["survey", "document"]);

  const surveyLinks = (attached ?? []).filter(l => l.evidence_type === "survey") as { id: string; evidence_id: string }[];
  const documentLinks = (attached ?? []).filter(l => l.evidence_type === "document") as { id: string; evidence_id: string }[];

  // Surveys
  let surveysConsumed = 0, surveyResponses = 0, surveyObs = 0;
  let surveyTooFew = 0, surveyUnassigned = 0;
  for (const link of surveyLinks) {
    if (requirements.length === 0) {
      surveyUnassigned++;
      unmapped.push({ evidenceType: "survey", evidenceId: link.evidence_id, reason: "The project has no approved Research Design, so there is nothing to assign this survey to." });
      continue;
    }
    const { assigned } = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements });
    if (assigned.length === 0) {
      surveyUnassigned++;
      unmapped.push({ evidenceType: "survey", evidenceId: link.evidence_id, reason: "The approved design commissioned no questions a survey can answer." });
      continue;
    }
    const { items, responses } = await surveyEvidence(link.evidence_id);
    surveyResponses += responses;
    if (items.length === 0) {
      surveyTooFew++;
      unmapped.push({ evidenceType: "survey", evidenceId: link.evidence_id, reason: `This survey has too few responses to read anything off (needs ${MIN_SURVEY_RESPONSES}, has ${responses}).` });
      continue;
    }
    surveysConsumed++;
    surveyObs += items.length;
    for (const { need } of assigned) {
      addItems(need, items.map(item => ({ ...item, methodFit: need.method_fit, bearing: null })));
    }
  }

  // Documents
  let documentsConsumed = 0, documentFindings = 0;
  let docAwaitingLibrary = 0, docNoAnalysis = 0, docUnassigned = 0;
  for (const link of documentLinks) {
    if (requirements.length === 0) {
      docUnassigned++;
      unmapped.push({ evidenceType: "document", evidenceId: link.evidence_id, reason: "The project has no approved Research Design, so there is nothing to assign this document to." });
      continue;
    }
    const { assigned } = assignSource({ fulfils: DOCUMENT_CONTRACT.fulfils, requirements });
    if (assigned.length === 0) {
      docUnassigned++;
      unmapped.push({ evidenceType: "document", evidenceId: link.evidence_id, reason: "The approved design commissioned no research this document could answer." });
      continue;
    }
    const doc = await documentEvidence(link);
    if (doc.status !== "ok") {
      if (doc.status === "awaiting_library") docAwaitingLibrary++;
      else docNoAnalysis++;
      unmapped.push({
        evidenceType: "document", evidenceId: link.evidence_id,
        reason: doc.status === "awaiting_library"
          ? "This document's Research Library analysis is not approved yet."
          : "This document has no analysis to read.",
      });
      continue;
    }
    documentsConsumed++;
    documentFindings += doc.findings;
    for (const { need } of assigned) {
      addItems(need, doc.items.map(item => ({ ...item, methodFit: need.method_fit, bearing: null })));
    }
  }

  // ── Evidence Consumption Report ────────────────────────────────────────────
  const ledgerSources: LedgerSource[] = [];

  ledgerSources.push({
    key: "survey",
    label: "Survey",
    lines: [
      { label: "surveys consumed", count: surveysConsumed },
      { label: "responses behind them", count: surveyResponses },
      { label: "observations extracted", count: surveyObs },
    ],
    supplied: surveyObs,
    exclusions: realExclusions([
      { reason: `Too few responses (under ${MIN_SURVEY_RESPONSES})`, count: surveyTooFew },
      { reason: "Not commissioned by the approved design", count: surveyUnassigned },
    ]),
  });

  ledgerSources.push({
    key: "document",
    label: "Research Library",
    lines: [
      { label: "approved documents consumed", count: documentsConsumed },
      { label: "approved findings extracted", count: documentFindings },
    ],
    supplied: documentFindings,
    exclusions: realExclusions([
      { reason: "Research Library analysis not approved yet", count: docAwaitingLibrary },
      { reason: "No document analysis generated", count: docNoAnalysis },
      { reason: "Not commissioned by the approved design", count: docUnassigned },
    ]),
  });

  const ineligibleByReason = countIneligible(searchStates.filter(s => !s.eligible));
  ledgerSources.push({
    key: "conversation",
    label: "Conversation & News",
    lines: [
      { label: "searches consumed", count: mappedSearchIds.length },
      { label: "conversations collected", count: convCollected },
      ...[...rawByBucket.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
      { label: "observations supplied", count: convSupplied },
    ],
    supplied: convSupplied,
    exclusions: realExclusions([
      ...ineligibleByReason,
      { reason: "Search has no Information Needs and no design assignment", count: searchesUnmappable },
      { reason: "Collected but not relevance-scored (classifier unavailable)", count: convUnscored },
      { reason: "Below the relevance threshold", count: convBelowFloor },
    ]),
  });

  return {
    gathered: [...itemsByNeed.values()].map(({ need, items }) => ({
      need,
      frame: frameEvidence({ needId: need.id, items }),
    })),
    unmapped,
    consumption: buildLedger(ledgerSources, notes),
  };
}

/** Group not-yet-eligible searches by the reason they are held back, so the
 *  ledger names each exclusion rather than dropping it silently. The reason is
 *  classified at the source (project-searches.ineligibleReason): a never-reviewed
 *  search (draft/collecting) and a first submission awaiting approval are held
 *  back for different reasons and call for different responses. A search that was
 *  approved once but reverted to pending_approval is NOT here — it stays eligible
 *  (awaiting re-approval) and is consumed. */
function countIneligible(ineligible: ProjectSearchState[]): LedgerExclusion[] {
  const byReason = new Map<string, number>();
  for (const s of ineligible) {
    const reason = s.ineligibleReason ?? "Held back from Analysis";
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return realExclusions([...byReason.entries()].map(([reason, count]) => ({ reason, count })));
}
