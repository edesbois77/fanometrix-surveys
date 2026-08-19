import { test } from "node:test";
import assert from "node:assert/strict";
import type { Quantity } from "./types";
import { toProportion, toPercentagePoints, proportion, percentagePoints } from "./scale";

test("a Studio-style 0.336 is explicitly a proportion", () => {
  const q = proportion(0.336);
  assert.deepEqual(q, { value: 0.336, unit: "proportion" });
  assert.equal(toProportion(q), 0.336);
  assert.equal(toPercentagePoints(q), 33.6); // explicit conversion only
});

test("an RP/report-style 33.6 is explicitly percentage points", () => {
  const q = percentagePoints(33.6);
  assert.deepEqual(q, { value: 33.6, unit: "percentage_points" });
  assert.equal(toPercentagePoints(q), 33.6);
  assert.ok(Math.abs(toProportion(q) - 0.336) < 1e-12);
});

test("0.336 and 33.6 are NOT interchangeable without an explicit conversion", () => {
  const studio: Quantity = proportion(0.336);
  const report: Quantity = percentagePoints(33.6);
  // Same underlying magnitude, but the raw numbers and units differ — a consumer
  // can never treat them as equal by reading `.value` alone.
  assert.notEqual(studio.value, report.value);
  assert.notEqual(studio.unit, report.unit);
  // They are only equal AFTER an explicit conversion to a common scale.
  assert.ok(Math.abs(toPercentagePoints(studio) - toPercentagePoints(report)) < 1e-12);
  assert.ok(Math.abs(toProportion(studio) - toProportion(report)) < 1e-12);
});

test("conversion is deterministic and round-trips", () => {
  for (const v of [0, 0.05, 0.336, 0.5, 1]) {
    assert.ok(Math.abs(toProportion({ value: toPercentagePoints(proportion(v)), unit: "percentage_points" }) - v) < 1e-12);
  }
});

test("non-percentage units have no scale conversion (throws by design)", () => {
  assert.throws(() => toProportion({ value: 5, unit: "count" }));
  assert.throws(() => toPercentagePoints({ value: 120, unit: "index" }));
});
