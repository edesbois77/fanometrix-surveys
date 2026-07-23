// Gathering: turning approved evidence into one Evidence Frame per Information
// Need (docs/intelligence-model.md §5 FRAMING).
//
// The seam between Collection and Analysis, and deliberately a thin one. It reads
// approved evidence, asks each item's Source Contract what it supplies and what
// one observation of it is, and hands the result to framing. It makes NO
// epistemic judgements of its own: it never decides what evidence can establish,
// never computes independence, never scores relevance. Every one of those belongs
// to a declaration or a pure function elsewhere, because a gatherer that judges
// is a gatherer that quietly redefines what the platform may say.
//
// The row-to-item mapping is pure and exported, so the part with the judgement
// risk is testable without a database and the part with the database has no
// judgement in it.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getApprovedProjectSocialSearchIds } from "@/lib/research-sources/project-searches";
import { resolveInformationNeeds } from "@/lib/research-sources/information-needs";
import { flattenNeeds, type FlatNeed } from "@/lib/information-needs";
import { asEvidenceRole } from "@/lib/evidence-role";
import { frameEvidence, type EvidenceFrame, type FramedItem } from "@/lib/analysis/framing";
import {
  CONVERSATION_CONTRACT, NEWS_CONTRACT, SURVEY_CONTRACT, DOCUMENT_CONTRACT, resolve,
} from "@/lib/analysis/source-contract";
import { assignSource } from "@/lib/analysis/assignment";
import { isApproved, type ResearchDesign } from "@/lib/research-design";
import { getSummary } from "@/lib/intelligence/store";
import type { DocumentIntelligenceReport } from "@/lib/intelligence/analysts/analyseDocumentForProject";
import type { LocalisedQuestion } from "@/lib/survey-locale";

/** Below this a survey reads nothing reliable off its own responses. The same
 *  floor Survey Intelligence already applies, so one number means one thing. */
const MIN_SURVEY_RESPONSES = 50;
/** An option below this share is real but not notable, and admitting the long
 *  tail buries the findings that matter under near-noise. */
const NOTABLE_OPTION_PCT = 15;
/** Bound the evidence one document contributes, so a long report cannot crowd
 *  out every other source in a frame. */
const MAX_ITEMS_PER_DOCUMENT = 40;

/** Everything a survey establishes, as items. The observation unit is the
 *  completed response and the dedup key is the instrument, so two statistics from
 *  one survey draw on one pool of respondents rather than two. */
async function surveyItems(surveyId: string): Promise<Omit<FramedItem, "methodFit" | "bearing">[]> {
  const { data: survey } = await supabaseAdmin
    .from("surveys").select("name, questions, is_simulated").eq("id", surveyId).maybeSingle();
  if (!survey) return [];

  const { data: responses } = await supabaseAdmin
    .from("responses").select("q1, q2, q3").eq("survey_id", surveyId).eq("is_demo", survey.is_simulated);
  const all = responses ?? [];
  if (all.length < MIN_SURVEY_RESPONSES) return [];

  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);
  const keys = ["q1", "q2", "q3"] as const;
  const out: Omit<FramedItem, "methodFit" | "bearing">[] = [];

  questions.forEach((q, i) => {
    if (!q) return;
    const counts: Record<string, number> = {};
    let answered = 0;
    for (const r of all) {
      const raw = (r as Record<string, string | null>)[keys[i]];
      if (raw == null || raw === "") continue;
      const label = q.options.find(o => o.id === Number(raw))?.text.en ?? String(raw);
      counts[label] = (counts[label] ?? 0) + 1;
      answered++;
    }
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, pct: answered ? Math.round((count / answered) * 100) : 0 }))
      .filter(o => o.pct >= NOTABLE_OPTION_PCT)
      .slice(0, 4)
      .forEach((o, j) => {
        const resolved = resolve(SURVEY_CONTRACT, { surveyId, responses: answered });
        const question = q.text.en ?? `Question ${i + 1}`;
        out.push({
          evidenceId: `${surveyId}#q${i}#${o.label}#${j}`,
          // Computed here, from the real counts, never written by a model. The
          // figure a claim may quote has to be one we calculated.
          content: `${o.pct}% of ${answered} respondents chose "${o.label}" for "${question}".`,
          contribution: resolved.contribution,
          observationKey: resolved.observationKey,
          observations: resolved.observations,
          role: "direct",
          provenance: q.text.en ?? `Question ${i + 1}`,
        });
      });
  });
  return out;
}

