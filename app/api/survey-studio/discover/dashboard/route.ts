// ── Survey Studio → Discover → Overview (read-only, governed) ───────────────
// "The latest from your research." The editorial, intelligence-led front page of
// Discover. It surfaces the LATEST and BEST from the research the caller is already
// entitled to see — nothing more. Every surface is subordinate to the SAME Discover
// entitlement model as the rest of Discover:
//   • resolveDashboardScope → the authorised campaign universe (the only data seen).
//   • Survey Analysis headlines pass the SAME analysisScopeVisible gate as the
//     Findings page — a caller who couldn't consume an analysis on Findings never
//     sees its headline here (fail closed).
//   • Deterministic findings reuse the existing base-gated engine over the caller's
//     entitled slugs — the gates are NOT lowered for the Overview.
//   • Study Analysis / Study Findings are NOT surfaced (they have no Discover
//     entitlement model — admin-only, no scope gate — so their intelligence stays in
//     its governed context). Studies appear only as discovery OBJECTS.
//   • Reports have no governed per-caller listing yet → the section is omitted
//     (reports: null), never faked. The shape is ready for one to slot in.
// NO model is ever invoked here. NO new analytics pipeline. NO persisted state.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { resolveDashboardScope, resolveEntitledSurveys } from "@/lib/studio/dashboard-scope";
import { computeStatusWithReason, type CampaignForStatus, type CampaignStatus } from "@/lib/campaign-status";
import {
  surveyLifecycleState, LIFECYCLE_LABEL, plannedProgress, relativeResponseLabel,
} from "@/lib/studio/collection-health";
import { analysisScopeVisible } from "@/lib/studio/survey-analysis-service";
import { normaliseQuestions } from "@/lib/studio/survey-results-resolve";
import { resolveDiscoverResults } from "@/lib/studio/dashboard-results";
import { resolveSurveySegmentEvidence } from "@/lib/studio/survey-segments-resolve";
import { buildSurveyFindings, findingsContext, FINDING_MIN_BASE, type SurveyQuestionEvidence, type SurveyFinding } from "@/lib/studio/survey-findings-engine";
import { historicalAnswersDaily, foldHourToDay, mergeCountMaps } from "@/lib/studio/dashboard-metrics";
import { DISCOVER_BASE, surveyDashboardHref, studyDashboardHref } from "@/lib/studio/discover-nav";
import {
  selectInsights, classifyAccount, selectActivity, selectLiveSurveys, selectExplore, partitionAnswerModes,
  buildDailyActivity, activityWorthShowing, MAX_FEATURED_DETERMINISTIC, ACTIVITY_WINDOW_DAYS,
  type FeaturedFinding, type ResearchFeedItem, type LiveSurvey, type ExploreItem, type DiscoverDashboardData,
} from "@/lib/studio/discover-dashboard";

export type { DiscoverDashboardData };

const CAMP_STATUS_COLS =
  "id, campaign_id, survey_id, status, manual_status_override, start_date, end_date, target_responses, target_mode, archive_after_days, status_updated_at, country_code";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const findingsHref = (id: string) => `${DISCOVER_BASE}/surveys/${encodeURIComponent(id)}?view=findings`;
const msOf = (iso: string | null | undefined): number => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isNaN(t) ? 0 : t; };
const rel = (ms: number, nowMs: number): string | null => (ms > 0 ? relativeResponseLabel(new Date(ms).toISOString(), nowMs) : null);

type AnalysisSnapshot = {
  campaignScope?: string[];
  narrative?: { headline?: string; summary?: string } | null;
  themes?: { title?: string }[];
};

