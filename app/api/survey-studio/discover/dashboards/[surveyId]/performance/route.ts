// ── Survey Studio → Dashboards → Performance API (read-only, V3) ─────────────
// Governed Performance contract for ONE authorised survey. Order: authorised
// universe → validate filters → narrow → calculate. Presentation-ready analytics
// only — NEVER raw respondent rows. Adds events-based timing (reused getTimingStats),
// deterministic insights (bounded dashboard_event_counts slices), and the Study
// grouping label (intersect-only over already-authorised surveys).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { resolveDashboardScope, type ScopeCampaign } from "@/lib/studio/dashboard-scope";
import { resolveDashboardManifest, validateDashboardFilters, effectiveSlugsForFilters } from "@/lib/studio/dashboard-manifest";
import { assemblePerformance, type PerformanceResponse } from "@/lib/studio/dashboard-performance";
import { buildInsights, type DimensionSlice, type Insight } from "@/lib/studio/dashboard-insights";
import { answeredFromProgression, seriesHourly, historicalAnswersHourly } from "@/lib/studio/dashboard-metrics";
import { getTimingStats } from "@/lib/survey-timing";
import type { CampaignProgressRow } from "@/lib/studio/collection-health";

function labelOf(text: unknown): string | null {
  if (typeof text === "string") return text;
  if (text && typeof text === "object") { const t = text as Record<string, string>; return t.en ?? Object.values(t)[0] ?? null; }
  return null;
}
function foldHourToDay(rows: { bucket_hour: string; event_count: number }[] | null): Record<string, number> {
  const day: Record<string, number> = {};
  for (const r of rows ?? []) { const n = Number(r.event_count) || 0; const iso = new Date(r.bucket_hour).toISOString(); day[iso.slice(0, 10)] = (day[iso.slice(0, 10)] ?? 0) + n; }
  return day;
}
const RPC_NULLS = { p_from: null, p_to: null, p_publisher: null, p_placement: null, p_country: null, p_device: null, p_browser: null };
const seriesFor = (type: string, slugs: string[]) => supabaseAdmin.rpc("dashboard_event_series", { p_event_type: type, p_campaign_ids: slugs, ...RPC_NULLS });

async function funnelFor(slugs: string[], extra: Record<string, string | null> = {}): Promise<{ starts: number; completions: number }> {
  if (!slugs.length) return { starts: 0, completions: 0 };
  const { data } = await supabaseAdmin.rpc("dashboard_event_counts", { p_campaign_ids: slugs, ...RPC_NULLS, ...extra });
  const m = new Map(((data ?? []) as { event_type: string; event_count: number }[]).map((r) => [r.event_type, Number(r.event_count) || 0]));
  return { starts: m.get("SURVEY_START") ?? 0, completions: m.get("SURVEY_COMPLETED") ?? 0 };
}
function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!k) continue; const a = m.get(k) ?? []; a.push(r); m.set(k, a); }
  return m;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function perQuestionAnswers(slugs: string[], questionCount: number, eventCounts?: Map<string, number>): Promise<{ counts: number[]; mode: "studio_native" | "historical" }> {
  const n = Math.max(0, Math.min(5, questionCount));
  const { count: raCount } = await supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("is_demo", false);
  if ((raCount ?? 0) > 0) {
    const counts = await Promise.all(Array.from({ length: n }, (_, qi) =>
      supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("question_index", qi).eq("is_demo", false).then((r) => r.count ?? 0)));
    return { counts, mode: "studio_native" };
  }
  // Historical: partial-aware progression counts when the event map is available.
  if (eventCounts) return { counts: answeredFromProgression(eventCounts, n), mode: "historical" };
  const legacyCols = ["q1", "q2", "q3"].slice(0, Math.min(3, n));
  const counts = await Promise.all([
    ...legacyCols.map((col) => supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("is_demo", false).not(col, "is", null).then((r) => r.count ?? 0)),
    ...Array.from({ length: Math.max(0, n - 3) }, () => Promise.resolve(0)),
  ]);
  return { counts, mode: "historical" };
}