/** What a document establishes, read from its already-approved, project-specific
 *  Document Intelligence. Never the source file again: the approved analysis is
 *  the evidence, and re-reading the PDF here would be a second interpretation of
 *  the same material. */
async function documentItems(evidenceRowId: string): Promise<Omit<FramedItem, "methodFit" | "bearing">[]> {
  const summary = await getSummary<DocumentIntelligenceReport>("document_project", evidenceRowId, "research_summary");
  if (!summary || (summary.status !== "approved" && summary.status !== "published")) return [];

  const content = summary.edited_content ?? summary.content;
  // Authorship decides whether a document is established knowledge or an
  // interested party's claim about itself, and it is not recoverable from the
  // file. Until it is recorded, the more constrained reading applies.
  const resolved = resolve(DOCUMENT_CONTRACT, { documentId: evidenceRowId, authorship: "interested" });

  const entries = [
    ...content.key_findings.map(f => ({ id: f.id, text: f.text })),
    ...content.statistics.map(s => ({ id: s.id, text: s.value ? `${s.value}: ${s.text}` : s.text })),
  ].slice(0, MAX_ITEMS_PER_DOCUMENT);

  return entries.map(e => ({
    evidenceId: `${evidenceRowId}#${e.id}`,
    content: e.text,
    contribution: resolved.contribution,
    observationKey: resolved.observationKey,
    observations: resolved.observations,
    role: "direct" as const,
    provenance: content.document_summary.title,
  }));
}

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

/** One collected row, offered to one Information Need.
 *
 *  PURE. Contribution kind and observation unit are read from the Source
 *  Contract, method fit from the approved design, and bearing from the
 *  classifier. Nothing is decided here.
 *
 *  One honest limitation, stated rather than hidden: `bearing` is the relevance
 *  the classifier judged against the search's needs COLLECTIVELY, so an item
 *  offered to four needs carries the same bearing to each. Per-need bearing needs
 *  a per-need judgement, which belongs to Formation where a claim is being made
 *  about a specific need. Until then this over-admits rather than under-admits,
 *  which framing's exclusions and the coverage layer both make visible. */
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
};

/** Build one Evidence Frame per Information Need for a project.
 *
 *  Reads only APPROVED searches and INCLUDED evidence, so the Evidence Validation
 *  gate holds (docs/evidence-validation-blueprint.md). */