function emptyPayload(context: { organisationName: string | null; unrestricted: boolean }): DiscoverDashboardData {
  return { context, accountShape: "empty", hero: null, liveNow: [], glance: { surveys: 0, answers: 0, live: 0, analyses: 0 }, insights: [], reports: null, researchActivity: null, activity: [], explore: { surveys: [], studies: [] }, totals: { surveys: 0, studies: 0 } };
}

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin", "brand", "agency", "publisher"]); }
  catch (err) { return err as Response; }

  const scope = await resolveDashboardScope(session);
  const context = { organisationName: session.organisationName, unrestricted: scope.unrestricted };
  if (scope.isEmpty) return NextResponse.json(emptyPayload(context));

  const surveys = await resolveEntitledSurveys(scope);
  if (surveys.length === 0) return NextResponse.json(emptyPayload(context));
  const surveyIds = surveys.map((s) => s.id);
  const nowMs = Date.now();
  const now = new Date(nowMs);

  // ── Governed batched reads (no N+1; all scoped to the entitled universe) ────
  // "Total answers" = the number of STORED ANSWER RECORDS. Per-mode, never mixed and
  // never inferred: studio-native slugs count rows in response_answers; historical
  // slugs count the real recorded values in the legacy positional columns
  // (responses.q1/q2/q3). It is NO LONGER the progression-event union — those events
  // are a lossy inference from delivery telemetry with no answer value behind them,
  // and reporting them as "answers" is precisely the substitution this repair removes.
  // The two reads below get (a) the studio-native answer count and (b) which
  // authorised slugs are studio-native (present in response_answers).
  const slugs = scope.authorisedCampaignSlugs;
  const [createdRes, campRes, statsRes, analysisRes, studyRes, studioCountRes, studioSlugRes] = await Promise.all([
    supabaseAdmin.from("surveys").select("id, created_at").in("id", surveyIds).is("deleted_at", null),
    supabaseAdmin.from("campaigns").select(CAMP_STATUS_COLS).in("id", scope.authorisedCampaignIds).is("deleted_at", null),
    supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count, last_response_at").in("campaign_id", slugs),
    supabaseAdmin.from("survey_analysis_runs").select("id, survey_id, completed_at, evidence_snapshot").eq("status", "completed").in("survey_id", surveyIds).order("created_at", { ascending: false }),
    session.organisationId
      ? supabaseAdmin.from("dashboard_studies").select("id, name, updated_at, dashboard_study_surveys(survey_id)").eq("organisation_id", session.organisationId)
      : Promise.resolve({ data: [] as { id: string; name: string | null; updated_at: string | null; dashboard_study_surveys: { survey_id: string }[] }[] }),
    // (a) studio-native total: one scoped count over response_answers (real only).
    slugs.length ? supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("is_demo", false) : Promise.resolve({ count: 0 }),
    // (b) studio-native slug set: distinct campaign_ids present in response_answers.
    // Q1 (index 0) is answered by everyone who answered anything (sequential), so its
    // campaign_ids ARE the studio-native set — a bounded, index-covered scan.
    slugs.length ? supabaseAdmin.from("response_answers").select("campaign_id").in("campaign_id", slugs).eq("question_index", 0).eq("is_demo", false) : Promise.resolve({ data: [] as { campaign_id: string }[] }),
  ]);

  // Historical slugs = authorised slugs with NO response_answers.
  const studioAnswers = (studioCountRes as { count: number | null }).count ?? 0;
  const studioNativeSlugs = ((studioSlugRes.data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id);
  const { studioSlugs, historicalSlugs } = partitionAnswerModes(slugs, studioNativeSlugs);
  let historicalAnswers = 0;
  if (historicalSlugs.length) {
    // Real recorded answers only: one count per legacy positional column. A
    // historical survey never stored Q4/Q5 anywhere, so none is invented.
    const legacyCounts = await Promise.all(["q1", "q2", "q3"].map((col) =>
      supabaseAdmin.from("responses").select("id", { count: "exact", head: true })
        .in("campaign_id", historicalSlugs).eq("is_demo", false).not(col, "is", null)
        .then((r) => r.count ?? 0)));
    historicalAnswers = legacyCounts.reduce((a, b) => a + b, 0);
  }
  const answersTotal = studioAnswers + historicalAnswers;
  const createdMsById = new Map<string, number>((createdRes.data ?? []).map((r) => [r.id as string, msOf(r.created_at as string | null)]));
  const campById = new Map<string, CampaignForStatus & { campaign_id: string }>();
  for (const c of campRes.data ?? []) campById.set(c.id as string, c as unknown as CampaignForStatus & { campaign_id: string });
  const respBySlug = new Map<string, number>();
  const lastRespMsBySlug = new Map<string, number>();
  for (const s of statsRes.data ?? []) {
    respBySlug.set(s.campaign_id as string, Number(s.response_count ?? 0) || 0);
    lastRespMsBySlug.set(s.campaign_id as string, msOf(s.last_response_at as string | null));
  }

  // ── Per-survey factual lifecycle + activity (effective status engine) ───────
  const campsBySurvey = new Map<string, { id: string; slug: string }[]>();
  for (const c of scope.campaigns) {
    if (!c.survey_id) continue;
    const a = campsBySurvey.get(c.survey_id) ?? [];
    a.push({ id: c.id, slug: c.campaign_id });
    campsBySurvey.set(c.survey_id, a);
  }
  type SurveyState = { id: string; name: string; lifecycle: string; lifecycleLabel: string; responses: number; campaignCount: number; lastResponseMs: number; activityMs: number; collecting: boolean };
  const stateById = new Map<string, SurveyState>();
  for (const s of surveys) {
    const camps = campsBySurvey.get(s.id) ?? [];
    const effectiveStatuses: CampaignStatus[] = [];
    let totalResponses = 0;
    let lastResponseMs = 0;
    const progressRows: { target_responses: number | null; response_count: number }[] = [];
    for (const c of camps) {
      const row = campById.get(c.id);
      const resp = respBySlug.get(c.slug) ?? 0;
      totalResponses += resp;
      lastResponseMs = Math.max(lastResponseMs, lastRespMsBySlug.get(c.slug) ?? 0);
      if (row) {
        effectiveStatuses.push(computeStatusWithReason(row, resp, now).effective);
        progressRows.push({ target_responses: row.target_responses ?? null, response_count: resp });
      }
    }
    const targetReached = plannedProgress(progressRows).targetReached;
    const lifecycle = surveyLifecycleState({ effectiveStatuses, totalResponses, targetReached });
    const createdMs = createdMsById.get(s.id) ?? 0;
    stateById.set(s.id, {
      id: s.id, name: s.name, lifecycle, lifecycleLabel: LIFECYCLE_LABEL[lifecycle], responses: totalResponses,
      campaignCount: camps.length, lastResponseMs, activityMs: lastResponseMs || createdMs,
      collecting: lifecycle === "collecting" || lifecycle === "live",
    });
  }

  // ── Latest visible Survey Analysis per survey (SAME entitlement gate) ───────
  const visibleAnalysis = new Map<string, { headline: string; summary: string | null; completedAtMs: number }>();
  for (const run of analysisRes.data ?? []) {
    const surveyId = run.survey_id as string;
    if (visibleAnalysis.has(surveyId)) continue; // rows are created_at DESC → first is latest completed
    const snap = (run.evidence_snapshot ?? {}) as AnalysisSnapshot;
    if (!analysisScopeVisible({ runCampaignScope: snap.campaignScope, unrestricted: scope.unrestricted, authorisedCampaignIds: scope.authorisedCampaignIds })) continue;
    const headline = (typeof snap.narrative?.headline === "string" && snap.narrative.headline.trim())
      ? snap.narrative.headline.trim()
      : (typeof snap.themes?.[0]?.title === "string" && snap.themes![0].title!.trim() ? snap.themes![0].title!.trim() : null);
    if (!headline) continue;
    const summary = (typeof snap.narrative?.summary === "string" && snap.narrative.summary.trim()) ? snap.narrative.summary.trim() : null;
    visibleAnalysis.set(surveyId, { headline, summary, completedAtMs: msOf(run.completed_at as string | null) });
  }

  // ── Latest insights — a MIXED governed feed: analysis verdicts + strong
  //    deterministic findings + raw result distributions. Weak/generic findings
  //    ("opinion is split") are surfaced instead as their RAW RESULT card (more
  //    useful), and only STANDOUT findings/analysis can become the "Did you know?"
  //    hero (isHeroWorthy). All numbers server-owned; base gates intact; no AI. ─
  const insightItems: FeaturedFinding[] = [];
  for (const [surveyId, a] of visibleAnalysis) {
    const st = stateById.get(surveyId);
    insightItems.push({
      id: `analysis:${surveyId}`, kind: "analysis", questionKey: `${surveyId}#analysis`, source: "analysis",
      headline: a.headline, support: a.summary ?? undefined,
      surveyId, surveyName: st?.name ?? "Survey", reason: "New analysis",
      generatedAtMs: a.completedAtMs, generatedLabel: rel(a.completedAtMs, nowMs), activityMs: st?.activityMs ?? a.completedAtMs, href: findingsHref(surveyId),
    });
  }

  // Bounded probe: the most-active surveys WITHOUT a visible analysis. Each yields a
  // STRONG finding OR a raw result per question, plus any segment contrast. Capped.
  const topOpts = (q: SurveyQuestionEvidence) => [...q.options].sort((x, y) => y.count - x.count).slice(0, 4).map((o) => ({ label: o.label, pct: Math.round((o.percentage ?? 0) * 100) }));
  const probeCandidates = surveys
    .filter((s) => !visibleAnalysis.has(s.id) && (stateById.get(s.id)?.responses ?? 0) > 0)
    .sort((a, b) => (stateById.get(b.id)?.activityMs ?? 0) - (stateById.get(a.id)?.activityMs ?? 0))
    .slice(0, MAX_FEATURED_DETERMINISTIC);
  if (probeCandidates.length > 0) {
    const { data: probeRows } = await supabaseAdmin.from("surveys").select("id, questions, enabled_languages").in("id", probeCandidates.map((s) => s.id)).is("deleted_at", null);
    const probeById = new Map((probeRows ?? []).map((r) => [r.id as string, r]));
    const perSurvey = await Promise.all(probeCandidates.map(async (s): Promise<FeaturedFinding[]> => {
      try {
        const row = probeById.get(s.id);
        const questions = normaliseQuestions((row as { questions?: unknown })?.questions);
        if (questions.length === 0) return [];
        const enabledLanguages = Array.isArray((row as { enabled_languages?: unknown })?.enabled_languages) ? ((row as { enabled_languages: string[] }).enabled_languages) : [];
        const slugs = (campsBySurvey.get(s.id) ?? []).map((c) => c.slug).filter(Boolean);
        const results = await resolveDiscoverResults({ questions, enabledLanguages }, slugs, null);
        const segments = await resolveSurveySegmentEvidence({ questions }, slugs, results.mode, results.displayLanguage);
        const qEvidence: SurveyQuestionEvidence[] = results.questions.map((q) => ({ index: q.questionIndex, questionId: q.questionId, text: q.text, base: q.base, shown: q.shown, options: q.options }));
        const totalAnswered = qEvidence.reduce((acc, q) => acc + q.base, 0);
        const st = stateById.get(s.id);
        const activityMs = st?.activityMs ?? 0;
        if (findingsContext({ hasLiveCampaign: st?.collecting ?? false, totalAnswered }) === "none") return []; // below base → nothing
        const findings = buildSurveyFindings({ surveyName: s.name, mode: results.mode, questions: qEvidence, segments });
        const domByQ = new Map<number, SurveyFinding>();
        const segFindings: SurveyFinding[] = [];
        for (const f of findings) {
          const mi = /-(\d+)$/.exec(f.id);
          if (f.type === "dominant" && mi) domByQ.set(Number(mi[1]), f);
          else if (f.type === "market" || f.type === "device") segFindings.push(f);
        }
        const items: FeaturedFinding[] = [];
        // One item per question: a STRONG dominant finding, else the raw RESULT card.
        for (const q of qEvidence) {
          if (q.base < FINDING_MIN_BASE || q.options.length === 0) continue;
          const dist = topOpts(q);
          const key = `${s.id}#q${q.index}`;
          const dom = domByQ.get(q.index);
          if (dom) {
            const m = dom.metrics;
            items.push({
              id: `finding:${s.id}:${q.index}`, kind: "finding", findingType: "dominant", questionKey: key, source: "deterministic",
              headline: dom.title, support: dom.detail,
              metrics: (typeof m.option === "string" && typeof m.pct === "number") ? { option: m.option, pct: m.pct, runnerUp: m.runnerUp } : undefined,
              distribution: dist, base: q.base, surveyId: s.id, surveyName: s.name, reason: dom.tag, generatedAtMs: null, activityMs, href: findingsHref(s.id),
            });
          } else {
            items.push({
              id: `result:${s.id}:${q.index}`, kind: "result", questionKey: key, source: "deterministic",
              headline: q.text, distribution: dist, base: q.base, surveyId: s.id, surveyName: s.name, reason: "Result", generatedAtMs: null, activityMs, href: findingsHref(s.id),
            });
          }
        }
        // Segment contrasts (market/device) — genuine, base-gated group differences.
        for (const seg of segFindings) {
          items.push({
            id: `seg:${s.id}:${seg.id}`, kind: "finding", findingType: seg.type, questionKey: `${s.id}#${seg.id}`, source: "deterministic",
            headline: seg.title, support: seg.detail, base: seg.base, surveyId: s.id, surveyName: s.name, reason: seg.tag, generatedAtMs: null, activityMs, href: findingsHref(s.id),
          });
        }
        return items;
      } catch { return []; }
    }));
    for (const arr of perSurvey) insightItems.push(...arr);
  }
  const { hero, insights } = selectInsights(insightItems);

  // ── Live Now (effective collecting/live state; omitted by the UI when empty) ─
  const collectingStates = [...stateById.values()].filter((st) => st.collecting);
  const liveNow: LiveSurvey[] = selectLiveSurveys(
    collectingStates.map((st) => ({
      id: st.id, name: st.name, responses: st.responses, campaignCount: st.campaignCount,
      lastResponseLabel: rel(st.lastResponseMs, nowMs), activityMs: st.activityMs, href: surveyDashboardHref(st.id),
    })),
  );

  // ── Studies (discovery OBJECTS only; intersect-only membership) ─────────────
  const authIds = new Set(surveyIds);
  type StudyRow = { id: string; name: string | null; updated_at: string | null; dashboard_study_surveys?: { survey_id: string }[] };
  const studyRows = (studyRes.data ?? []) as StudyRow[];
  const studiesAll = studyRows
    .map((r) => ({ id: r.id, name: r.name ?? "Untitled study", memberIds: (r.dashboard_study_surveys ?? []).map((m) => m.survey_id).filter((id) => authIds.has(id)), updatedMs: msOf(r.updated_at) }))
    .filter((s) => s.memberIds.length > 0);

  // ── Latest activity — one salient event per survey + recent study touches ───
  const feedRaw: ResearchFeedItem[] = [];
  for (const s of surveys) {
    const st = stateById.get(s.id)!;
    const createdMs = createdMsById.get(s.id) ?? 0;
    const a = visibleAnalysis.get(s.id);
    if (a) {
      feedRaw.push({ id: `analysis:${s.id}`, kind: "analysis", title: s.name, detail: "New analysis available", reason: "Analysis generated", timestampMs: a.completedAtMs, timeLabel: rel(a.completedAtMs, nowMs), href: findingsHref(s.id) });
    } else if (st.collecting) {
      const ts = st.lastResponseMs || createdMs;
      feedRaw.push({ id: `collecting:${s.id}`, kind: "collecting", title: s.name, detail: st.responses > 0 ? `${st.responses.toLocaleString()} response${st.responses === 1 ? "" : "s"} · ${st.campaignCount} campaign${st.campaignCount === 1 ? "" : "s"}` : "Awaiting responses", reason: "Collecting now", timestampMs: ts, timeLabel: rel(st.lastResponseMs, nowMs), href: surveyDashboardHref(s.id) });
    } else if (st.responses > 0) {
      feedRaw.push({ id: `responses:${s.id}`, kind: "responses", title: s.name, detail: `${st.responses.toLocaleString()} response${st.responses === 1 ? "" : "s"}`, reason: "Recent responses", timestampMs: st.lastResponseMs, timeLabel: rel(st.lastResponseMs, nowMs), href: surveyDashboardHref(s.id) });
    } else if (createdMs > 0 && nowMs - createdMs < THIRTY_DAYS_MS) {
      feedRaw.push({ id: `new-survey:${s.id}`, kind: "new-survey", title: s.name, detail: "New survey", reason: "Recently added", timestampMs: createdMs, timeLabel: rel(createdMs, nowMs), href: surveyDashboardHref(s.id) });
    }
  }
  for (const st of studiesAll) {
    if (st.updatedMs === 0 || nowMs - st.updatedMs >= NINETY_DAYS_MS) continue; // only genuinely recent touches
    feedRaw.push({ id: `study-updated:${st.id}`, kind: "study-updated", title: st.name, detail: `${st.memberIds.length} survey${st.memberIds.length === 1 ? "" : "s"}`, reason: "Study updated", timestampMs: st.updatedMs, timeLabel: rel(st.updatedMs, nowMs), href: studyDashboardHref(st.id) });
  }
  const activity = selectActivity(feedRaw);

  // ── Explore (compact discovery — NOT the full index) ────────────────────────
  const exploreSurveys: ExploreItem[] = selectExplore(surveys.map((s) => {
    const st = stateById.get(s.id)!;
    return { id: s.id, name: s.name, href: surveyDashboardHref(s.id), meta: st.lifecycleLabel, activityMs: st.activityMs };
  }));
  const exploreStudies: ExploreItem[] = selectExplore(studiesAll.map((s) => ({
    id: s.id, name: s.name, href: studyDashboardHref(s.id), meta: `${s.memberIds.length} survey${s.memberIds.length === 1 ? "" : "s"}`, activityMs: s.updatedMs,
  })));

  // ── Research activity — "answers collected over time" (governed, scope-batched) ─
  // The SAME per-mode split as Total Answers so the chart reconciles with the metric:
  //   • studio-native → dashboard_answer_series (applied migration 196; real
  //     created_at, is_demo=false; bounded to the last 90 days),
  //   • historical    → the real recorded answers on `responses` (historicalAnswersDaily),
  // merged and turned into a continuous zero-filled daily axis. Real timestamps only;
  // days with no answers are genuine zeros. Each mode's read fires ONLY when that mode
  // has slugs — never per-survey. Rows without a timestamp simply don't appear (never
  // a fabricated date); the section hides when there is no timestamped activity.
  const windowFromIso = new Date(nowMs - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [studioDayRows, histDaily] = await Promise.all([
    studioSlugs.length
      ? supabaseAdmin.rpc("dashboard_answer_series", { p_campaign_ids: studioSlugs, p_from: windowFromIso, p_to: null, p_question_index: null }).then((r) => (r.error ? [] : (r.data ?? [])))
      : Promise.resolve([] as { bucket_hour: string; event_count: number }[]),
    historicalSlugs.length ? historicalAnswersDaily(historicalSlugs, windowFromIso) : Promise.resolve({} as Record<string, number>),
  ]);
  const answerDay = mergeCountMaps(
    foldHourToDay(studioDayRows as { bucket_hour: string; event_count: number }[]),
    histDaily,   // already keyed by UTC day
  );
  const activityPoints = buildDailyActivity(answerDay, nowMs);
  // Only surface the chart when the DEFAULT window has genuinely informative activity
  // (spread across ≥2 days AND above a small floor) — a flat/near-empty series hides.
  const researchActivity = activityWorthShowing(activityPoints) ? { points: activityPoints } : null;

  return NextResponse.json({
    context,
    accountShape: classifyAccount({ surveys: surveys.length, answers: answersTotal }),
    hero,
    liveNow,
    glance: { surveys: surveys.length, answers: answersTotal, live: collectingStates.length, analyses: visibleAnalysis.size },
    insights,
    reports: null, // no governed per-caller report listing exists yet — omit, never fake
    researchActivity,
    activity,
    explore: { surveys: exploreSurveys, studies: exploreStudies },
    totals: { surveys: surveys.length, studies: studiesAll.length },
  } satisfies DiscoverDashboardData);
}
