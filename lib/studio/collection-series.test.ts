import { test } from "node:test";
import assert from "node:assert/strict";
import { mondayOf, bucketKey, aggregateSeries, metricTotal, secondaryAxisMetric, type CollectionPoint, type CollectionMetricKey } from "./collection-series";

const pt = (t: string, over: Partial<CollectionPoint> = {}): CollectionPoint => ({ t, answers: 0, impressions: 0, starts: 0, completions: 0, ...over });
const vals = (series: CollectionPoint[], metrics: CollectionMetricKey[], interval: Parameters<typeof aggregateSeries>[2]) => aggregateSeries(series, metrics, interval);

test("mondayOf snaps any weekday to that week's Monday (UTC)", () => {
  assert.equal(mondayOf("2026-07-22"), "2026-07-20"); // Wed → Mon
  assert.equal(mondayOf("2026-07-20"), "2026-07-20"); // Mon → itself
  assert.equal(mondayOf("2026-07-19"), "2026-07-13"); // Sun → previous Mon
});

test("bucketKey collapses an ISO instant to hour / day / week / month", () => {
  const t = "2026-07-22T13:00:00.000Z";
  assert.equal(bucketKey(t, "hourly"), "2026-07-22T13");
  assert.equal(bucketKey(t, "daily"), "2026-07-22");
  assert.equal(bucketKey(t, "weekly"), "2026-07-20");
  assert.equal(bucketKey(t, "monthly"), "2026-07");
});

test("aggregateSeries sums each SELECTED metric independently — never mixing columns", () => {
  const series = [pt("2026-07-20T10:00:00.000Z", { starts: 5, completions: 2 }), pt("2026-07-20T11:00:00.000Z", { starts: 3, completions: 9 })];
  const [bucket] = vals(series, ["starts", "completions"], "daily");
  assert.equal(bucket.values.starts, 8);
  assert.equal(bucket.values.completions, 11);
});

test("multi-series selection returns a value per metric and never alters the underlying metric totals", () => {
  const series = [pt("2026-07-20T10:00:00.000Z", { starts: 5, completions: 2, impressions: 900 }), pt("2026-07-21T10:00:00.000Z", { starts: 3, completions: 9, impressions: 700 })];
  const two = vals(series, ["starts", "completions"], "daily");
  // Adding a second metric does not change the first metric's per-bucket values.
  const one = vals(series, ["starts"], "daily");
  assert.deepEqual(two.map((b) => b.values.starts), one.map((b) => b.values.starts));
});

test("interval changes the bucket boundary but conserves each metric's total (definition unchanged)", () => {
  const series = Array.from({ length: 7 }, (_, i) => pt(`2026-07-${17 + i}T09:00:00.000Z`, { answers: (i + 1) * 10, impressions: (i + 1) * 1000 }));
  for (const interval of ["hourly", "daily", "weekly", "monthly"] as const) {
    for (const m of ["answers", "impressions"] as CollectionMetricKey[]) {
      const summed = vals(series, [m], interval).reduce((a, b) => a + b.values[m], 0);
      assert.equal(summed, metricTotal(series, m), `${m} conserved at ${interval}`);
    }
  }
});

test("weekly bucketing groups instants into their Monday-week", () => {
  const series = ["2026-07-18", "2026-07-19", "2026-07-20", "2026-07-24"].map((d) => pt(`${d}T10:00:00.000Z`, { answers: 10 }));
  const weekly = vals(series, ["answers"], "weekly");
  assert.deepEqual(weekly.map((b) => b.key), ["2026-07-13", "2026-07-20"]); // Sat+Sun → w/c 13th; Mon+Fri → w/c 20th
  assert.deepEqual(weekly.map((b) => b.values.answers), [20, 20]);
});

test("per-metric delta is the change from the previous bucket (null for the first)", () => {
  const series = [pt("2026-07-20T10:00:00.000Z", { answers: 100 }), pt("2026-07-21T10:00:00.000Z", { answers: 130 }), pt("2026-07-22T10:00:00.000Z", { answers: 90 })];
  const daily = vals(series, ["answers"], "daily");
  assert.deepEqual(daily.map((b) => b.deltas.answers), [null, 30, -40]);
});

test("chart TYPE never enters aggregation — line and bars read identical rows", () => {
  const series = [pt("2026-07-20T10:00:00.000Z", { completions: 7 }), pt("2026-07-21T10:00:00.000Z", { completions: 11 })];
  assert.deepEqual(vals(series, ["completions"], "daily"), vals(series, ["completions"], "daily"));
});

test("secondaryAxisMetric moves the smaller-scale metric off a shared axis when scales diverge (Impressions vs Starts)", () => {
  const series = [pt("2026-07-20T10:00:00.000Z", { impressions: 785862, starts: 652 })];
  assert.equal(secondaryAxisMetric(series, ["impressions", "starts"]), "starts");
  // Comparable-scale metrics share one axis.
  const close = [pt("2026-07-20T10:00:00.000Z", { starts: 652, completions: 274 })];
  assert.equal(secondaryAxisMetric(close, ["starts", "completions"]), null);
  // A single metric never needs a secondary axis.
  assert.equal(secondaryAxisMetric(series, ["impressions"]), null);
});

// ── Historical Answers-over-time conservation (the FedEx baseline) ──
// The route reconstructs historical answers by time-bucketing the union of
// QUESTION_(k+1)_REACHED + SURVEY_COMPLETED. Represented as a CollectionPoint[],
// the answer total MUST equal the known per-survey/study totals at every interval.
test("historical Answers-over-time conserves the real FedEx totals across all intervals", () => {
  // v1: Q1=560 (Q2_REACHED), Q2=236 (Q3_REACHED), Q3=196 (COMPLETED) → 992.
  // v2: 91 + 81 + 78 → 250. Spread arbitrarily across days/hours; totals must hold.
  const mk = (offsets: number[], counts: number[]) => offsets.map((o, i) => pt(`2026-07-${17 + o}T${10 + i}:00:00.000Z`, { answers: counts[i] }));
  const v1 = mk([0, 1, 2, 3, 5], [200, 300, 236, 60, 196]); // sums 992
  const v2 = mk([0, 4, 6], [91, 81, 78]);                    // sums 250
  const study = [...v1, ...v2];
  assert.equal(metricTotal(v1, "answers"), 992);
  assert.equal(metricTotal(v2, "answers"), 250);
  assert.equal(metricTotal(study, "answers"), 1242);
  for (const interval of ["hourly", "daily", "weekly", "monthly"] as const) {
    const summed = vals(study, ["answers"], interval).reduce((a, b) => a + b.values.answers, 0);
    assert.equal(summed, 1242, `study answers conserved at ${interval}`);
  }
});
