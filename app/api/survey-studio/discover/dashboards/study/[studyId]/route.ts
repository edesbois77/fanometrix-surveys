// ── Survey Studio → Dashboards → Study API (read-only, V2) ───────────────────
// The analytical command centre for a research exercise. Aggregates STRUCTURALLY
// COMPARABLE metrics across the authorised member surveys (intersect-only study_id).
// Adds a governed filter bar (Survey/Publisher/Market/Campaign — all narrow the
// campaign set, so every section stays consistent; Device/Time deferred, see report),
// position-based Q1–Q5 yield, timing, per-survey Results, and cross-survey comparison
// ONLY where canonical question identity + answer scale are proven. No raw rows.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { resolveStudyDashboardScope, type ScopeCampaign } from "@/lib/studio/dashboard-scope";
import { resolveDashboardManifest, validateDashboardFilters, effectiveSlugsForFilters, type DashboardManifest } from "@/lib/studio/dashboard-manifest";
import { eventCountsFor, seriesDay, seriesHourly, perQuestionAnswerCounts, groupBy, foldHourToDay, historicalAnswersHourly } from "@/lib/studio/dashboard-metrics";
import { mergeDaySeries } from "@/lib/studio/dashboard-performance";
import { normaliseQuestions } from "@/lib/studio/survey-results-resolve";
import { resolveDiscoverResults } from "@/lib/studio/dashboard-results";
import { canonicalQuestionKey, directlyComparable } from "@/lib/studio/question-identity";
import { getTimingStats } from "@/lib/survey-timing";
import { assembleStudy, type StudySurveyMetrics, type StudyPublisherRow, type StudyMarketRow, type StudyResultsGroup, type ComparableGroup, type StudyResponse } from "@/lib/studio/dashboard-study";
import { buildInsights, type DimensionSlice } from "@/lib/studio/dashboard-insights";
import { buildStudyFindings } from "@/lib/studio/study-findings";
import type { LocalisedQuestion } from "@/lib/survey-locale";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const slugsOf = (c: ScopeCampaign[]) => c.map((x) => x.campaign_id).filter(Boolean);

