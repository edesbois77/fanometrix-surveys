// Hard-deletes a simulated Research Project and everything under it.
// Cascade alone is NOT sufficient: research_project_evidence,
// evidence_simulations, and research_project_activity all cascade from
// research_projects correctly, but campaigns.research_project_id is
// ON DELETE SET NULL (migration 043, predates this work) — a plain
// DELETE on research_projects would silently orphan the campaign
// instead of removing it. surveys/social_searches have no FK to
// research_projects at all (only linked indirectly via
// research_project_evidence), so their ids must be gathered before
// anything is deleted, not derived afterward.
//
// Order matters: children before the parent, and the durable audit log
// (migration 085) is written FIRST — before any cascade can destroy the
// research_project_activity trail that would otherwise be the only
// record this ever happened.
import { supabaseAdmin } from "@/lib/supabase-admin";

export type DeleteSimulatedProjectResult = { rowCounts: Record<string, number> };

export async function deleteSimulatedProject(projectId: string, actor: string): Promise<DeleteSimulatedProjectResult> {
  const { data: project, error: projectErr } = await supabaseAdmin
    .from("research_projects")
    .select("id, project_name, research_mode")
    .eq("id", projectId)
    .single();
  if (projectErr || !project) throw new Error("Research project not found");
  if (project.research_mode !== "simulated") throw new Error("Not a simulated project, refuse to hard-delete");

  // campaign_groups.research_project_id is ON DELETE RESTRICT (migration
  // 096) precisely so a live Campaign Group can never be silently
  // demoted to unscoped or orphaned by a project disappearing under it —
  // the DB would refuse the delete below anyway, but checking here first
  // lets us fail with a message naming the actual groups instead of a raw
  // FK-violation error, and lets every other row (evidence, campaigns,
  // surveys, audit log) stay untouched rather than partially deleted.
  const { data: blockingGroups } = await supabaseAdmin
    .from("campaign_groups")
    .select("name, group_id")
    .eq("research_project_id", projectId);
  if (blockingGroups?.length) {
    const names = blockingGroups.map(g => `"${g.name}" (${g.group_id})`).join(", ");
    throw new Error(
      `Cannot delete this Product Walkthrough — it still has ${blockingGroups.length} Campaign Group(s) assigned to it: ${names}. Archive, delete, or reassign them to a different Research Project first.`
    );
  }

  const [{ data: evidenceSims }, { data: evidenceRows }, { data: campaigns }] = await Promise.all([
    supabaseAdmin.from("evidence_simulations").select("id").eq("research_project_id", projectId),
    supabaseAdmin.from("research_project_evidence").select("evidence_type, evidence_id").eq("research_project_id", projectId),
    supabaseAdmin.from("campaigns").select("campaign_id").eq("research_project_id", projectId),
  ]);

  const evidenceSimIds = (evidenceSims ?? []).map(e => e.id);
  const surveyIds = (evidenceRows ?? []).filter(e => e.evidence_type === "survey").map(e => e.evidence_id);
  const searchIds = (evidenceRows ?? []).filter(e => e.evidence_type === "social_search").map(e => e.evidence_id);
  const campaignSlugs = (campaigns ?? []).map(c => c.campaign_id);

  const counts: Record<string, number> = {};
  const del = async (label: string, fn: () => Promise<{ count: number | null }>) => {
    const { count } = await fn();
    counts[label] = count ?? 0;
  };

  if (evidenceSimIds.length) {
    await del("responses", async () => supabaseAdmin.from("responses").delete({ count: "exact" }).in("evidence_simulation_id", evidenceSimIds));
    await del("social_mentions", async () => supabaseAdmin.from("social_mentions").delete({ count: "exact" }).in("evidence_simulation_id", evidenceSimIds));
  }

  // research_summaries has no FK to research_projects at all (polymorphic
  // source_type/source_id) — clean up explicitly for every source this
  // project could have generated a summary against, plus its own
  // Executive Report row (source_type='research_project').
  const summaryOrClauses: string[] = [`and(source_type.eq.research_project,source_id.eq.${projectId})`];
  if (surveyIds.length) summaryOrClauses.push(`and(source_type.eq.survey,source_id.in.(${surveyIds.join(",")}))`);
  if (searchIds.length) summaryOrClauses.push(`and(source_type.eq.conversation_search,source_id.in.(${searchIds.join(",")}))`);
  await del("research_summaries", async () => supabaseAdmin.from("research_summaries").delete({ count: "exact" }).or(summaryOrClauses.join(",")));

  if (campaignSlugs.length) {
    await del("campaigns", async () => supabaseAdmin.from("campaigns").delete({ count: "exact" }).in("campaign_id", campaignSlugs));
  }
  if (surveyIds.length) {
    await del("surveys", async () => supabaseAdmin.from("surveys").delete({ count: "exact" }).in("id", surveyIds));
  }
  if (searchIds.length) {
    await del("social_searches", async () => supabaseAdmin.from("social_searches").delete({ count: "exact" }).in("id", searchIds));
  }

  // Durable audit record — written before the cascade below can destroy
  // research_project_activity's own copy of this project's history.
  await supabaseAdmin.from("simulation_deletion_log").insert({
    research_project_id: projectId,
    project_name: project.project_name,
    research_mode: project.research_mode,
    actor,
    row_counts: counts,
  });

  // research_project_evidence, evidence_simulations, and
  // research_project_activity all cascade correctly from here.
  await supabaseAdmin.from("research_projects").delete().eq("id", projectId);

  return { rowCounts: counts };
}
