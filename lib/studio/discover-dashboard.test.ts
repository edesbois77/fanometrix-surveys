import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rankResearchFeed, selectActivity, selectInsights, isHeroWorthy, insightStrength, classifyAccount,
  selectLiveSurveys, selectExplore, partitionAnswerModes, buildDailyActivity, activityWorthShowing,
  INSIGHTS_MAX, INSIGHTS_PER_SURVEY, ACTIVITY_MAX, ACTIVITY_MIN_TOTAL, EXPLORE_MAX,
  type ActivityPoint,
  type ResearchFeedItem, type FeaturedFinding, type LiveSurvey, type ExploreItem,
} from "./discover-dashboard";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const T = 1_700_000_000_000; // fixed base epoch — NEVER Date.now(); ranking is pure.

const feed = (over: Partial<ResearchFeedItem>): ResearchFeedItem => ({
  id: over.id ?? "x", kind: over.kind ?? "responses", title: over.title ?? "Survey",
  reason: over.reason ?? "Recent responses", timestampMs: over.timestampMs ?? T,
  timeLabel: over.timeLabel ?? null, href: over.href ?? "/x", detail: over.detail,
});
const finding = (over: Partial<FeaturedFinding>): FeaturedFinding => ({
  id: over.id ?? "f", kind: over.kind ?? "finding", findingType: over.findingType, questionKey: over.questionKey,
  source: over.source ?? "deterministic", headline: over.headline ?? "Headline",
  metrics: over.metrics, distribution: over.distribution, base: over.base,
  surveyId: over.surveyId ?? "s", surveyName: over.surveyName ?? "Survey", reason: over.reason ?? "Finding",
  generatedAtMs: over.generatedAtMs ?? null, activityMs: over.activityMs ?? T, href: over.href ?? "/x",
});
const liveS = (over: Partial<LiveSurvey>): LiveSurvey => ({
  id: over.id ?? "s", name: over.name ?? "Survey", responses: over.responses ?? 0,
  campaignCount: over.campaignCount ?? 1, lastResponseLabel: over.lastResponseLabel ?? null,
  activityMs: over.activityMs ?? T, href: over.href ?? "/x",
});
const explore = (over: Partial<ExploreItem>): ExploreItem => ({
  id: over.id ?? "s", name: over.name ?? "Survey", href: over.href ?? "/x", meta: over.meta, activityMs: over.activityMs ?? T,
});

// ── Activity: VALUE class first, then freshness (the key refinement) ─────────
test("a meaningful event is NOT outranked by a mundane event that merely happened later", () => {
  const staleAnalysis = feed({ id: "ana", kind: "analysis", timestampMs: T - 5 * DAY });
  const freshResponses = feed({ id: "resp", kind: "responses", timestampMs: T - 1 * DAY });
  // value-first: analysis is kept/ordered ahead of a newer 'responses' event.
  assert.deepEqual(rankResearchFeed([freshResponses, staleAnalysis]).map((i) => i.id), ["ana", "resp"]);
});

test("selectActivity keeps highest-VALUE events (crowd-out proof) then displays chronologically", () => {
  const analysisOld = feed({ id: "ana", kind: "analysis", timestampMs: T - 10 * DAY });
  const collectingMid = feed({ id: "col", kind: "collecting", timestampMs: T - 3 * DAY });
  // ACTIVITY_MAX newer-but-mundane response events that must NOT crowd out the above.
  const noise = Array.from({ length: ACTIVITY_MAX }, (_, i) => feed({ id: `resp${i}`, kind: "responses", timestampMs: T - (i * 60_000) }));
  const out = selectActivity([...noise, analysisOld, collectingMid]);
  assert.equal(out.length, ACTIVITY_MAX);
  assert.ok(out.some((i) => i.id === "ana"), "the analysis event survives selection");
  assert.ok(out.some((i) => i.id === "col"), "the collecting event survives selection");
  // Displayed newest-first.
  const ts = out.map((i) => i.timestampMs);
  assert.deepEqual(ts, [...ts].sort((a, b) => b - a));
});

