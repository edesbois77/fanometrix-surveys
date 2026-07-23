// Phase 3 — Strategy → Search Generation.
//
// An APPROVED Evidence Strategy creates the Conversation Intelligence searches it
// calls for, with no manual search authoring. Searches are an implementation
// detail of an approved design, so everything they need is inherited from the
// requirement that asked for them: evidence role, comparator anchor, research
// aspect, information needs, markets, languages, platforms and rationale.
//
// DETERMINISTIC AND TRACEABLE. Each generated search records a design_origin
// inside its search_strategy naming the requirement that produced it, so
// re-generating after a strategy update UPDATES the matching search instead of
// creating a duplicate, and any search can be traced back to the reasoning that
// commissioned it. Generated searches remain fully editable afterwards.
//
// This module is the SINGLE place a design becomes work. When Survey Research,
// Research Library or Trend Analysis become executable, they add a sibling
// generator here and reuse the same plan/skip/upsert contract; nothing about the
// Research Design changes.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { IntelligenceError } from "@/lib/intelligence/types";
import {
  type ResearchDesign, type ProposedSearchPlan, type EvidenceRequirement,
  proposedConversationSearches, isApproved, collectionWindowFields,
} from "@/lib/research-design";
import type { EvidenceRole } from "@/lib/evidence-role";
import { withNeedIds, needIdFor, asMethodFit, type InformationNeeds } from "@/lib/information-needs";

export type GeneratedSearch = { id: string; name: string; role: EvidenceRole; action: "created" | "updated" };
export type SkippedSearch = { name: string; reason: string };
export type GenerationResult = { generated: GeneratedSearch[]; skipped: SkippedSearch[] };

// Scarce evidence needs a HIGHER bar, not a lower one: the FedEx work showed 0.5
// admits speculative matches. Anything the design already expects to be thin is
// judged harder so the little that survives is genuinely usable.
const THRESHOLD_BY_AVAILABILITY: Record<string, number> = { high: 60, moderate: 60, low: 70, none: 70 };

// A stable identity for a generated search: the requirement that asked for it,
// plus its anchor (or name for unanchored strategic searches).
function originKey(plan: ProposedSearchPlan): string {
  const anchor = plan.search.primary_entity?.trim().toLowerCase();
  return `${plan.requirement_index}:${anchor || plan.search.name.trim().toLowerCase()}`;
}

type DesignOrigin = { origin_key: string; requirement_index: number; role: EvidenceRole; aspect: string | null; requirement: string };

/** The Information Needs shape the classifier already consumes, built from the
 *  requirement so collected evidence is judged against the SAME needs the design
 *  stated and lands on the SAME research aspect Analysis groups by. */
function informationNeedsFor(
  plan: ProposedSearchPlan, requirementText: string, req: EvidenceRequirement,
): InformationNeeds | null {
  if (!plan.information_needs.length) return null;
  // The design already decided what conversation can do for this requirement.
  // Hardcoding "primary" here threw that verdict away and handed the classifier
  // an undifferentiated list, which is the mechanism behind the failure in
  // docs/evidence-contribution.md §1.
  const recommendation = req.evidence_strategy?.recommended_methods?.find(m => m.method === "conversation");
  const aspect = plan.aspect ?? "General";
  return withNeedIds({
    themes: [{
      aspect,
      description: requirementText,
      needs: plan.information_needs.map(need => ({
        id: needIdFor(aspect, need),
        need,
        method_fit: asMethodFit(recommendation?.fit),
        rationale: recommendation?.rationale?.trim() || "Stated by the approved Evidence Strategy.",
      })),
    }],
  });
}