async function computeInsights(filteredCampaigns: ScopeCampaign[], filteredSlugs: string[], starts: number, publisherLabels: Map<string, string>, manifestKeys: Set<string>): Promise<Insight[]> {
  if (starts < 30 || filteredSlugs.length === 0) return [];
  const pubGroups = [...groupBy(filteredCampaigns, (c) => c.publisher_org_id)];
  const mktGroups = [...groupBy(filteredCampaigns, (c) => c.market ?? c.country_code)];
  const [byPublisher, byMarket, byDevice] = await Promise.all([
    Promise.all(pubGroups.map(async ([org, camps]): Promise<DimensionSlice> => ({ value: org, label: publisherLabels.get(org) ?? "Publisher", ...(await funnelFor(camps.map((c) => c.campaign_id))) }))),
    Promise.all(mktGroups.map(async ([mkt, camps]): Promise<DimensionSlice> => ({ value: mkt, label: mkt, ...(await funnelFor(camps.map((c) => c.campaign_id))) }))),
    Promise.all(["mobile", "tablet", "desktop"].map(async (dev): Promise<DimensionSlice> => ({ value: dev, label: cap(dev), ...(await funnelFor(filteredSlugs, { p_device: dev })) }))),
  ]);
  return buildInsights({ totalStarts: starts, byMarket, byDevice, byPublisher, manifestDimensions: manifestKeys });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  const scope = await resolveDashboardScope(session, { requestedSurveyId: surveyId });
  if (scope.isEmpty || scope.requestedSurveyId !== surveyId) return NextResponse.json({ authorised: false } satisfies PerformanceResponse);

  const { data: surveyRow } = await supabaseAdmin.from("surveys").select("id, name, status, questions, study_id").eq("id", surveyId).is("deleted_at", null).single();
  const questions = Array.isArray(surveyRow?.questions) ? (surveyRow!.questions as Record<string, unknown>[]) : [];
  const survey = {
    id: surveyId, name: (surveyRow?.name as string) || "Untitled survey", status: (surveyRow?.status as string | null) ?? null,
    questionCount: questions.length, questionLabels: questions.map((q) => labelOf((q as { text?: unknown }).text)),
  };

  const filterManifest = await resolveDashboardManifest(scope.effectiveCampaigns);
  const p = req.nextUrl.searchParams;
  const validation = validateDashboardFilters(filterManifest, { publisher: p.get("publisher"), market: p.get("market"), language: p.get("language"), campaign: p.get("campaign") });
  const filterRejected = !validation.ok;
  const appliedFilters = validation.ok ? validation.filters : {};

  const filteredSlugs = filterRejected ? [] : effectiveSlugsForFilters(scope.effectiveCampaigns, appliedFilters);
  const filteredCampaigns = scope.effectiveCampaigns.filter((c) => filteredSlugs.includes(c.campaign_id));
  const scopeMeta = { campaignCount: filteredCampaigns.length, publisherCount: new Set(filteredCampaigns.map((c) => c.publisher_org_id).filter(Boolean)).size };
  const publisherLabels = new Map((filterManifest.dimensions.find((d) => d.key === "publisher")?.values ?? []).map((v) => [v.id, v.label]));
  const manifestKeys = new Set(filterManifest.dimensions.map((d) => d.key));

  let eventCounts: { event_type: string; event_count: number }[] = [];
  let startsByDay: Record<string, number> = {}, viewableByDay: Record<string, number> = {}, completedByDay: Record<string, number> = {};
  let progressRows: CampaignProgressRow[] = [];
  let answers = { counts: [] as number[], mode: "studio_native" as "studio_native" | "historical" };
  let timing = { avgTtfiSeconds: null as number | null, avgCompletionSeconds: null as number | null, ttfiSample: 0, completionSample: 0 };
  let insights: Insight[] = [];
  let collectionSeries: { t: string; answers: number; impressions: number; starts: number; completions: number }[] = [];
  let collectionGranularity: "hour" | "day" = "hour";
  let answersHourly = true;
  let hasAnswers = false;
  let markets: { label: string; answers: number; starts: number }[] = [];
  let degraded = false;

  if (filteredSlugs.length > 0) {
    // Event counts first — the historical answer model reads the progression events.
    const countsRes = await supabaseAdmin.rpc("dashboard_event_counts", { p_campaign_ids: filteredSlugs, ...RPC_NULLS });
    if (countsRes.error) degraded = true; else eventCounts = (countsRes.data ?? []) as { event_type: string; event_count: number }[];
    const countsMap = new Map(eventCounts.map((r) => [r.event_type, Number(r.event_count) || 0]));
    const [startsRes, viewRes, compRes, targetRes, statsRes, ans, tim] = await Promise.all([
      seriesFor("SURVEY_START", filteredSlugs), seriesFor("SURVEY_VISIBLE", filteredSlugs), seriesFor("SURVEY_COMPLETED", filteredSlugs),
      supabaseAdmin.from("campaigns").select("campaign_id, target_responses").in("id", filteredCampaigns.map((c) => c.id)),
      supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count").in("campaign_id", filteredSlugs),
      perQuestionAnswers(filteredSlugs, survey.questionCount, countsMap),
      getTimingStats(supabaseAdmin, { campaign_id: null, campaign_ids: filteredSlugs, publisher: null, placement: null, country: null, device: null, browser: null, date_from: null, date_to: null, scopedCampaignIds: null }).catch(() => ({ avg_completion_seconds: null, avg_ttfi_seconds: null, completion_sample: 0, ttfi_sample: 0 })),
    ]);
    if (startsRes.error) degraded = true; else startsByDay = foldHourToDay(startsRes.data as never);
    if (viewRes.error) degraded = true; else viewableByDay = foldHourToDay(viewRes.data as never);
    if (compRes.error) degraded = true; else completedByDay = foldHourToDay(compRes.data as never);
    answers = ans;
    timing = { avgTtfiSeconds: tim.avg_ttfi_seconds, avgCompletionSeconds: tim.avg_completion_seconds, ttfiSample: tim.ttfi_sample, completionSample: tim.completion_sample };
    const targetBySlug = new Map((targetRes.data ?? []).map((r) => [r.campaign_id as string, r.target_responses == null ? null : Number(r.target_responses)]));
    const respBySlug = new Map((statsRes.data ?? []).map((r) => [r.campaign_id as string, Number(r.response_count) || 0]));
    progressRows = filteredCampaigns.map((c) => ({ target_responses: targetBySlug.get(c.campaign_id) ?? null, response_count: respBySlug.get(c.campaign_id) ?? 0 }));
    const starts = new Map(eventCounts.map((r) => [r.event_type, Number(r.event_count) || 0])).get("SURVEY_START") ?? 0;
    insights = await computeInsights(filteredCampaigns, filteredSlugs, starts, publisherLabels, manifestKeys);

    // ── Collection over time — hour-grained multi-metric (same contract as Study) ──
    answersHourly = answers.mode !== "studio_native"; // studio answers are day-resolution
    const [rendersHour, startsHour, completedHour, answersHour] = await Promise.all([
      seriesHourly("SURVEY_RENDER", filteredSlugs), seriesHourly("SURVEY_START", filteredSlugs), seriesHourly("SURVEY_COMPLETED", filteredSlugs),
      answers.mode === "studio_native"
        ? (async (): Promise<Record<string, number>> => {
            try {
              const r = await supabaseAdmin.rpc("dashboard_answer_series", { p_campaign_ids: filteredSlugs, p_from: null, p_to: null, p_question_index: null });
              const day = r.error ? {} : foldHourToDay(r.data as never);
              const out: Record<string, number> = {}; for (const [d, n] of Object.entries(day)) out[`${d}T00:00:00.000Z`] = n as number; return out;
            } catch { return {}; }
          })()
        : historicalAnswersHourly(filteredSlugs),
    ]);
    const hourKeys = [...new Set([...Object.keys(rendersHour), ...Object.keys(startsHour), ...Object.keys(completedHour), ...Object.keys(answersHour)])].sort();
    collectionSeries = hourKeys.map((t) => ({ t, answers: answersHour[t] ?? 0, impressions: rendersHour[t] ?? 0, starts: startsHour[t] ?? 0, completions: completedHour[t] ?? 0 }));
    if (collectionSeries.length > 1500) { // > ~62 days of hours → fold to day
      const byDay = new Map<string, { answers: number; impressions: number; starts: number; completions: number }>();
      for (const pt of collectionSeries) { const d = pt.t.slice(0, 10); const a = byDay.get(d) ?? { answers: 0, impressions: 0, starts: 0, completions: 0 }; a.answers += pt.answers; a.impressions += pt.impressions; a.starts += pt.starts; a.completions += pt.completions; byDay.set(d, a); }
      collectionSeries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ t: `${d}T00:00:00.000Z`, ...v }));
      collectionGranularity = "day";
    }
    hasAnswers = collectionSeries.some((pt) => pt.answers > 0);

    // ── Answers by market (donut) — same governed answer count, per market ──
    const marketGroups = [...groupBy(filteredCampaigns, (c) => c.market ?? c.country_code)];
    markets = await Promise.all(marketGroups.map(async ([mkt, camps]): Promise<{ label: string; answers: number; starts: number }> => {
      const slugs = camps.map((c) => c.campaign_id).filter(Boolean);
      const { data } = await supabaseAdmin.rpc("dashboard_event_counts", { p_campaign_ids: slugs, ...RPC_NULLS });
      const m = new Map(((data ?? []) as { event_type: string; event_count: number }[]).map((r) => [r.event_type, Number(r.event_count) || 0]));
      const a = await perQuestionAnswers(slugs, survey.questionCount, m);
      return { label: mkt, answers: a.counts.reduce((x, y) => x + y, 0), starts: m.get("SURVEY_START") ?? 0 };
    }));
  }

  // Canonical Research Exercises (surveys.study_id) are NOT surfaced in Discover UX —
  // a Discover "Study" is a user-created grouping. surveys.study_id is untouched and
  // still consumed by Manage/Reports/Analysis; it just isn't advertised here.
  const payload = assemblePerformance({ survey, eventCounts, perQuestionAnswers: answers.counts, answerMode: answers.mode, startsByDay, viewableByDay, completedByDay, progressRows, appliedFilters, filterManifest, scope: scopeMeta, timing, filterRejected, degraded });
  return NextResponse.json({ ...payload, insights, collectionSeries, collectionGranularity, answersHourly, hasAnswers, markets } satisfies PerformanceResponse);
}