test("within a value class, freshness orders; ties break by id — fully deterministic", () => {
  const a = feed({ id: "a", kind: "collecting", timestampMs: T - 2 * DAY });
  const b = feed({ id: "b", kind: "collecting", timestampMs: T - 1 * DAY });
  assert.deepEqual(rankResearchFeed([a, b]).map((i) => i.id), ["b", "a"]);
  assert.deepEqual(rankResearchFeed([b, a]).map((i) => i.id), ["b", "a"]); // input-order-independent
});

// ── DID YOU KNOW? hero-worthiness (only STANDOUT insights qualify) ────────────
test("weak/generic findings are NEVER hero-worthy; standout findings + analyses are", () => {
  assert.equal(isHeroWorthy(finding({ kind: "finding", findingType: "divided" })), false, "'opinion is split' excluded");
  assert.equal(isHeroWorthy(finding({ kind: "finding", findingType: "leading" })), false, "thin lead excluded");
  assert.equal(isHeroWorthy(finding({ kind: "finding", findingType: "minority" })), false);
  assert.equal(isHeroWorthy(finding({ kind: "finding", findingType: "pattern" })), false);
  assert.equal(isHeroWorthy(finding({ kind: "finding", findingType: "completion" })), false);
  assert.equal(isHeroWorthy(finding({ kind: "result" })), false, "a raw result is not a 'did you know?' claim");
  assert.equal(isHeroWorthy(finding({ kind: "finding", findingType: "dominant" })), true, "a standout majority qualifies");
  assert.equal(isHeroWorthy(finding({ kind: "finding", findingType: "market" })), true, "a segment contrast qualifies");
  assert.equal(isHeroWorthy(finding({ kind: "analysis", headline: "Fans see FedEx as a natural fit" })), true);
  assert.equal(isHeroWorthy(finding({ kind: "analysis", headline: "Opinion is split on the sponsorship" })), false, "a generic analysis verdict is not hero material");
});

test("no hero when nothing is strong — a feed of only weak items yields hero=null", () => {
  const items = [
    finding({ id: "div", kind: "finding", findingType: "divided", questionKey: "s#q0" }),
    finding({ id: "res", kind: "result", questionKey: "s#q1", distribution: [{ label: "A", pct: 40 }, { label: "B", pct: 35 }] }),
  ];
  const { hero, insights } = selectInsights(items);
  assert.equal(hero, null, "no manufactured hero");
  assert.equal(insights.length, 2, "weak items still populate the feed");
});

// ── Mixed Latest Insights ranking + dedup + per-survey cap ───────────────────
test("strength ordering: analysis > standout finding > strong raw result", () => {
  const analysis = insightStrength(finding({ kind: "analysis" }));
  const dominant = insightStrength(finding({ kind: "finding", findingType: "dominant", metrics: { option: "A", pct: 70, runnerUp: { option: "B", pct: 10 } } }));
  const result = insightStrength(finding({ kind: "result", distribution: [{ label: "A", pct: 44 }] }));
  const divided = insightStrength(finding({ kind: "finding", findingType: "divided" }));
  assert.ok(analysis > dominant, "analysis leads");
  assert.ok(dominant > result, "a standout finding beats a raw result");
  assert.ok(result > divided, "a strong raw result beats a weak generic finding");
});

test("hero is the strongest heroWorthy item and is never duplicated in the feed", () => {
  const dom = finding({ id: "dom", kind: "finding", findingType: "dominant", questionKey: "s1#q0", surveyId: "s1", metrics: { option: "A", pct: 72 } });
  const res = finding({ id: "res", kind: "result", questionKey: "s2#q0", surveyId: "s2", distribution: [{ label: "A", pct: 44 }] });
  const { hero, insights } = selectInsights([res, dom]);
  assert.equal(hero?.id, "dom");
  assert.ok(!insights.some((i) => i.id === "dom"), "hero not repeated below");
});

