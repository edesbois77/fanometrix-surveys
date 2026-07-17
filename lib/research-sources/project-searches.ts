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