export async function generateSearchesFromDesign(
  projectId: string,
  design: ResearchDesign,
  createdBy: string,
): Promise<GenerationResult> {
  if (!isApproved(design)) {
    throw new IntelligenceError(409, "Approve the Evidence Strategy before generating searches.");
  }

  // Generated evidence must match the project's provenance: the evidence link is
  // guarded by a database trigger, so a real search cannot attach to a simulated
  // project (or vice versa).
  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("research_mode").eq("id", projectId).maybeSingle<{ research_mode: string | null }>();
  if (!proj) throw new IntelligenceError(404, "Project not found.");
  const isSimulated = proj.research_mode === "simulated";

  const plans = proposedConversationSearches(design);
  const generated: GeneratedSearch[] = [];
  const skipped: SkippedSearch[] = [];

  // The period the strategy commissioned. Resolved once for the whole run so
  // every search created here collects over the same window. No fallback: a
  // design without a window leaves these columns untouched, exactly as before.
  const window = collectionWindowFields(design);

  // Existing generated searches for this project, keyed by origin, so a
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
      const key = (row.search_strategy as { design_origin?: DesignOrigin } | null)?.design_origin?.origin_key;
      if (key) existingByOrigin.set(key, row.id as string);
    }
  }

  for (const plan of plans) {
    const req = design.requirements[plan.requirement_index];
    const s = plan.search;
    if (!req) { skipped.push({ name: s.name, reason: "No matching requirement in the design." }); continue; }

    // Only generate where CONVERSATION is a recommended method for this
    // requirement. If the design leads with Survey Research, the Research Library
    // or Trend Analysis, no conversation search is created for it.
    const conv = req.evidence_strategy.recommended_methods.find(m => m.method === "conversation");
    if (!conv) { skipped.push({ name: s.name, reason: "Conversation Intelligence is not a recommended method for this requirement." }); continue; }
    if (conv.fit === "not_suitable") { skipped.push({ name: s.name, reason: "Conversation Intelligence was judged not suitable for this requirement." }); continue; }

    // Respect the design's own honesty about availability.
    if (req.expected_availability === "none") { skipped.push({ name: s.name, reason: "The design expects no evidence to exist for this requirement." }); continue; }

    // Direct and comparative relevance tests judge against a named subject.
    if (req.role !== "strategic" && !s.primary_entity) {
      skipped.push({ name: s.name, reason: "No anchor entity, so its relevance test would have nothing to judge against." }); continue;
    }

    // Comparators must be GROUNDED: a comparative search may only anchor on a
    // comparator the design actually declared and justified. This is what stops
    // invented comparators and generic sponsorship searches.
    if (req.role === "comparative") {
      const declared = req.evidence_strategy.comparators.map(c => c.name.trim().toLowerCase());
      const anchor = s.primary_entity!.trim().toLowerCase();
      if (!declared.includes(anchor)) {
        skipped.push({ name: s.name, reason: `"${s.primary_entity}" is not a declared comparator for this requirement.` }); continue;
      }
    }

    const origin: DesignOrigin = {
      origin_key: originKey(plan),
      requirement_index: plan.requirement_index,
      role: req.role,
      aspect: req.aspect,
      requirement: req.requirement,
    };

    const fields = {
      name: s.name,
      description: s.intent,
      evidence_role: req.role,
      entity_type: req.role === "strategic" ? "Topic" : "Brand",
      markets: s.markets,
      platforms: s.platforms,
      languages: s.languages,
      ...window,
      relevance_threshold: THRESHOLD_BY_AVAILABILITY[req.expected_availability] ?? 60,
      information_needs: informationNeedsFor(plan, req.requirement, req),
      search_strategy: {
        primary_entity: s.primary_entity
          ? { term: s.primary_entity, type: req.role === "comparative" ? "Brand" : "Brand", aliases: [] }
          : null,
        context_entities: [],
        synonyms: s.keywords,
        campaigns: [],
        exclusions: [],
        breadth: "balanced",
        languages: s.languages,
        markets: s.markets,
        connector_hints: {},
        generated_at: new Date().toISOString(),
        edited: false,
        design_origin: origin,
      },
    };

    const existingId = existingByOrigin.get(origin.origin_key);
    if (existingId) {
      const { error } = await supabaseAdmin.from("social_searches").update(fields).eq("id", existingId);
      if (error) { skipped.push({ name: s.name, reason: error.message }); continue; }
      generated.push({ id: existingId, name: s.name, role: req.role, action: "updated" });
      continue;
    }

    const { data: created, error } = await supabaseAdmin
      .from("social_searches")
      .insert({ ...fields, status: "Draft", review_status: "draft", is_simulated: isSimulated, created_by: createdBy })
      .select("id").single();
    if (error || !created) { skipped.push({ name: s.name, reason: error?.message ?? "Could not create the search." }); continue; }

    // Attach to the project, otherwise Analysis can never see the evidence AND a
    // re-generation cannot find this search, so it would duplicate. If the link
    // fails the search is removed rather than left orphaned and invisible.
    const { error: linkErr } = await supabaseAdmin.from("research_project_evidence").insert({
      research_project_id: projectId, evidence_type: "social_search",
      evidence_id: created.id, added_by: createdBy, is_simulated: isSimulated,
    });
    if (linkErr) {
      await supabaseAdmin.from("social_searches").delete().eq("id", created.id);
      skipped.push({ name: s.name, reason: `Could not attach to the project: ${linkErr.message}` });
      continue;
    }

    // Seed keywords so the existing search UI and connectors see them.
    if (s.keywords.length) {
      await supabaseAdmin.from("social_keywords").insert(
        s.keywords.map(k => ({ search_id: created.id, keyword: k, keyword_type: "Topic" })),
      );
    }

    generated.push({ id: created.id as string, name: s.name, role: req.role, action: "created" });
  }

  return { generated, skipped };
}