test("one question never appears twice (dedup by questionKey) and one survey can't swamp", () => {
  // same question surfaced as both a finding and a result → only the stronger survives.
  const asFinding = finding({ id: "f", kind: "finding", findingType: "dominant", questionKey: "s1#q0", surveyId: "s1", metrics: { option: "A", pct: 80 } });
  const asResult = finding({ id: "r", kind: "result", questionKey: "s1#q0", surveyId: "s1", distribution: [{ label: "A", pct: 80 }] });
  // many more items from ONE survey to test the per-survey cap.
  const swamp = Array.from({ length: 6 }, (_, i) => finding({ id: `sw${i}`, kind: "result", questionKey: `s1#q${i + 1}`, surveyId: "s1", distribution: [{ label: "A", pct: 40 - i }] }));
  const { hero, insights } = selectInsights([asFinding, asResult, ...swamp]);
  const all = [hero, ...insights].filter(Boolean) as FeaturedFinding[];
  assert.ok(!all.some((i) => i.id === "r"), "the duplicate question (result form) is dropped — finding won");
  assert.ok(all.filter((i) => i.surveyId === "s1").length <= INSIGHTS_PER_SURVEY, "one survey cannot swamp");
});

test("Latest insights is capped to INSIGHTS_MAX across many surveys", () => {
  const items = Array.from({ length: INSIGHTS_MAX + 5 }, (_, i) => finding({ id: `o${i}`, kind: "result", questionKey: `s${i}#q0`, surveyId: `s${i}`, distribution: [{ label: "A", pct: 40 }] }));
  const { insights } = selectInsights(items);
  assert.ok(insights.length <= INSIGHTS_MAX);
});

// ── Account shape ────────────────────────────────────────────────────────────
test("classifyAccount: empty / light / established by governed counts", () => {
  assert.equal(classifyAccount({ surveys: 0, answers: 0 }), "empty");
  assert.equal(classifyAccount({ surveys: 1, answers: 40 }), "light");
  assert.equal(classifyAccount({ surveys: 5, answers: 50 }), "light", "few answers → still light even with several surveys");
  assert.equal(classifyAccount({ surveys: 3, answers: 500 }), "established");
});

// ── Live / Explore ───────────────────────────────────────────────────────────
test("selectLiveSurveys orders by activity and caps", () => {
  const surveys = Array.from({ length: 8 }, (_, i) => liveS({ id: `s${i}`, name: `S${i}`, activityMs: T - i * DAY }));
  const out = selectLiveSurveys(surveys);
  assert.equal(out[0].id, "s0");
  assert.ok(out.length <= surveys.length);
});

test("selectExplore orders by activity and caps to EXPLORE_MAX", () => {
  const items = Array.from({ length: EXPLORE_MAX + 3 }, (_, i) => explore({ id: `s${i}`, name: `S${i}`, activityMs: T - i * DAY }));
  const out = selectExplore(items);
  assert.equal(out.length, EXPLORE_MAX);
  assert.equal(out[0].id, "s0");
});

test("empty inputs degrade to empty outputs (no throw, no fabrication)", () => {
  assert.deepEqual(selectActivity([]), []);
  assert.deepEqual(selectInsights([]), { hero: null, insights: [] });
  assert.deepEqual(selectLiveSurveys([]), []);
  assert.deepEqual(selectExplore([]), []);
});

// ── Total Answers: per-mode partition (studio-native vs historical) ──────────
test("historical slugs (no response_answers) are identified for progression counting — NEVER silently zero", () => {
  const authorised = ["studioA", "studioB", "histFedExV1", "histFedExV2"];
  const studioNative = ["studioA", "studioB"]; // only these appear in response_answers
  const { studioSlugs, historicalSlugs } = partitionAnswerModes(authorised, studioNative);
  assert.deepEqual(studioSlugs, ["studioA", "studioB"]);
  // The FedEx waves are historical → they will be progression-counted, not dropped.
  assert.deepEqual(historicalSlugs, ["histFedExV1", "histFedExV2"]);
});

