// Shared by the Campaign Groups create (POST) and edit (PUT) routes.
// A project-scoped Campaign Group (research_project_id set) may only ever
// contain campaigns belonging to that exact same research_project_id —
// campaigns with no project, or a different project, are rejected rather
// than silently admitted, since a group's whole purpose is bundling
// campaigns behind one embed and mixing clients/projects there would leak
// one client's inventory into another's rotation. See migration 096.
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function validateMembersBelongToProject(
  campaignIds: string[],
  researchProjectId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (campaignIds.length === 0) return { ok: true };

  const { data: campaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, research_project_id")
    .in("id", campaignIds);

  const foundIds = new Set((campaigns ?? []).map(c => c.id));
  const missing = campaignIds.filter(id => !foundIds.has(id));
  const offending = (campaigns ?? []).filter(c => c.research_project_id !== researchProjectId);

  if (offending.length === 0 && missing.length === 0) return { ok: true };

  const reasons = [
    ...offending.map(c => `${c.campaign_id} (${c.research_project_id ? "different Research Project" : "no Research Project"})`),
    ...missing.map(id => `${id} (not found)`),
  ];

  return {
    ok: false,
    error: `Cannot save — every campaign in a Campaign Group must belong to the same Research Project as the group. The following don't: ${reasons.join(", ")}.`,
  };
}
