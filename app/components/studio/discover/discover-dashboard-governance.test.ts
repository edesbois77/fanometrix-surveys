import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Governance/structural guarantees for the Discover Dashboard. Asserts on source
// (the repo's UX-contract test pattern) so the entitlement gate, the "no model on
// render" invariant, the study-intelligence exclusion, the Reports omission and the
// base-gate reuse cannot silently regress. Deterministic ranking behaviour is
// covered separately in lib/studio/discover-dashboard.test.ts.

const HERE = dirname(fileURLToPath(import.meta.url));
const appDir = join(HERE, "..", "..", ".."); // discover → studio → components → app
const read = (rel: string) => readFileSync(join(HERE, rel), "utf8");

const route = readFileSync(join(appDir, "api/survey-studio/discover/dashboard/route.ts"), "utf8");
const view = read("DiscoverDashboard.tsx");
const hook = read("useDiscoverDashboard.ts");

test("Dashboard is entitlement-scoped — it resolves the governed scope and fails closed on empty", () => {
  assert.match(route, /resolveDashboardScope/);
  assert.match(route, /scope\.isEmpty/);
  // Analysis is read only within the entitled survey set.
  assert.match(route, /\.in\("survey_id", surveyIds\)/);
});

test("Survey Analysis headlines pass the SAME entitlement gate as the Findings page", () => {
  assert.match(route, /import \{ analysisScopeVisible \} from "@\/lib\/studio\/survey-analysis-service"/);
  // The gate is consulted BEFORE a headline is surfaced (continue/skip when hidden).
  assert.match(route, /analysisScopeVisible\(\{[\s\S]*?runCampaignScope:[\s\S]*?\}\)\)\s*continue/);
});

test("No model is ever invoked on Dashboard render — read-only, no generation entrypoints", () => {
  for (const banned of ["analyseSurvey", "completeJSON", "intelligence/openai", "runSurveyAnalysis"]) {
    assert.ok(!route.includes(banned), `route must not reference ${banned}`);
  }
  // The only analysis touch is a completed-run READ.
  assert.match(route, /survey_analysis_runs[\s\S]*?\.eq\("status", "completed"\)/);
});

test("Study Analysis / Study Findings intelligence is NOT surfaced (no Discover entitlement model)", () => {
  for (const banned of ["study-analysis-service", "study-finding-service", "getLatestStudyAnalysis", "listFindings", "study_analysis_runs", "study_findings", "survey_findings"]) {
    assert.ok(!route.includes(banned), `route must not surface study intelligence via ${banned}`);
  }
  // Studies appear only as discovery OBJECTS (dashboard_studies grouping).
  assert.match(route, /dashboard_studies/);
});

test("Reports are omitted — no report records are read", () => {
  for (const banned of ["study_reports", "partner_reports", "report-service", "listReports"]) {
    assert.ok(!route.includes(banned), `route must not read reports via ${banned}`);
  }
});

test("Deterministic findings reuse the existing base-gated engine — gates are not lowered", () => {
  assert.match(route, /import \{ buildSurveyFindings, findingsContext, FINDING_MIN_BASE[\s\S]*?\} from "@\/lib\/studio\/survey-findings-engine"/);
  // The Dashboard reuses the engine's gate (never lowers it): it only surfaces a
  // question at or above FINDING_MIN_BASE, and skips a survey below the evidence bar.
  assert.match(route, /q\.base < FINDING_MIN_BASE/);
  assert.match(route, /findingsContext\(\{ hasLiveCampaign: st\?\.collecting \?\? false, totalAnswered \}\) === "none"\) return \[\]/);
});

test("The client renders server output only — it never invokes a model or POSTs", () => {
  assert.ok(!view.includes("fetch("), "the view fetches nothing directly");
  assert.match(hook, /const URL = "\/api\/survey-studio\/discover\/dashboard"/);
  assert.ok(!hook.includes('method: "POST"'), "the hook only GETs");
  assert.ok(!hook.includes("/analysis"), "the hook never calls a generation endpoint");
});

test("Copy is the purposeful editorial line, not the old inventory line", () => {
  assert.match(view, /The latest from your research\./);
  assert.ok(!view.includes("What's happening across the research you can access"), "old inventory copy is gone");
  assert.match(view, /Latest insights/);
});

