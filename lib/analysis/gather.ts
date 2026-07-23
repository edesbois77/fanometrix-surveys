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
  CONVERSATION_CONTRACT, NEWS_CONTRACT, resolve,
} from "@/lib/analysis/source-contract";

/** One row as Collection stores it, reduced to what a contract needs. Named
 *  structurally rather than after a table, so the pure mapping below does not
 *  depend on storage. */
export type CollectedRow = {
  id: string;
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
      .select("id, search_id, content_kind, author, platform, market, evidence_role, relevance_score, published_at, metadata")
      .in("search_id", mappedSearchIds)
      .eq("excluded", false)
      .not("relevance_score", "is", null)
      .limit(5000);

    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const searchId = (r.search_id as string | null) ?? "";
      const meta = (r.metadata ?? {}) as { publisher?: unknown; syndication_key?: unknown; news?: { source_type?: unknown } };
      const row: CollectedRow = {
        id: r.id as string,
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

  // Sources attached to the project that this increment cannot map to a need.
  // Surveys and documents attach to the PROJECT rather than to a need, so their
  // mapping has to come from the approved design's method assignment. Naming them
  // is honest; guessing a mapping would not be.
  const { data: attached } = await supabaseAdmin
    .from("research_project_evidence")
    .select("evidence_type, evidence_id")
    .eq("research_project_id", projectId)
    .in("evidence_type", ["survey", "document"]);
  for (const row of (attached ?? []) as { evidence_type: string; evidence_id: string }[]) {
    unmapped.push({
      evidenceType: row.evidence_type, evidenceId: row.evidence_id,
      reason: "Attached to the project rather than to a question. Mapping it needs the approved design's method assignment.",
    });
  }

  return {
    gathered: [...itemsByNeed.values()].map(({ need, items }) => ({
      need,
      frame: frameEvidence({ needId: need.id, items }),
    })),
    unmapped,
  };
}
