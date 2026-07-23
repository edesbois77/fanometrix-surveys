// Strategy → News Coverage tasks. The sibling of
// generate-searches-from-design.ts, reusing the same plan / skip / upsert
// contract, exactly as that file anticipated when the other methods became
// executable. The Research Design and the Evidence Strategy are UNCHANGED: this
// reads the approved design and derives the work, it does not add fields to it,
// and it never asks the design to be regenerated.
//
// WHERE THE ANCHOR COMES FROM, and why it is not invented:
//   direct       the project's own brand organisation. A recorded fact about the
//                engagement, not a name parsed out of prose.
//   comparative  a comparator the design DECLARED and justified. Same grounding
//                rule as conversation: an undeclared comparator cannot be
//                researched, so no comparator means no comparative task.
//   strategic    no entity anchor. Strategic coverage is judged on whether it
//                materially addresses sponsorship practice, so requiring a brand
//                would be wrong.
//
// The retrieval terms around that anchor (context entities, aliases, exclusions)
// are compiled by the existing Search Strategist from the requirement's own
// words. The ANCHOR IS THEN OVERWRITTEN with the grounded value above, so the
// strategist can enrich a task but can never change what it is about.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { IntelligenceError } from "@/lib/intelligence/types";
import { analyseSearchStrategy } from "@/lib/intelligence/analysts/analyseSearchStrategy";
import {
  type ResearchDesign, type EvidenceRequirement, isApproved, collectionWindowFields,
} from "@/lib/research-design";
import type { EvidenceRole } from "@/lib/evidence-role";
import { withNeedIds, needIdFor, asMethodFit, type InformationNeeds } from "@/lib/information-needs";
import { emptyStrategy } from "@/lib/search-strategy";
import { NEWS_PLATFORM, planNewsTasks, newsOriginKey, type SkippedNewsTask } from "@/lib/news-task";
import { DEFAULT_NEWS_PACKS } from "@/lib/news-sources";

export type GeneratedNewsTask = { id: string; name: string; role: EvidenceRole; action: "created" | "updated" };
export type NewsGenerationResult = { generated: GeneratedNewsTask[]; skipped: SkippedNewsTask[] };

// Same rule as conversation: evidence the design already expects to be scarce is
// judged HARDER, so the little that survives is genuinely usable.
const THRESHOLD_BY_AVAILABILITY: Record<string, number> = { high: 60, moderate: 60, low: 70, none: 70 };

/** The Information Needs the classifier already consumes, built from the
 *  requirement so news evidence is judged against the SAME needs and lands on the
 *  SAME research aspect Analysis groups by. */
function informationNeedsFor(req: EvidenceRequirement): InformationNeeds | null {
  if (!req.information_needs.length) return null;
  // News gets news's verdict, not conversation's and not a hardcoded "primary".
  // A requirement where the design judged news merely supporting must not have
  // its articles judged as though news were the primary method for it.
  const recommendation = req.evidence_strategy?.recommended_methods?.find(m => m.method === "news");
  const aspect = req.aspect ?? "General";
  return withNeedIds({
    themes: [{
      aspect,
      description: req.requirement,
      needs: req.information_needs.map(need => ({
        id: needIdFor(aspect, need),
        need,
        method_fit: asMethodFit(recommendation?.fit),
        rationale: recommendation?.rationale?.trim() || "Stated by the approved Evidence Strategy.",
      })),
    }],
  });
}

/** The project's brand name — the grounded subject for direct coverage. */
export async function projectSubjectName(projectId: string): Promise<string | null> {
  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("brand_org_id").eq("id", projectId).maybeSingle<{ brand_org_id: string | null }>();
  if (!proj?.brand_org_id) return null;
  const { data: org } = await supabaseAdmin
    .from("organisations").select("name").eq("id", proj.brand_org_id).maybeSingle<{ name: string }>();
  return org?.name?.trim() || null;
}