export async function GET(req: NextRequest, { params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  const scope = await resolveStudyDashboardScope(session, studyId);
  // Management-only shell: a study-operator (or owner) with NO data authority may
  // manage the grouping but sees NO analytics. Return a zeroed shell (reusing the
  // assembler) carrying only name/owner/manage flags — never metrics/results.
  if (scope.manageOnly) {
    const shell = assembleStudy({ studyId: scope.studyId, studyName: scope.studyName, surveys: [], publishers: [], markets: [], points: [], insights: [] });
    return NextResponse.json({ ...shell, kind: "user", canManage: scope.canManage, ownerOrganisationName: scope.ownerOrganisationName, manageOnly: true } satisfies StudyResponse);
  }
  if (scope.isEmpty) return NextResponse.json({ authorised: false } satisfies StudyResponse);

  // ── Filters (all narrow the campaign set → every section stays consistent) ──
  const manifest = await resolveDashboardManifest(scope.effectiveCampaigns);
  const p = req.nextUrl.searchParams;
  const validation = validateDashboardFilters(manifest, { publisher: p.get("publisher"), market: p.get("market"), language: p.get("language"), campaign: p.get("campaign") });
  const appliedFilters = validation.ok ? validation.filters : {};
  // Survey filter: only an authorised survey in THIS study is honoured (fail-closed).
  const requestedSurvey = p.get("survey");
  const surveyValid = !requestedSurvey || scope.surveys.some((s) => s.id === requestedSurvey);
  const surveyFilter = requestedSurvey && surveyValid ? requestedSurvey : undefined;
  const filterRejected = !validation.ok || (!!requestedSurvey && !surveyValid);

  let union = scope.effectiveCampaigns;
  if (surveyFilter) union = union.filter((c) => c.survey_id === surveyFilter);
  const narrowedSlugs = filterRejected ? [] : effectiveSlugsForFilters(union, appliedFilters);
  const effective = filterRejected ? [] : union.filter((c) => narrowedSlugs.includes(c.campaign_id));
  const inScopeSurveyIds = [...new Set(effective.map((c) => c.survey_id).filter(Boolean))] as string[];
  const inScopeSurveys = scope.surveys.filter((s) => inScopeSurveyIds.includes(s.id));

  // Publisher/market display names for the union.
  const pubIds = [...new Set(effective.map((c) => c.publisher_org_id).filter(Boolean))] as string[];
  const { data: orgs } = pubIds.length ? await supabaseAdmin.from("organisations").select("id, name").in("id", pubIds) : { data: [] };
  const pubName = new Map((orgs ?? []).map((o) => [o.id as string, (o.name as string) || "Publisher"]));

  // Survey questions (localised) for the in-scope surveys — for per-position yield + Results.
  const { data: surveyRows } = inScopeSurveyIds.length
    ? await supabaseAdmin.from("surveys").select("id, name, questions, enabled_languages").in("id", inScopeSurveyIds)
    : { data: [] };
  const qById = new Map((surveyRows ?? []).map((r) => [r.id as string, { questions: normaliseQuestions((r as { questions?: unknown }).questions), enabledLanguages: Array.isArray((r as { enabled_languages?: unknown }).enabled_languages) ? ((r as { enabled_languages: string[] }).enabled_languages) : [] }]));

  // ── Per-survey comparable metrics (over each survey's own effective slugs) ──
  const surveyMetrics: StudySurveyMetrics[] = await Promise.all(
    inScopeSurveys.map(async (s): Promise<StudySurveyMetrics> => {
      const camps = effective.filter((c) => c.survey_id === s.id);
      const slugs = slugsOf(camps);
      const counts = await eventCountsFor(slugs);
      const ans = await perQuestionAnswerCounts(slugs, s.questionCount, counts); // partial-aware historical via progression events
      return {
        surveyId: s.id, name: s.name, questionCount: s.questionCount, mode: ans.mode,
        publishers: [...new Set(camps.map((c) => c.publisher_org_id).filter(Boolean))].map((id) => pubName.get(id as string) ?? "Publisher"),
        markets: [...new Set(camps.map((c) => c.market ?? c.country_code).filter(Boolean))] as string[],
        loads: counts.get("SURVEY_RENDER") ?? 0, viewable: counts.get("SURVEY_VISIBLE") ?? 0,
        starts: counts.get("SURVEY_START") ?? 0, completions: counts.get("SURVEY_COMPLETED") ?? 0,
        answersCollected: ans.counts.reduce((a, b) => a + b, 0), answersByPosition: ans.counts,
      };
    }),
  );

  const effSlugs = slugsOf(effective);
  const maxQ = Math.max(1, ...inScopeSurveys.map((s) => s.questionCount));

  // Publisher / Market comparison + insight slices.
  const sliceOf = async (label: string, camps: ScopeCampaign[]): Promise<StudyPublisherRow> => {
    const slugs = slugsOf(camps);
    const counts = await eventCountsFor(slugs);
    const ans = await perQuestionAnswerCounts(slugs, maxQ, counts);
    const starts = counts.get("SURVEY_START") ?? 0, completions = counts.get("SURVEY_COMPLETED") ?? 0;
    return { label, starts, completions, answers: ans.counts.reduce((a, b) => a + b, 0), completionRate: starts > 0 ? completions / starts : null };
  };
  // Answer sources split by survey mode so studio (response_answers) and historical
  // (progression events) never double-count. A survey is wholly one mode or the other.
  const histSurveyIds = new Set(surveyMetrics.filter((s) => s.mode === "historical").map((s) => s.surveyId));
  const studioSurveyIds = new Set(surveyMetrics.filter((s) => s.mode === "studio_native").map((s) => s.surveyId));
  const histSlugs = slugsOf(effective.filter((c) => c.survey_id && histSurveyIds.has(c.survey_id)));
  const studioSlugs = slugsOf(effective.filter((c) => c.survey_id && studioSurveyIds.has(c.survey_id)));
  const studioAnswersDayP: Promise<Record<string, number>> = (async () => {
    if (!studioSlugs.length) return {};
    try {
      const r = await supabaseAdmin.rpc("dashboard_answer_series", { p_campaign_ids: studioSlugs, p_from: null, p_to: null, p_question_index: null });
      return r.error ? {} : foldHourToDay(r.data as never);
    } catch { return {} as Record<string, number>; }
  })();
  const [publishers, markets, timingStats, startsByDay, viewableByDay, completedByDay, rendersHour, startsHour, completedHour, answersHourHist, studioAnswersDay] = await Promise.all([
    Promise.all([...groupBy(effective, (c) => c.publisher_org_id)].map(([org, camps]) => sliceOf(pubName.get(org) ?? "Publisher", camps))) as Promise<StudyPublisherRow[]>,
    Promise.all([...groupBy(effective, (c) => c.market ?? c.country_code)].map(([mkt, camps]) => sliceOf(mkt, camps))) as Promise<StudyMarketRow[]>,
    getTimingStats(supabaseAdmin, { campaign_id: null, campaign_ids: effSlugs, publisher: null, placement: null, country: null, device: null, browser: null, date_from: null, date_to: null, scopedCampaignIds: null }).catch(() => ({ avg_completion_seconds: null, avg_ttfi_seconds: null, completion_sample: 0, ttfi_sample: 0 })),
    seriesDay("SURVEY_START", effSlugs), seriesDay("SURVEY_VISIBLE", effSlugs), seriesDay("SURVEY_COMPLETED", effSlugs),
    seriesHourly("SURVEY_RENDER", effSlugs), seriesHourly("SURVEY_START", effSlugs), seriesHourly("SURVEY_COMPLETED", effSlugs),
    historicalAnswersHourly(histSlugs), studioAnswersDayP,
  ]);
  const points = mergeDaySeries(startsByDay, viewableByDay, completedByDay);
  const timing = { avgCompletionSeconds: timingStats.avg_completion_seconds, avgTtfiSeconds: timingStats.avg_ttfi_seconds, completionSample: timingStats.completion_sample, ttfiSample: timingStats.ttfi_sample };
  // ── Multi-metric collection series (Answers | Impressions | Starts | Completions) ──
  // Impressions/Starts/Completions are exact hourly. Answers = historical progression
  // (hourly) + studio-native daily (placed at that day's 00:00Z; only surfaced at
  // daily+ intervals). answersHourly is true only when no studio source contributes.
  const answersHourly = studioSlugs.length === 0;
  const answersHour = { ...answersHourHist };
  for (const [date, n] of Object.entries(studioAnswersDay)) { const k = `${date}T00:00:00.000Z`; answersHour[k] = (answersHour[k] ?? 0) + n; }
  const hourKeys = [...new Set([...Object.keys(rendersHour), ...Object.keys(startsHour), ...Object.keys(completedHour), ...Object.keys(answersHour)])].sort();
  let collectionSeries = hourKeys.map((t) => ({ t, answers: answersHour[t] ?? 0, impressions: rendersHour[t] ?? 0, starts: startsHour[t] ?? 0, completions: completedHour[t] ?? 0 }));
  let collectionGranularity: "hour" | "day" = "hour";
  if (collectionSeries.length > 1500) { // > ~62 days of hours: fold to day to bound payload
    const byDay = new Map<string, { answers: number; impressions: number; starts: number; completions: number }>();
    for (const p of collectionSeries) { const d = p.t.slice(0, 10); const a = byDay.get(d) ?? { answers: 0, impressions: 0, starts: 0, completions: 0 }; a.answers += p.answers; a.impressions += p.impressions; a.starts += p.starts; a.completions += p.completions; byDay.set(d, a); }
    collectionSeries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ t: `${d}T00:00:00.000Z`, ...v }));
    collectionGranularity = "day";
  }
  const hasAnswers = collectionSeries.some((p) => p.answers > 0);

  // ── Insights (expanded: geo/device/publisher; + survey outlier) ──
  const totalStarts = surveyMetrics.reduce((a, s) => a + s.starts, 0);
  let insights: Awaited<ReturnType<typeof buildInsights>> = [];
  if (totalStarts >= 30) {
    const byDevice = await Promise.all(["mobile", "tablet", "desktop"].map(async (dev): Promise<DimensionSlice> => { const cc = await eventCountsFor(effSlugs, { p_device: dev }); return { value: dev, label: cap(dev), starts: cc.get("SURVEY_START") ?? 0, completions: cc.get("SURVEY_COMPLETED") ?? 0 }; }));
    const byMarket: DimensionSlice[] = markets.map((m) => ({ value: m.label, label: m.label, starts: m.starts, completions: m.completions }));
    const byPublisher: DimensionSlice[] = publishers.map((p) => ({ value: p.label, label: p.label, starts: p.starts, completions: p.completions }));
    insights = buildInsights({ totalStarts, byMarket, byDevice, byPublisher, manifestDimensions: new Set() });
    // Survey outlier — a member survey with a notably high answers-per-start vs the study average.
    const avg = surveyMetrics.reduce((a, s) => a + s.answersCollected, 0) / Math.max(1, totalStarts);
    const best = surveyMetrics.filter((s) => s.starts >= 10).map((s) => ({ s, aps: s.answersCollected / s.starts })).sort((a, b) => b.aps - a.aps)[0];
    if (best && inScopeSurveys.length >= 2 && best.aps >= avg * 1.2) {
      insights.push({ id: "survey", text: `${best.s.name} collects ${best.aps.toFixed(1)} answers per start vs the study average of ${avg.toFixed(1)}.` });
    }
  }

  // ── Results grouped by Survey → Question (never merged) ──
  const results: StudyResultsGroup[] = await Promise.all(
    inScopeSurveys.map(async (s): Promise<StudyResultsGroup> => {
      const meta = qById.get(s.id) ?? { questions: [] as LocalisedQuestion[], enabledLanguages: [] as string[] };
      const slugs = slugsOf(effective.filter((c) => c.survey_id === s.id));
      const r = await resolveDiscoverResults({ questions: meta.questions, enabledLanguages: meta.enabledLanguages }, slugs);
      return { surveyId: s.id, surveyName: s.name, mode: r.mode, questions: r.questions };
    }),
  );

  // ── Cross-survey comparison — ONLY where canonical identity + scale are proven ──
  const comparableGroups: ComparableGroup[] = buildComparableGroups(inScopeSurveys, qById, results);

  // ── Research Findings (answer-derived, deterministic, from the SAME filtered scope) ──
  const researchFindings = buildStudyFindings({
    comparableGroups,
    singleSurvey: inScopeSurveys.length === 1 && results[0]
      ? { surveyName: results[0].surveyName, questions: results[0].questions.filter((q) => q.base > 0).map((q) => ({ text: q.text, base: q.base, options: q.options.map((o) => ({ label: o.label, count: o.count })) })) }
      : null,
  });

  const study = assembleStudy({ studyId: scope.studyId, studyName: scope.studyName, surveys: surveyMetrics, publishers, markets, points, insights, timing });
  // Full manifest for the UI adds a Survey dimension (authorised surveys in this study).
  const filterManifest: DashboardManifest = {
    dimensions: [
      ...(scope.surveys.length >= 2 ? [{ key: "survey" as const, label: "Survey", values: scope.surveys.map((s) => ({ id: s.id, label: s.name })) }] : []) as never[],
      ...manifest.dimensions,
    ],
  };
  return NextResponse.json({
    ...study, results, comparableGroups, researchFindings, filterManifest,
    collectionSeries, collectionGranularity, answersHourly, hasAnswers,
    kind: scope.kind, canManage: scope.canManage, belowMinimum: scope.belowMinimum, ownerOrganisationName: scope.ownerOrganisationName,
    appliedFilters: { ...appliedFilters, ...(surveyFilter ? { survey: surveyFilter } : {}) },
    surveysInScope: scope.surveys.map((s) => ({ id: s.id, name: s.name })),
  } satisfies StudyResponse);
}

