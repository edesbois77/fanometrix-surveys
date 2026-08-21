// Shared read helper for the Studio campaign API routes: the presentation-ready
// campaign list (with publisher names) that the Campaigns/Deploy client consumes.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CAMPAIGN_ORIGIN } from "@/lib/campaign-groups/model";
import { STUDIO_SLUG_PREFIX } from "@/lib/studio/campaign-generation";

export async function orgNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabaseAdmin.from("organisations").select("id, name").in("id", unique);
  return Object.fromEntries((data ?? []).map((o) => [o.id as string, o.name as string]));
}

/** This survey's active Studio campaigns, ordered and enriched with publisher name. */
export async function listStudioCampaigns(surveyId: string) {
  const { data } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, campaign_name, survey_id, publisher_org_id, market, country_code, survey_language, creative_design, status, target_responses, target_mode, start_date, end_date, updated_at, status_updated_at")
    .eq("survey_id", surveyId).eq("origin", CAMPAIGN_ORIGIN.studio).is("deleted_at", null)
    .order("publisher_org_id", { ascending: true }).order("market", { ascending: true }).order("survey_language", { ascending: true });
  const rows = data ?? [];
  const names = await orgNames(rows.map((r) => r.publisher_org_id as string));
  return rows.map((r) => ({ ...r, publisher_name: names[r.publisher_org_id as string] ?? "Publisher" }));
}