export async function gatherFrames(projectId: string): Promise<GatherResult> {
  const searchIds = await getApprovedProjectSocialSearchIds(projectId);
  const unmapped: GatherResult["unmapped"] = [];

  // Needs are per search, because that is where the approved design records them
  // today (lib/research-sources/information-needs.ts owns that fact, not this).
  const needsBySearch = new Map<string, FlatNeed[]>();
  for (const searchId of searchIds) {
    const needs = flattenNeeds(await resolveInformationNeeds({ searchId }));
    if (needs.length === 0) {
      unmapped.push({
        evidenceType: "social_search", evidenceId: searchId,
        reason: "This source has no Information Needs, so its evidence cannot be judged against a question.",
      });
      continue;
    }
    needsBySearch.set(searchId, needs);
  }

  const mappedSearchIds = [...needsBySearch.keys()];
  const rowsBySearch = new Map<string, CollectedRow[]>();
  if (mappedSearchIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("social_mentions")
      .select("id, search_id, content, content_kind, author, platform, market, evidence_role, relevance_score, published_at, metadata")
      .in("search_id", mappedSearchIds)
      .eq("excluded", false)
      .not("relevance_score", "is", null)
      .limit(5000);

    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const searchId = (r.search_id as string | null) ?? "";
      const meta = (r.metadata ?? {}) as { publisher?: unknown; syndication_key?: unknown; news?: { source_type?: unknown } };
      const row: CollectedRow = {
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
      const list = rowsBySearch.get(searchId) ?? [];
      list.push(row);
      rowsBySearch.set(searchId, list);
    }
  }

  // One frame per need. A need served by several searches gathers from all of
  // them, which is how cross-source evidence reaches one question.
  const itemsByNeed = new Map<string, { need: FlatNeed; items: FramedItem[] }>();
  for (const [searchId, needs] of needsBySearch) {
    const rows = rowsBySearch.get(searchId) ?? [];
    for (const need of needs) {
      const entry = itemsByNeed.get(need.id) ?? { need, items: [] };
      for (const row of rows) {
        const item = toFramedItem(row, need);
        if (item) entry.items.push(item);
      }
      itemsByNeed.set(need.id, entry);
    }
  }

  // ── Project-attached evidence, assigned through the approved design ────────
  // A survey or a document knows nothing about any question, so the design's own
  // method assignment supplies the mapping (lib/analysis/assignment.ts). Nothing
  // is guessed: a source unassigned by the design stays unassigned here.
  const { data: projectRow } = await supabaseAdmin
    .from("research_projects").select("research_design").eq("id", projectId).maybeSingle();
  const design = (projectRow?.research_design as ResearchDesign | null) ?? null;
  const requirements = design && isApproved(design) ? design.requirements : [];

  const { data: attached } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, evidence_type, evidence_id")
    .eq("research_project_id", projectId)
    .in("evidence_type", ["survey", "document"]);

  for (const link of (attached ?? []) as { id: string; evidence_type: string; evidence_id: string }[]) {
    const contract = link.evidence_type === "survey" ? SURVEY_CONTRACT : DOCUMENT_CONTRACT;

    if (requirements.length === 0) {
      unmapped.push({
        evidenceType: link.evidence_type, evidenceId: link.evidence_id,
        reason: "The project has no approved Research Design, so there is nothing to assign this evidence to.",
      });
      continue;
    }

    const { assigned, unassigned } = assignSource({ fulfils: contract.fulfils, requirements });
    if (assigned.length === 0) {
      unmapped.push({
        evidenceType: link.evidence_type, evidenceId: link.evidence_id,
        reason: unassigned[0]?.reason ?? "The approved design commissioned no questions this source can answer.",
      });
      continue;
    }

    const items = link.evidence_type === "survey"
      ? await surveyItems(link.evidence_id)
      : await documentItems(link.id);

    if (items.length === 0) {
      unmapped.push({
        evidenceType: link.evidence_type, evidenceId: link.evidence_id,
        reason: link.evidence_type === "survey"
          ? "This survey has no responses yet, or too few to read anything off."
          : "This document has no approved Document Intelligence yet.",
      });
      continue;
    }

    for (const { need } of assigned) {
      const entry = itemsByNeed.get(need.id) ?? { need, items: [] };
      for (const item of items) {
        // Assigned, not yet judged. The design commissioned this source to answer
        // this question; nothing has yet judged how far THIS item does so, and a
        // number invented here would be the one genuinely dishonest option.
        entry.items.push({ ...item, methodFit: need.method_fit, bearing: null });
      }
      itemsByNeed.set(need.id, entry);
    }
  }

  return {
    gathered: [...itemsByNeed.values()].map(({ need, items }) => ({
      need,
      frame: frameEvidence({ needId: need.id, items }),
    })),
    unmapped,
  };
}
