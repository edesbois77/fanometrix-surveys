// P0 Supabase exposure remediation — public survey-serving binding.
//
// Before this module, /api/embed/survey?id=<uuid> and
// /api/embed/survey-labels?survey_id=<uuid> returned the full question and
// option text of ANY survey to ANY caller. A survey UUID is not a secret: it
// appears in embed configuration and in every log line of an embed request, so
// holding one was enough to read a client's research instrument, including
// drafts that had never been deployed.
//
// Revoking the permissive anon RLS policy on `surveys` does NOT close that hole
// — the route simply asks with a stronger credential. The binding therefore has
// to live here, in the route's own logic.
//
// Rule: a survey may be served anonymously only when at least one campaign that
// has been DEPLOYED (any stored status other than 'draft') and is not
// soft-deleted binds to it, either directly (campaigns.survey_id) or by
// inheritance from its Research Project (research_projects.survey_id — the same
// resolution /api/embed/campaign already performs).
//
// This is deliberately permissive about lifecycle: a paused, closed or archived
// campaign still counts, because its survey was legitimately public and the
// dashboard resolves labels for historical evidence. What it excludes is the
// case that matters — a survey no campaign has ever deployed.
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Stored campaign statuses that mean "this campaign has been deployed at least
 *  once". Only 'draft' is excluded — see the module note on why the rest count. */
export const DEPLOYED_CAMPAIGN_STATUSES = [
  "scheduled",
  "live",
  "paused",
  "closed",
  "archived",
] as const;

/** Resolve the research projects whose inherited survey is `surveyId`. */
async function projectIdsForSurvey(surveyId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("research_projects")
    .select("id")
    .eq("survey_id", surveyId);
  return (data ?? []).map(r => r.id as string);
}

/**
 * True when `surveyId` is reachable from at least one deployed, non-deleted
 * campaign. Fails CLOSED: any error, or an absent/blank id, returns false.
 */
export async function isSurveyPubliclyServeable(surveyId: string | null | undefined): Promise<boolean> {
  if (!surveyId) return false;

  // Direct binding: campaigns.survey_id
  const { data: direct, error: directError } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .eq("survey_id", surveyId)
    .is("deleted_at", null)
    .in("status", DEPLOYED_CAMPAIGN_STATUSES as unknown as string[])
    .limit(1);
  if (directError) return false;          // fail closed
  if ((direct ?? []).length > 0) return true;

  // Inherited binding: campaign → research_project → survey_id
  const projectIds = await projectIdsForSurvey(surveyId);
  if (projectIds.length === 0) return false;

  const { data: inherited, error: inheritedError } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .in("research_project_id", projectIds)
    .is("survey_id", null)
    .is("deleted_at", null)
    .in("status", DEPLOYED_CAMPAIGN_STATUSES as unknown as string[])
    .limit(1);
  if (inheritedError) return false;       // fail closed
  return (inherited ?? []).length > 0;
}