test("a studio-native-only scope has no historical slugs (studio count is the whole total)", () => {
  const authorised = ["a", "b", "c"];
  const { studioSlugs, historicalSlugs } = partitionAnswerModes(authorised, ["a", "b", "c"]);
  assert.deepEqual(studioSlugs, authorised);
  assert.deepEqual(historicalSlugs, []);
});

test("a historical-only scope routes every slug to progression counting (no response_answers rows)", () => {
  const authorised = ["h1", "h2"];
  const { studioSlugs, historicalSlugs } = partitionAnswerModes(authorised, []); // none in response_answers
  assert.deepEqual(studioSlugs, []);
  assert.deepEqual(historicalSlugs, ["h1", "h2"]); // → counted via progression, not zero
});

test("partition is entitlement-bounded: a studio-native signal outside the authorised set never adds slugs", () => {
  const authorised = ["a", "b"];
  const { studioSlugs, historicalSlugs } = partitionAnswerModes(authorised, ["a", "zzz-not-authorised"]);
  assert.deepEqual(studioSlugs, ["a"]);       // "zzz" is ignored — only authorised slugs are ever partitioned
  assert.deepEqual(historicalSlugs, ["b"]);
  assert.ok(![...studioSlugs, ...historicalSlugs].includes("zzz-not-authorised"));
});

// ── Research activity: continuous, zero-filled, real-date daily axis ─────────
const END = Date.UTC(2026, 7, 18, 12, 0, 0); // 2026-08-18T12:00Z (fixed; never Date.now)

test("buildDailyActivity yields a continuous window ending on endMs's UTC day, oldest→newest", () => {
  const pts = buildDailyActivity({ "2026-08-18": 5, "2026-08-16": 3 }, END, 4);
  assert.deepEqual(pts.map((p) => p.date), ["2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18"]);
  assert.deepEqual(pts.map((p) => p.answers), [0, 3, 0, 5]); // gaps are ZERO, never fabricated
});

test("buildDailyActivity length equals the window and is deterministic", () => {
  assert.equal(buildDailyActivity({}, END, 30).length, 30);
  assert.equal(buildDailyActivity({}, END, 7).length, 7);
  assert.deepEqual(buildDailyActivity({ "2026-08-18": 9 }, END, 2), buildDailyActivity({ "2026-08-18": 9 }, END, 2));
});

test("buildDailyActivity never invents activity: an all-empty map is all zeros", () => {
  const pts = buildDailyActivity({}, END, 5);
  assert.ok(pts.every((p) => p.answers === 0));
});

test("buildDailyActivity ignores counts outside the window (no leakage of old dates)", () => {
  const pts = buildDailyActivity({ "2020-01-01": 999, "2026-08-18": 4 }, END, 3);
  assert.equal(pts.reduce((a, p) => a + p.answers, 0), 4); // the 2020 count is outside → excluded
});

// ── activityWorthShowing (hide flat/meaningless series, keep genuine patterns) ──
const days = (spec: number[]): ActivityPoint[] => spec.map((answers, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, answers }));

test("a flat/empty series is NOT worth showing", () => {
  assert.equal(activityWorthShowing(days([0, 0, 0, 0, 0])), false);
});
test("a single spike is NOT worth showing (needs ≥2 active days)", () => {
  assert.equal(activityWorthShowing(days([0, 0, 40, 0, 0])), false);
});
test("below the small total floor is NOT worth showing", () => {
  assert.equal(activityWorthShowing(days([1, 0, 2, 0, 1])), false); // total 4 < floor
});
test("a genuine low-but-multi-day pattern IS worth showing (low volume alone never hides)", () => {
  const pts = days([3, 0, 4, 2, 0, 5]); // 4 active days, total 14 ≥ floor
  assert.ok(14 >= ACTIVITY_MIN_TOTAL);
  assert.equal(activityWorthShowing(pts), true);
});
test("a strong multi-day series IS worth showing", () => {
  assert.equal(activityWorthShowing(days([12, 18, 9, 22, 30])), true);
});