test("The Discover-level landing H1 is 'Overview' (object-level pages keep 'Dashboard')", () => {
  assert.match(view, /title="Overview"/);
  assert.ok(!/title="Dashboard"/.test(view), "the landing H1 is not 'Dashboard'");
});

test("'Total answers' uses the product's AUTHORITATIVE per-mode semantics, batched (no N+1)", () => {
  // Studio-native = a scoped response_answers count (real only).
  assert.match(route, /from\("response_answers"\)\.select\("id", \{ count: "exact", head: true \}\)\.in\("campaign_id", slugs\)\.eq\("is_demo", false\)/);
  // Historical = the progression-event union (answeredFromProgression) via the shared
  // primitive — NOT reinvented for Discover.
  assert.match(route, /from "@\/lib\/studio\/dashboard-metrics"/);
  assert.match(route, /HISTORICAL_ANSWER_EVENTS\.reduce\(/);
  // The two modes are partitioned (a survey is wholly one mode) — never mixed.
  assert.match(route, /partitionAnswerModes\(slugs, studioNativeSlugs\)/);
  assert.match(route, /answersTotal = studioAnswers \+ historicalAnswers/);
  // Historical progression is ONE scoped RPC over the historical slugs only — the
  // per-survey N+1 primitive (perQuestionAnswerCounts) is NOT used on the homepage.
  assert.ok(!route.includes("perQuestionAnswerCounts"), "no per-survey answer resolution");
  assert.match(route, /eventCountsFor\(historicalSlugs\)/);
});

test("Historical waves are never silently zero — historical slugs get progression-counted", () => {
  // The partition sends response_answers-absent slugs to the historical branch, and
  // that branch counts them (progression). Behaviour proven in the pure lib test.
  assert.match(route, /historicalSlugs\.length\)?\s*\{[\s\S]*?eventCountsFor\(historicalSlugs\)/);
});

test("Research Activity is governed, scope-batched, and reconciles with the metric (same per-mode split)", () => {
  // Studio-native answers-per-day via the APPLIED dashboard_answer_series (real
  // created_at, is_demo enforced in-RPC), historical via the progression-event series
  // — the SAME studio/historical partition as Total Answers, so the chart reconciles.
  assert.match(route, /import \{ eventCountsFor, HISTORICAL_ANSWER_EVENTS, historicalAnswersHourly, foldHourToDay, mergeCountMaps \} from "@\/lib\/studio\/dashboard-metrics"/);
  assert.match(route, /\.rpc\("dashboard_answer_series", \{ p_campaign_ids: studioSlugs/);
  assert.match(route, /historicalAnswersHourly\(historicalSlugs\)/);
  // Each mode's RPCs fire ONLY when that mode has slugs — never per-survey.
  assert.match(route, /studioSlugs\.length[\s\S]*?dashboard_answer_series/);
  assert.match(route, /historicalSlugs\.length \? historicalAnswersHourly/);
  // Bounded to the last ACTIVITY_WINDOW_DAYS via p_from; real UTC-day axis.
  assert.match(route, /p_from: windowFromIso/);
  assert.match(route, /buildDailyActivity\(answerDay, nowMs\)/);
  // Hidden when the series isn't worth showing (never a fabricated series).
  assert.match(route, /researchActivity = activityWorthShowing\(activityPoints\) \? \{ points: activityPoints \} : null/);
  // The UI renders the chart only when the governed series is present.
  assert.match(view, /researchActivity && researchActivity\.points\.length > 0 && \(/);
  assert.match(view, /function ResearchActivityChart/);
  // 0-baselined magnitude (honest), 7/30/90 windows.
  assert.match(view, /ACTIVITY_WINDOWS\.map/);
});

test("Mini-visuals + raw result cards use SERVER-owned distribution only (real labels + %, n preserved)", () => {
  // Distributions come from the engine's governed OptionResult (label + percentage), top ≤4.
  assert.match(route, /const topOpts = \(q: SurveyQuestionEvidence\) => \[\.\.\.q\.options\]\.sort[\s\S]*?\.slice\(0, 4\)\.map\(\(o\) => \(\{ label: o\.label, pct: Math\.round\(\(o\.percentage \?\? 0\) \* 100\) \}\)\)/);
  // A raw RESULT card is emitted for a question WITHOUT a strong finding (server-owned,
  // never a client-inferred claim), carrying the question's own base.
  assert.match(route, /kind: "result"[\s\S]*?distribution: dist, base: q\.base/);
  // The UI renders bars only when the item actually carries a distribution.
  assert.match(view, /f\.distribution && f\.distribution\.length >= 2 \?/);
  assert.match(view, /function DistributionBars/);
  // Bars are a full 0–100 scale (no misleading truncation).
  assert.match(view, /Math\.min\(100, Math\.max\(0, it\.pct\)\)/);
});

test("At-a-glance copy is user-meaningful (Surveys analysed, not the 'Analyses' implementation term)", () => {
  assert.match(view, /label="Surveys analysed"/);
  assert.ok(!view.includes('label="Analyses"'), "no bare 'Analyses' implementation label");
  assert.match(view, /label="Total answers" value=\{nf\(glance\.answers\)\} caption="Questions answered"/);
  assert.ok(!view.includes('label="Responses collected"'), "answers metric is not mislabelled as responses");
});

test("At-a-glance metrics are caller-scoped and truthful (surveys/answers/live/analyses)", () => {
  assert.match(route, /glance:\s*\{ surveys: surveys\.length, answers: answersTotal, live: collectingStates\.length, analyses: visibleAnalysis\.size \}/);
  // 'live' is the authoritative effective-collecting count, not stored status.
  assert.match(route, /collectingStates = \[\.\.\.stateById\.values\(\)\]\.filter\(\(st\) => st\.collecting\)/);
  // No unfounded "New findings" metric (no defensible unread/window definition exists).
  assert.ok(!view.includes("New findings"), "no 'New findings' metric label");
});

test("Hero worthiness + no duplication — the hero is a STRONG insight, excluded from the feed", () => {
  // The route delegates hero + feed to selectInsights (hero = strongest heroWorthy).
  assert.match(route, /const \{ hero, insights \} = selectInsights\(insightItems\)/);
  // dedup + per-survey cap + hero worthiness are proven in the pure lib test.
});

test("Latest insights is a MIXED feed (analysis + strong findings + raw results), weak findings become results", () => {
  assert.match(route, /kind: "analysis"/);
  assert.match(route, /kind: "finding", findingType: "dominant"/);
  assert.match(route, /kind: "result"/);
  // A question with no STRONG finding is surfaced as its raw distribution, not a weak sentence.
  assert.match(route, /const dom = domByQ\.get\(q\.index\);\s*\n\s*if \(dom\) \{[\s\S]*?\} else \{[\s\S]*?kind: "result"/);
});

test("From Fanometrix reuses the EXISTING governed /api/insights (no new schema/entitlement)", () => {
  const hook = read("useDiscoverContent.ts");
  assert.match(hook, /const URL = "\/api\/insights"/);
  assert.ok(!hook.includes('method: "POST"'), "read-only");
  // The route does NOT fetch editorial content itself — it stays separate + governed.
  assert.ok(!route.includes("insights-access") && !route.includes("/api/insights"), "editorial content is not mixed into per-survey scope");
  // Section renders only what the governed endpoint returns.
  assert.match(view, /function FromFanometrix/);
});

test("Research Activity is conditional on account shape (light/empty users get a chart-free page)", () => {
  assert.match(view, /accountShape === "established" && researchActivity/);
  assert.match(route, /accountShape: classifyAccount\(\{ surveys: surveys\.length, answers: answersTotal \}\)/);
});

test("Research Activity also hides a flat/meaningless series (activityWorthShowing gate)", () => {
  assert.match(route, /researchActivity = activityWorthShowing\(activityPoints\) \? \{ points: activityPoints \} : null/);
});

test("Live Now uses a motion-safe dot (reduced-motion → static)", () => {
  assert.match(view, /motion-safe:animate-ping/);
  assert.match(view, /function LivePill/);
});

test("Live Now is conditional and driven by effective status (UI hides it when empty)", () => {
  assert.match(view, /liveNow\.length > 0 && \(/);
  assert.match(route, /liveNow: LiveSurvey\[\] = selectLiveSurveys/);
});

test("Reports are surfaced only through governed access — omitted (reports: null) in V1", () => {
  assert.match(route, /reports: null/);
  // The UI renders the section only when a governed listing is present AND non-empty.
  assert.match(view, /reports && reports\.length > 0 && \(/);
});

test("Latest activity is value-first selected and capped (secondary to intelligence)", () => {
  assert.match(route, /const activity = selectActivity\(feedRaw\)/);
});
