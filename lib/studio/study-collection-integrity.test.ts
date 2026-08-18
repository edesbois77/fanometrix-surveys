import { test } from "node:test";
import assert from "node:assert/strict";
import { studyPreview } from "@/app/components/studio/discover/performance-fixtures";
import { aggregateSeries, metricTotal, type CollectionMetricKey } from "./collection-series";

// The FedEx two-survey preview mirrors the REAL study — these guards fail loudly if
// anyone regresses the baseline back toward completion-count proxies (196/196/196).
const fedex = studyPreview("two-surveys");

test("FedEx preview preserves the authoritative answer totals (1,242 = 992 + 250)", () => {
  assert.equal(fedex.topline.answersCollected, 1242);
  const [v1, v2] = [...fedex.surveys].sort((a, b) => b.answersCollected - a.answersCollected);
  assert.equal(v1.answersCollected, 992);
  assert.equal(v2.answersCollected, 250);
  // Per-position is partial-aware (decays), never a flat completion proxy.
  assert.deepEqual(v1.answersByPosition, [560, 236, 196]);
  assert.deepEqual(v2.answersByPosition, [91, 81, 78]);
  assert.notEqual(v1.answersByPosition[0], v1.answersByPosition[2]);
});

test("FedEx study-level per-position sums to Q1 651 / Q2 317 / Q3 274 = 1,242", () => {
  assert.deepEqual(fedex.engagement.perPosition, [
    { position: 1, answers: 651 }, { position: 2, answers: 317 }, { position: 3, answers: 274 },
  ]);
  assert.equal(fedex.engagement.perPosition.reduce((a, p) => a + p.answers, 0), 1242);
});

test("FedEx collection series conserves 1,242 answers at every interval (bucket, not definition)", () => {
  const series = fedex.collectionSeries!;
  assert.equal(metricTotal(series, "answers"), 1242);
  for (const interval of ["hourly", "daily", "weekly", "monthly"] as const) {
    const summed = aggregateSeries(series, ["answers"], interval).reduce((a, b) => a + b.values.answers, 0);
    assert.equal(summed, 1242, `answers conserved at ${interval}`);
  }
  // Historical study → Answers are hourly-capable.
  assert.equal(fedex.answersHourly, true);
  assert.equal(fedex.collectionGranularity, "hour");
});

test("FedEx market shares sum to the study answer total (donut composition is honest)", () => {
  const total = fedex.topline.answersCollected;
  const marketSum = fedex.markets.reduce((a, m) => a + m.answers, 0);
  assert.equal(marketSum, total); // shares are answers/total → sum to exactly 100%
  const shares = fedex.markets.map((m) => m.answers / total);
  assert.ok(Math.abs(shares.reduce((a, s) => a + s, 0) - 1) < 1e-9);
});

test("engagement progression stays ordered Started → Q1…Q3 → Completed with correct bookends", () => {
  const keys = fedex.engagement.progression.map((s) => s.key);
  assert.deepEqual(keys, ["started", "q1", "q2", "q3", "completed"]);
  assert.equal(fedex.engagement.progression[0].count, fedex.topline.starts);
  assert.equal(fedex.engagement.progression.at(-1)!.count, fedex.topline.completions);
});

test("Interaction Rate formats to two decimal places (presentation only, calc unchanged)", () => {
  // startRate = starts ÷ impressions; the summary renders it at 2dp.
  const r = fedex.engagement.startRate!;
  assert.equal(r, 652 / 785862);
  assert.equal(`${(r * 100).toFixed(2)}%`, "0.08%");
});

test("Market donut order is strictly descending by answers (France → Italy) and shares sum to total", () => {
  // The donut sorts descending and draws clockwise from 12 o'clock; the list matches.
  const ordered = [...fedex.markets].sort((a, b) => b.answers - a.answers);
  assert.deepEqual(ordered.map((m) => m.label), ["France", "Germany", "United Kingdom", "Spain", "Italy"]);
  for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i].answers <= ordered[i - 1].answers);
  assert.equal(fedex.markets.reduce((a, m) => a + m.answers, 0), fedex.topline.answersCollected);
});

test("FedEx preview carries answer-derived Research Findings distinct from the 1,242 partial counts", () => {
  const f = fedex.researchFindings ?? [];
  assert.equal(f.length, 3);
  assert.equal(f[0].emphasis, "primary");
  assert.ok(f.every((x) => x.base === 274), "findings use completed answer VALUES (n=274), not partial counts (1,242)");
  assert.notEqual(fedex.topline.answersCollected, f[0].base);
});

test("multi-metric collection: Starts and Completions aggregate independently and are not additive", () => {
  const series = fedex.collectionSeries!;
  const both = aggregateSeries(series, ["starts", "completions"] as CollectionMetricKey[], "daily");
  // Each bucket keeps two distinct values (grouped, never summed into one).
  for (const b of both) assert.notEqual(b.values.starts + b.values.completions, undefined);
  assert.equal(both.reduce((a, b) => a + b.values.starts, 0), metricTotal(series, "starts"));
  assert.equal(both.reduce((a, b) => a + b.values.completions, 0), metricTotal(series, "completions"));
});