/** Group questions across surveys by canonical identity; keep a group only when
 *  every member is directlyComparable to the first (shared key + compatible scale). */
function buildComparableGroups(
  surveys: { id: string; name: string }[],
  qById: Map<string, { questions: LocalisedQuestion[]; enabledLanguages: string[] }>,
  results: StudyResultsGroup[],
): ComparableGroup[] {
  const byKey = new Map<string, { surveyId: string; surveyName: string; q: LocalisedQuestion; qi: number }[]>();
  for (const s of surveys) {
    const qs = qById.get(s.id)?.questions ?? [];
    qs.forEach((q, qi) => {
      const key = canonicalQuestionKey(q);
      const arr = byKey.get(key) ?? [];
      arr.push({ surveyId: s.id, surveyName: s.name, q, qi });
      byKey.set(key, arr);
    });
  }
  const out: ComparableGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const first = members[0].q;
    if (!members.every((m) => directlyComparable(first, m.q))) continue; // scale/identity must hold for ALL
    const surveysOut = members.map((m) => {
      const qr = results.find((r) => r.surveyId === m.surveyId)?.questions[m.qi];
      return { surveyId: m.surveyId, surveyName: m.surveyName, base: qr?.base ?? 0, options: (qr?.options ?? []).map((o) => ({ label: o.label, count: o.count, percentage: o.percentage })) };
    });
    out.push({ canonicalKey: key, text: results.find((r) => r.surveyId === members[0].surveyId)?.questions[members[0].qi]?.text ?? "", surveys: surveysOut });
  }
  return out;
}