export async function generateNewsTasksFromDesign(
  projectId: string,
  design: ResearchDesign,
  createdBy: string,
): Promise<NewsGenerationResult> {
  if (!isApproved(design)) {
    throw new IntelligenceError(409, "Approve the Evidence Strategy before generating News Coverage tasks.");
  }

  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("research_mode, research_question").eq("id", projectId)
    .maybeSingle<{ research_mode: string | null; research_question: string | null }>();
  if (!proj) throw new IntelligenceError(404, "Project not found.");
  const isSimulated = proj.research_mode === "simulated";

  const subject = await projectSubjectName(projectId);
  const { planned, skipped } = planNewsTasks(design, subject);
  const generated: GeneratedNewsTask[] = [];

  // The period the strategy commissioned. "1y" is the fallback this generator
  // used before windows existed, kept so designs without one behave unchanged.
  const window = collectionWindowFields(design, "1y");

  // Existing generated tasks for this project, keyed by origin, so a
  // re-generation updates rather than duplicates.
  const { data: linkRows } = await supabaseAdmin
    .from("research_project_evidence")
    .select("evidence_id")
    .eq("research_project_id", projectId)
    .eq("evidence_type", "social_search");
  const linkedIds = (linkRows ?? []).map(r => r.evidence_id as string).filter(Boolean);

  const existingByOrigin = new Map<string, string>();
  if (linkedIds.length) {
    const { data: existing } = await supabaseAdmin
      .from("social_searches").select("id, search_strategy").in("id", linkedIds);
    for (const row of existing ?? []) {
      const key = (row.search_strategy as { design_origin?: { origin_key?: string } } | null)?.design_origin?.origin_key;
      if (key) existingByOrigin.set(key, row.id as string);
    }
  }

  for (const plan of planned) {
    const req = plan.requirement;
    const key = newsOriginKey(plan);

    // Compile the retrieval terms from the requirement's own words. A failure
    // here is not fatal: the task is still created with the grounded anchor and
    // the requirement's terms, and remains fully editable.
    let compiled = emptyStrategy();
    try {
      compiled = await analyseSearchStrategy({
        researchQuestion: `${req.requirement} ${req.why_it_matters}`.trim(),
        keywords: [
          ...(plan.anchor ? [plan.anchor] : []),
          ...req.information_needs.slice(0, 4),
        ],
        entityType: plan.role === "strategic" ? "Topic" : "Brand",
        markets: [], languages: [],
      });
    } catch {
      // Fall through with an empty strategy; the anchor below still applies.
    }

    // THE ANCHOR IS AUTHORITATIVE. Whatever the strategist proposed as the
    // primary entity is replaced by the grounded value, so an invented subject
    // or an undeclared comparator can never become what a task is about.
    const strategy = {
      ...compiled,
      primary_entity: plan.anchor
        ? { term: plan.anchor, type: "Brand", aliases: (compiled.primary_entity?.term?.toLowerCase() === plan.anchor.toLowerCase() ? compiled.primary_entity.aliases : []) }
        : null,
      breadth: "balanced" as const,
      languages: ["en"],
      markets: [],
      medium: "news" as const,
      design_origin: {
        origin_key: key,
        requirement_index: plan.requirement_index,
        role: req.role,
        aspect: req.aspect,
        requirement: req.requirement,
      },
      generated_at: new Date().toISOString(),
      edited: false,
    };

    const fields = {
      name: plan.name,
      description: plan.intent,
      evidence_role: req.role,
      entity_type: req.role === "strategic" ? "Topic" : "Brand",
      markets: [] as string[],
      platforms: [NEWS_PLATFORM],
      languages: ["en"],
      ...window,
      relevance_threshold: THRESHOLD_BY_AVAILABILITY[req.expected_availability] ?? 60,
      information_needs: informationNeedsFor(req),
      search_strategy: strategy,
      connector_config: { news: { feed_packs: DEFAULT_NEWS_PACKS, use_search_index: 1 } },
    };

    const existingId = existingByOrigin.get(key);
    if (existingId) {
      const { error } = await supabaseAdmin.from("social_searches").update(fields).eq("id", existingId);
      if (error) { skipped.push({ name: plan.name, reason: error.message }); continue; }
      generated.push({ id: existingId, name: plan.name, role: req.role, action: "updated" });
      continue;
    }

    const { data: created, error } = await supabaseAdmin
      .from("social_searches")
      .insert({ ...fields, status: "Draft", review_status: "draft", is_simulated: isSimulated, created_by: createdBy })
      .select("id").single();
    if (error || !created) { skipped.push({ name: plan.name, reason: error?.message ?? "Could not create the task." }); continue; }

    const { error: linkErr } = await supabaseAdmin.from("research_project_evidence").insert({
      research_project_id: projectId, evidence_type: "social_search",
      evidence_id: created.id, added_by: createdBy, is_simulated: isSimulated,
    });
    if (linkErr) {
      // Never leave an orphan: unattached evidence is invisible to Analysis AND
      // breaks idempotency, because reconciliation reads through the link.
      await supabaseAdmin.from("social_searches").delete().eq("id", created.id);
      skipped.push({ name: plan.name, reason: `Could not attach to the project: ${linkErr.message}` });
      continue;
    }

    // Seed keywords so the existing search UI and the connector's fallback path
    // both see the task's terms.
    const keywords = Array.from(new Set([
      ...(plan.anchor ? [plan.anchor] : []),
      ...strategy.context_entities.map(e => e.term),
      ...strategy.synonyms,
    ].map(k => k.trim()).filter(Boolean))).slice(0, 24);
    if (keywords.length) {
      await supabaseAdmin.from("social_keywords").insert(
        keywords.map(k => ({ search_id: created.id, keyword: k, keyword_type: "Topic" })),
      );
    }

    generated.push({ id: created.id as string, name: plan.name, role: req.role, action: "created" });
  }

  return { generated, skipped };
}
