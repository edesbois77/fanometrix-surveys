// ── Survey Studio → Dashboards — landing assembly (pure) ─────────────────────
// Turns the authorised survey list + campaign universe into the Studies-first
// landing model: studies (grouped by the intersect-only study_id label) with cheap
// top-line context, and standalone surveys separately. Pure — the route fetches
// completions (vw_campaign_stats) and study names, then calls this.
import type { ScopeCampaign, DashboardSurveyOption } from "@/lib/studio/dashboard-scope";

export type LandingSurvey = {
  id: string; name: string; status: string | null; questionCount: number;
  campaignCount: number; publisherCount: number; marketCount: number;
  completions: number;
  /** Valid question answers collected by this survey — partial-aware, the SAME
   *  governed count the Study Dashboard uses (perQuestionAnswerCounts). Never
   *  questions×completions, never a completion proxy. */
  answersCollected: number;
  studyId: string | null;
};
export type LandingStudy = {
  studyId: string; studyName: string | null; surveyCount: number;
  publisherCount: number; marketCount: number; completions: number;
  /** Valid question answers across the study's authorised members — the SAME
   *  partial-aware count as the Study Dashboard's focal metric and the Survey cards.
   *  Sum of member answersCollected; never a completion proxy. */
  answersCollected: number;
  /** canonical research Study (surveys.study_id) vs user-created analysis grouping. */
  kind: "canonical" | "user";
  /** For a user study: the caller's organisation owns it (may edit/delete). */
  canManage: boolean;
};

const distinct = (xs: (string | null)[]) => new Set(xs.filter(Boolean) as string[]);

export function assembleLanding(
  surveys: DashboardSurveyOption[],
  campaigns: ScopeCampaign[],
  respBySlug: Map<string, number>,
  studyName: Map<string, string | null>,
  answersBySurvey: Map<string, number> = new Map(),
): { studies: LandingStudy[]; surveys: LandingSurvey[] } {
  const campsBySurvey = new Map<string, ScopeCampaign[]>();
  for (const c of campaigns) { if (!c.survey_id) continue; const a = campsBySurvey.get(c.survey_id) ?? []; a.push(c); campsBySurvey.set(c.survey_id, a); }
  const completionsFor = (camps: ScopeCampaign[]) => camps.reduce((n, c) => n + (respBySlug.get(c.campaign_id) ?? 0), 0);

  const enriched: LandingSurvey[] = surveys.map((s) => {
    const camps = campsBySurvey.get(s.id) ?? [];
    return {
      id: s.id, name: s.name, status: s.status, questionCount: s.questionCount, campaignCount: camps.length,
      publisherCount: distinct(camps.map((c) => c.publisher_org_id)).size,
      marketCount: distinct(camps.map((c) => c.market ?? c.country_code)).size,
      completions: completionsFor(camps), answersCollected: answersBySurvey.get(s.id) ?? 0, studyId: s.studyId,
    };
  });

  const studyIds = [...distinct(surveys.map((s) => s.studyId))];
  const studies: LandingStudy[] = studyIds.map((id) => {
    const members = enriched.filter((s) => s.studyId === id);
    const memberIds = new Set(members.map((s) => s.id));
    const camps = campaigns.filter((c) => c.survey_id && memberIds.has(c.survey_id));
    return {
      studyId: id, studyName: studyName.get(id) ?? null, surveyCount: members.length,
      publisherCount: distinct(camps.map((c) => c.publisher_org_id)).size,
      marketCount: distinct(camps.map((c) => c.market ?? c.country_code)).size,
      completions: completionsFor(camps), answersCollected: members.reduce((n, s) => n + s.answersCollected, 0),
      kind: "canonical" as const, canManage: false,
    };
  }).sort((a, b) => b.answersCollected - a.answersCollected);

  // ALL individually-authorised surveys appear here — belonging to a Study does NOT
  // remove a survey's own dashboard. The Study is an aggregation layer above them.
  const allSurveys = [...enriched].sort((a, b) => a.name.localeCompare(b.name));
  return { studies, surveys: allSurveys };
}

/**
 * Build landing cards for the caller's ORGANISATION-created Studies. Every count is
 * computed from the EFFECTIVE authorised universe: a saved member the caller can no
 * longer see is simply excluded (never counted, never disclosed). A study whose
 * authorised membership is empty is dropped from the landing entirely.
 */
export function assembleUserStudies(
  userStudies: { id: string; name: string | null; memberSurveyIds: string[] }[],
  authorisedSurveys: DashboardSurveyOption[],
  campaigns: ScopeCampaign[],
  respBySlug: Map<string, number>,
  answersBySurvey: Map<string, number> = new Map(),
): LandingStudy[] {
  const authIds = new Set(authorisedSurveys.map((s) => s.id));
  const campsBySurvey = new Map<string, ScopeCampaign[]>();
  for (const c of campaigns) { if (!c.survey_id) continue; const a = campsBySurvey.get(c.survey_id) ?? []; a.push(c); campsBySurvey.set(c.survey_id, a); }
  const completionsFor = (camps: ScopeCampaign[]) => camps.reduce((n, c) => n + (respBySlug.get(c.campaign_id) ?? 0), 0);

  return userStudies
    .map((us) => {
      const memberIds = us.memberSurveyIds.filter((id) => authIds.has(id)); // membership ∩ authorised
      const camps = memberIds.flatMap((id) => campsBySurvey.get(id) ?? []);
      return {
        studyId: us.id, studyName: us.name, surveyCount: memberIds.length,
        publisherCount: distinct(camps.map((c) => c.publisher_org_id)).size,
        marketCount: distinct(camps.map((c) => c.market ?? c.country_code)).size,
        completions: completionsFor(camps),
        answersCollected: memberIds.reduce((n, id) => n + (answersBySurvey.get(id) ?? 0), 0), // ∩ authorised only
        kind: "user" as const, canManage: true,
      };
    })
    .filter((s) => s.surveyCount > 0) // never surface a study with no accessible surveys
    .sort((a, b) => b.answersCollected - a.answersCollected);
}
