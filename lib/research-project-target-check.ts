// Research Target auto-transition — deliberately NOT computed inside a GET
// route (reading data must never mutate it). Called from the write path
// instead: a response is submitted (app/api/submit/route.ts) → the
// campaign's own survey's target is checked here → that survey's own
// campaigns are paused/closed if crossed. Idempotent via
// research_project_evidence.target_reached_at, so it's cheap to call on
// every submission for a project-linked campaign.
//
// Survey-scoped since migration 094 — Research Target lives on the survey's
// own research_project_evidence row, not on research_projects, because a
// project can have multiple attached surveys each with their own target.
// Only that survey's own campaigns are ever paused/closed here, never every
// campaign in the project — a different survey reaching (or not reaching)
// its own target is unaffected.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logActivity } from "@/lib/research-project-activity";

export async function checkResearchTargetReached(campaignId: string): Promise<void> {
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, research_project_id, survey_id")
    .eq("id", campaignId)
    .single();

  if (!campaign?.research_project_id) return;

  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("survey_id")
    .eq("id", campaign.research_project_id)
    .single();

  // Same inheritance every other effective_survey_id resolution in the
  // codebase already uses: a campaign's own override, falling back to the
  // project's legacy primary-survey pointer.
  const effectiveSurveyId = campaign.survey_id ?? project?.survey_id ?? null;
  if (!effectiveSurveyId) return;

  const { data: evidenceRow } = await supabaseAdmin
    .from("research_project_evidence")
    .select("target_responses, target_reached_action, target_reached_at")
    .eq("research_project_id", campaign.research_project_id)
    .eq("evidence_type", "survey")
    .eq("evidence_id", effectiveSurveyId)
    .maybeSingle();

  if (
    !evidenceRow ||
    !evidenceRow.target_responses ||
    !evidenceRow.target_reached_action ||
    evidenceRow.target_reached_action === "none" ||
    evidenceRow.target_reached_at
  ) {
    return;
  }

  const { data: stats } = await supabaseAdmin
    .from("vw_survey_stats")
    .select("response_count")
    .eq("id", effectiveSurveyId)
    .maybeSingle();

  const total = Number(stats?.response_count ?? 0);
  if (total < evidenceRow.target_responses) return;

  // Every campaign in the project that resolves to this same survey —
  // never the whole project's campaigns, which may deploy other surveys.
  const { data: projectCampaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id, survey_id, status")
    .eq("research_project_id", campaign.research_project_id)
    .is("deleted_at", null)
    .not("status", "in", "(draft,archived)");

  const ids = (projectCampaigns ?? [])
    .filter(c => (c.survey_id ?? project?.survey_id ?? null) === effectiveSurveyId)
    .map(c => c.id);

  const now = new Date().toISOString();
  const action = evidenceRow.target_reached_action as "pause" | "close";
  const newStatus = action === "close" ? "closed" : "paused";

  if (ids.length > 0) {
    await supabaseAdmin
      .from("campaigns")
      .update({
        status: newStatus,
        status_updated_at: now,
        manual_status_override: newStatus === "paused" ? "paused" : null,
      })
      .in("id", ids);
  }

  await supabaseAdmin
    .from("research_project_evidence")
    .update({ target_reached_at: now })
    .eq("research_project_id", campaign.research_project_id)
    .eq("evidence_type", "survey")
    .eq("evidence_id", effectiveSurveyId);

  await logActivity(
    campaign.research_project_id,
    "project_updated",
    `Research target reached, ${ids.length} campaign(s) ${newStatus} automatically.`
  );
}
