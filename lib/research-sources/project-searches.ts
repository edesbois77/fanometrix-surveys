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
