// ── Survey Studio — Discover portfolio intelligence (Stage 8) ────────────────
// The FIRST multi-survey intelligence: "what can I learn across the surveys I have
// access to?". It AGGREGATES independently-authoritative, survey-level Core findings —
// it never invents cross-survey comparability (no cross-survey %, no shared-construct
// inference, no respondent-level relationships, no "unique people" across surveys).
//
// SAFETY (Stage 8 §10/§14):
//   • Access is resolved at the SERVICE layer via the governed Dashboard scope; only
//     surveys the caller is entitled to are ever scanned, and each survey's Core
//     findings are surfaced only when the caller is entitled to its WHOLE scope
//     (reusing the single-survey gate getCurrentSurveyAnalysis) — never global-then-filter.
//   • Exposure follows the same control as the single-survey read (coreReadVisibleFor:
//     internal admins always; everyone else the product-read flag).
//   • FAILURE-ISOLATED per survey: one survey's Core projection failing never fails
//     the portfolio.
//   • totalResponses is RESPONSES across surveys, explicitly NOT unique people.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { resolveDashboardScope, resolveEntitledSurveys } from "@/lib/studio/dashboard-scope";
import { getCurrentSurveyAnalysis } from "@/lib/studio/survey-analysis-service";
import { getSurveyCoreIntelligence, coreReadVisibleFor } from "@/lib/studio/core-intelligence";

/** How many governed findings to surface, and how many surveys to scan for findings
 *  on one portfolio load (bounds read-time cost; truncation is reported, never silent). */
export const MEASURED_CAP = 6;
export const SURVEY_SCAN_CAP = 24;

export type PortfolioMeasuredFinding = { surveyId: string; surveyName: string; title: string; statistic?: string };

export type PortfolioIntelligence = {
  /** Whether Core portfolio intelligence is exposed to this caller (admin/flag). */
  visible: boolean;
  surveysAccessible: number;
  surveysWithMeasuredFindings: number;
  /** Responses collected across the accessible surveys — NOT unique people. */
  totalResponses: number;
  measuredFindings: PortfolioMeasuredFinding[];
  didYouKnow: string[];
  /** True when more surveys were accessible than were scanned for findings. */
  truncated: boolean;
};

type PerSurvey = { surveyId: string; surveyName: string; measured: { title: string; statistic?: string } | null };

/** Pure composition of the portfolio view-model from already-access-scoped inputs. */
export function composePortfolioIntelligence(input: {
  surveysAccessible: number;
  totalResponses: number;
  perSurvey: PerSurvey[];
  truncated: boolean;
}): PortfolioIntelligence {
  const withFindings = input.perSurvey.filter((s) => s.measured);
  const measuredFindings = withFindings.slice(0, MEASURED_CAP).map((s) => ({
    surveyId: s.surveyId, surveyName: s.surveyName, title: s.measured!.title, ...(s.measured!.statistic ? { statistic: s.measured!.statistic } : {}),
  }));
  const didYouKnow: string[] = [];
  if (withFindings.length >= 1) {
    const n = withFindings.length;
    didYouKnow.push(`${n} of your ${input.surveysAccessible} survey${input.surveysAccessible === 1 ? "" : "s"} ${n === 1 ? "has a" : "have"} measured finding${n === 1 ? "" : "s"} worth reviewing.`);
  }
  return {
    visible: true,
    surveysAccessible: input.surveysAccessible,
    surveysWithMeasuredFindings: withFindings.length,
    totalResponses: input.totalResponses,
    measuredFindings,
    didYouKnow: didYouKnow.slice(0, 2),
    truncated: input.truncated,
  };
}

const EMPTY = (visible: boolean): PortfolioIntelligence => ({
  visible, surveysAccessible: 0, surveysWithMeasuredFindings: 0, totalResponses: 0, measuredFindings: [], didYouKnow: [], truncated: false,
});

async function sumResponses(slugs: string[]): Promise<number> {
  if (slugs.length === 0) return 0;
  const { data } = await supabaseAdmin.from("vw_campaign_stats").select("response_count").in("campaign_id", slugs);
  return (data ?? []).reduce((a, r) => a + (Number((r as { response_count?: unknown }).response_count ?? 0) || 0), 0);
}

/** The survey's headline MEASURED finding = its strongest governed Core finding:
 *  prefer a key-tier finding, then the largest share (so the portfolio leads with the
 *  same side the single-survey view leads with, not an inverse complement). */
function strongestGoverned(core: Awaited<ReturnType<typeof getSurveyCoreIntelligence>>): { title: string; statistic?: string } | null {
  if (!core) return null;
  const tierRank = (t: string) => (t === "key" ? 0 : t === "supporting" ? 1 : 2);
  const share = (s?: string) => (s ? parseFloat(s) : NaN) || 0;
  const gov = core.findings.filter((f) => f.basis === "governed")
    .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || share(b.statistic) - share(a.statistic))[0];
  return gov ? { title: gov.title, ...(gov.statistic ? { statistic: gov.statistic } : {}) } : null;
}

/** Resolve access-scoped Core portfolio intelligence for the caller. Never throws;
 *  one survey failing never fails the portfolio. Returns visible:false when the
 *  caller is not exposed to Core intelligence (non-admin + flag off). */
export async function getPortfolioIntelligence(session: AuthedUser): Promise<PortfolioIntelligence> {
  const visible = coreReadVisibleFor(session);
  if (!visible) return EMPTY(false);
  try {
    const scope = await resolveDashboardScope(session);
    if (scope.isEmpty) return EMPTY(true);
    const surveys = await resolveEntitledSurveys(scope);
    const totalResponses = await sumResponses(scope.authorisedCampaignSlugs);

    const scan = surveys.slice(0, SURVEY_SCAN_CAP);
    const truncated = surveys.length > SURVEY_SCAN_CAP;
    const entitlement = { unrestricted: scope.unrestricted, authorisedCampaignIds: scope.authorisedCampaignIds };

    const perSurvey: PerSurvey[] = await Promise.all(scan.map(async (s) => {
      try {
        // WHOLE-scope entitlement gate — surface Core findings only when the caller is
        // entitled to the survey's entire scope (same standard as the single-survey read).
        const analysis = await getCurrentSurveyAnalysis(s.id, entitlement);
        if (!analysis) return { surveyId: s.id, surveyName: s.name, measured: null };
        const core = await getSurveyCoreIntelligence(s.id, true);
        return { surveyId: s.id, surveyName: s.name, measured: strongestGoverned(core) };
      } catch {
        return { surveyId: s.id, surveyName: s.name, measured: null }; // per-survey isolation
      }
    }));

    return composePortfolioIntelligence({ surveysAccessible: surveys.length, totalResponses, perSurvey, truncated });
  } catch {
    return EMPTY(true); // whole-portfolio isolation — never break Discover
  }
}
