import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The social_searches ids attached to a Research Project as evidence
 * (evidence_type = 'social_search'). For a social-search evidence row the
 * evidence_id IS the social_searches.id, which is also social_mentions.search_id
 * — so these ids scope the existing conversation aggregation (stats/reports) to
 * one project without changing that aggregation logic.
 */
export async function getProjectSocialSearchIds(projectId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("research_project_evidence")
    .select("evidence_id")
    .eq("research_project_id", projectId)
    .eq("evidence_type", "social_search");
  return (data ?? []).map(r => r.evidence_id as string).filter(Boolean);
}

/**
 * The Evidence Validation gate (docs/evidence-validation-blueprint.md): the
 * project's conversation searches whose evidence is APPROVED and therefore feeds
 * Analysis and Reports. Approved OR Archived counts — Archive freezes collection
 * but preserves the prior approval. Every project-scoped read that feeds
 * interpretation (aspect synthesis, key findings, reports) uses THIS, not
 * getProjectSocialSearchIds; Dashboard monitoring stays ungated and uses the
 * unfiltered list. Individual conversations are additionally gated by
 * `excluded = false` on the mention query.
 */
export async function getApprovedProjectSocialSearchIds(projectId: string): Promise<string[]> {
  const ids = await getProjectSocialSearchIds(projectId);
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("social_searches")
    .select("id")
    .in("id", ids)
    .in("review_status", ["approved", "archived"]);
  return (data ?? []).map(r => r.id as string);
}

/**
 * The Research Question a conversation search's evidence is judged against —
 * the project's research_question, found via the evidence link. Used as the
 * fallback anchor for relevance classification when the search carries no
 * question of its own (its own `description` is preferred when present).
 */
export async function getProjectResearchQuestionForSearch(searchId: string): Promise<string | null> {
  const { data: link } = await supabaseAdmin
    .from("research_project_evidence")
    .select("research_project_id")
    .eq("evidence_id", searchId)
    .eq("evidence_type", "social_search")
    .limit(1)
    .maybeSingle();
  if (!link?.research_project_id) return null;
  const { data: proj } = await supabaseAdmin
    .from("research_projects")
    .select("research_question")
    .eq("id", link.research_project_id)
    .maybeSingle();
  const q = (proj?.research_question as string | null)?.trim();
  return q || null;
}
