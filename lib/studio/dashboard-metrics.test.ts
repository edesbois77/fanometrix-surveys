import { test } from "node:test";
import assert from "node:assert/strict";
import { answeredFromProgression, foldHourToDay, mergeCountMaps, HISTORICAL_ANSWER_EVENTS } from "./dashboard-metrics";

const ev = (o: Record<string, number>) => new Map(Object.entries(o));

test("answeredFromProgression maps QUESTION_(k+1)_REACHED to Qk, SURVEY_COMPLETED to the final position", () => {
  // Real FedEx v1 (questionCount 3): Q1=560, Q2=236, Q3=196.
  const counts = ev({ QUESTION_2_REACHED: 560, QUESTION_3_REACHED: 236, SURVEY_COMPLETED: 196 });
  assert.deepEqual(answeredFromProgression(counts, 3), [560, 236, 196]);
});

test("answeredFromProgression is partial-aware — decays monotonically, not flat at completions", () => {
  // Real FedEx v2 (questionCount 3): [91, 81, 78] — NOT a flat 78/78/78.
  const counts = ev({ QUESTION_2_REACHED: 91, QUESTION_3_REACHED: 81, SURVEY_COMPLETED: 78 });
  const out = answeredFromProgression(counts, 3);
  assert.deepEqual(out, [91, 81, 78]);
  assert.notEqual(out[0], out[2], "Q1 must not equal completions (that was the flat-count bug)");
});

test("answeredFromProgression handles a 5-question studio-shaped survey", () => {
  const counts = ev({ QUESTION_2_REACHED: 500, QUESTION_3_REACHED: 460, QUESTION_4_REACHED: 430, QUESTION_5_REACHED: 410, SURVEY_COMPLETED: 400 });
  assert.deepEqual(answeredFromProgression(counts, 5), [500, 460, 430, 410, 400]);
});

test("answeredFromProgression clamps question count to [0,5]", () => {
  assert.deepEqual(answeredFromProgression(ev({}), 0), []);
  assert.equal(answeredFromProgression(ev({ SURVEY_COMPLETED: 1 }), 9).length, 5);
});

test("answeredFromProgression treats missing / non-positive / non-numeric events as 0", () => {
  assert.deepEqual(answeredFromProgression(ev({}), 3), [0, 0, 0]);
  assert.deepEqual(answeredFromProgression(ev({ QUESTION_2_REACHED: -5, QUESTION_3_REACHED: NaN, SURVEY_COMPLETED: 10 }), 3), [0, 0, 10]);
});

test("single-question survey answers position 1 from completions", () => {
  assert.deepEqual(answeredFromProgression(ev({ SURVEY_COMPLETED: 42, QUESTION_2_REACHED: 999 }), 1), [42]);
});

test("foldHourToDay collapses hour buckets into UTC day totals", () => {
  const rows = [
    { bucket_hour: "2026-08-10T09:00:00Z", event_count: 5 },
    { bucket_hour: "2026-08-10T14:00:00Z", event_count: 3 },
    { bucket_hour: "2026-08-11T00:00:00Z", event_count: 7 },
  ];
  assert.deepEqual(foldHourToDay(rows), { "2026-08-10": 8, "2026-08-11": 7 });
});

test("foldHourToDay tolerates null / empty input", () => {
  assert.deepEqual(foldHourToDay(null), {});
  assert.deepEqual(foldHourToDay([]), {});
});

test("mergeCountMaps sums key-wise across maps (used to union progression-event series)", () => {
  const a = { "2026-07-17T13": 5, "2026-07-18T09": 3 };
  const b = { "2026-07-17T13": 2, "2026-07-19T10": 7 };
  assert.deepEqual(mergeCountMaps(a, b), { "2026-07-17T13": 7, "2026-07-18T09": 3, "2026-07-19T10": 7 });
  assert.deepEqual(mergeCountMaps(), {});
});

test("historical answer union is question-count-agnostic (higher QUESTION_*_REACHED are simply absent)", () => {
  // A 3-question survey emits no QUESTION_4/5_REACHED, so summing the fixed event
  // union still yields the exact per-survey total. FedEx v1 = 992, v2 = 250.
  const v1 = { QUESTION_2_REACHED: 560, QUESTION_3_REACHED: 236, SURVEY_COMPLETED: 196 };
  const v2 = { QUESTION_2_REACHED: 91, QUESTION_3_REACHED: 81, SURVEY_COMPLETED: 78 };
  const sumUnion = (m: Record<string, number>) => HISTORICAL_ANSWER_EVENTS.reduce((a, ev) => a + (m[ev] ?? 0), 0);
  assert.equal(sumUnion(v1), 992);
  assert.equal(sumUnion(v2), 250);
  assert.equal(sumUnion(v1) + sumUnion(v2), 1242);
});
