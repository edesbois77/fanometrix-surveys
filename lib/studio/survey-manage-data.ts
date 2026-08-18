// ── Survey Studio — survey management data resolver (server, read-only) ──────
// The single truthful resolution of a survey's campaign universe + evidence,
// shared by the Manage → Survey detail endpoint AND the PUT research-definition
// lock, so every management surface agrees. It counts ALL non-deleted campaigns
// by survey_id (Studio-native AND legacy) — never the studio_-only projection —
// which is what makes the detail Campaigns section reconcile with the list count.
//
// It reads nothing beyond campaigns/stats/events; it performs NO mutation and
// NEVER touches Research Projects, Studies, ORE, or entitlement.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { STUDIO_SLUG_PREFIX } from "./campaign-generation";
import { computeStatusWithReason, type CampaignForStatus, type CampaignStatus } from "@/lib/campaign-status";
import type { CampaignRow, CampaignEvidence } from "./survey-deletion";

export type ManageCampaign = {
  /** campaigns.id — used only server-side; not exposed raw in the UI. */
  id: string;
  slug: string;
  name: string;
  status: CampaignStatus;          // effective status (computeStatusWithReason)
  storedStatus: string;            // persisted campaigns.status
  publisherOrgId: string | null;
  market: string;
  language: string;
  isStudio: boolean;               // Studio-native (studio_ slug) vs legacy
  hasData: boolean;                // any evidence on this campaign
  responses: number;
  targetResponses: number | null;
  lastResponseAt: string | null;
};

export type SurveyManageData = {
  campaigns: ManageCampaign[];
  hasLiveCampaign: boolean;        // any campaign effectively live
  hasEvidence: boolean;            // events / responses / answers anywhere
  responseCount: number;           // survey-level (vw_survey_stats)
  lastResponseAt: string | null;
  publisherCount: number;
  marketCount: number;
  // Pieces to feed the pure decideSurveyDeletion (kept identical to the DELETE path).
  deletionCampaigns: CampaignRow[];
  evidenceByCampaignId: Record<string, CampaignEvidence | undefined>;
  surveyResponseCount: number;
};

const LIVE: CampaignStatus = "live";

export async function resolveSurveyManageData(surveyId: string): Promise<SurveyManageData> {
  // Truthful universe: every non-deleted campaign for this survey, any slug/status.
  const { data: campRows } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, campaign_name, status, manual_status_override, start_date, end_date, target_responses, target_mode, archive_after_days, status_updated_at, publisher_org_id, market, country_code, survey_language")
    .eq("survey_id", surveyId)
    .is("deleted_at", null);
  const rows = campRows ?? [];
  const slugs = rows.map((c) => c.campaign_id as string).filter(Boolean);
  const uniqueSlugs = [...new Set(slugs)];

  // Per-campaign real-response stats (view excludes demo) for effective status.
  const { data: statRows } = uniqueSlugs.length
    ? await supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count, last_response_at").in("campaign_id", uniqueSlugs)
    : { data: [] as { campaign_id: string; response_count: number; last_response_at: string | null }[] };
  const statBySlug = new Map((statRows ?? []).map((s) => [s.campaign_id, s]));

  // Full evidence per distinct slug — events / responses / answers — the SAME
  // signals the deletion guard uses, so hasEvidence and deletable never diverge.
  const evidenceBySlug = new Map<string, CampaignEvidence>();
  await Promise.all(
    uniqueSlugs.map(async (slug) => {
      const [ev, resp, ans] = await Promise.all([
        supabaseAdmin.from("survey_events").select("id", { count: "exact", head: true }).eq("campaign_id", slug),
        supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).eq("campaign_id", slug).eq("is_demo", false),
        supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).eq("campaign_id", slug).eq("is_demo", false),
      ]);
      evidenceBySlug.set(slug, { events: ev.count ?? 0, responses: resp.count ?? 0, answers: ans.count ?? 0 });
    }),
  );

  // Survey-level responses + recency (belt-and-braces beyond slugs).
  const { data: surveyStat } = await supabaseAdmin
    .from("vw_survey_stats").select("response_count, last_response_at").eq("id", surveyId).maybeSingle();
  const surveyResponseCount = Number(surveyStat?.response_count ?? 0) || 0;

  const now = new Date();
  const campaigns: ManageCampaign[] = rows.map((c) => {
    const slug = c.campaign_id as string;
    const stat = statBySlug.get(slug);
    const responses = Number(stat?.response_count ?? 0) || 0;
    const ev = evidenceBySlug.get(slug);
    const effective = computeStatusWithReason(c as unknown as CampaignForStatus, responses, now).effective;
    return {
      id: c.id as string,
      slug,
      name: (c.campaign_name as string) ?? slug,
      status: effective,
      storedStatus: (c.status as string) ?? "",
      publisherOrgId: (c.publisher_org_id as string | null) ?? null,
      market: (c.market as string) ?? (c.country_code as string) ?? "",
      language: (c.survey_language as string) ?? "",
      isStudio: String(slug || "").startsWith(STUDIO_SLUG_PREFIX),
      hasData: !!ev && (ev.events > 0 || ev.responses > 0 || ev.answers > 0),
      responses,
      targetResponses: c.target_responses == null ? null : Number(c.target_responses),
      lastResponseAt: (stat?.last_response_at as string | null) ?? null,
    };
  });

  const hasLiveCampaign = campaigns.some((c) => c.status === LIVE);
  const anyCampaignEvidence = [...evidenceBySlug.values()].some((e) => e.events > 0 || e.responses > 0 || e.answers > 0);
  const hasEvidence = surveyResponseCount > 0 || anyCampaignEvidence;

  const publisherCount = new Set(campaigns.map((c) => c.publisherOrgId).filter(Boolean)).size;
  const marketCount = new Set(campaigns.map((c) => c.market).filter(Boolean)).size;
  const lastResponseAt =
    campaigns.map((c) => c.lastResponseAt).filter((x): x is string => !!x).sort((a, b) => b.localeCompare(a))[0] ??
    (surveyStat?.last_response_at as string | null) ??
    null;

  const evidenceByCampaignId: Record<string, CampaignEvidence | undefined> = {};
  const deletionCampaigns: CampaignRow[] = rows.map((c) => {
    const row: CampaignRow = { id: c.id as string, campaign_id: (c.campaign_id as string | null) ?? null, status: (c.status as string | null) ?? null };
    if (row.campaign_id) evidenceByCampaignId[row.id] = evidenceBySlug.get(row.campaign_id);
    return row;
  });

  return {
    campaigns,
    hasLiveCampaign,
    hasEvidence,
    responseCount: surveyResponseCount,
    lastResponseAt,
    publisherCount,
    marketCount,
    deletionCampaigns,
    evidenceByCampaignId,
    surveyResponseCount,
  };
}
