import { test } from "node:test";
import assert from "node:assert/strict";
import { twoProportion } from "./inference";
// TEST-ONLY read reference to prove p-value equivalence with the existing z-test.
import { compareProportions } from "@/lib/reports/stats";

test("clear difference → supported, p-value matches lib/reports/stats.ts", () => {
  const a = twoProportion(30, 100, 60, 100); // 30% vs 60%
  const r = compareProportions(30, 100, 60, 100);
  assert.equal(a.status, "supported");
  assert.ok((a.pValue as number) < 0.05);
  assert.ok(Math.abs((a.pValue as number) - r.pValue) < 1e-9);
  assert.equal(a.method, "two_proportion_z");
  assert.equal(a.confidenceLevel, 95);
  assert.equal(a.observedDifferencePp, 30); // (0.60-0.30)*100
});

test("small difference on ample base → not_supported, p-value matches", () => {
  const a = twoProportion(48, 100, 52, 100);
  const r = compareProportions(48, 100, 52, 100);
  assert.equal(a.status, "not_supported");
  assert.ok((a.pValue as number) >= 0.05);
  assert.ok(Math.abs((a.pValue as number) - r.pValue) < 1e-9);
});

test("too few successes → not_assessed (and reports agrees it is inconclusive)", () => {
  const a = twoProportion(1, 40, 2, 40); // x1+x2 = 3 < 5
  const r = compareProportions(1, 40, 2, 40);
  assert.equal(a.status, "not_assessed");
  assert.equal(a.pValue, null);
  assert.equal(r.inconclusive, true);
  // Observed difference is still reported factually.
  assert.equal(a.observedDifferencePp, Math.round((2 / 40 - 1 / 40) * 1000) / 10);
});

test("empty arm and zero-SE → not_assessed", () => {
  assert.equal(twoProportion(0, 0, 5, 50).status, "not_assessed");
  assert.equal(twoProportion(50, 50, 50, 50).status, "not_assessed"); // p1=p2=1 → SE 0
});

test("p-value equivalence holds across a matrix of testable inputs", () => {
  const cases: [number, number, number, number][] = [
    [10, 100, 25, 100], [40, 200, 60, 200], [5, 50, 20, 80], [90, 274, 67, 274], [100, 500, 140, 500],
  ];
  for (const [x1, n1, x2, n2] of cases) {
    const a = twoProportion(x1, n1, x2, n2);
    const r = compareProportions(x1, n1, x2, n2);
    assert.ok(Math.abs((a.pValue as number) - r.pValue) < 1e-9, `pValue mismatch for ${[x1, n1, x2, n2]}`);
  }
});

test("the assessment carries NO materiality/importance field (Decision 2)", () => {
  const a = twoProportion(30, 100, 60, 100) as Record<string, unknown>;
  assert.ok(!("materiality" in a));
  assert.ok(!("important" in a));
  assert.ok(!("significant" in a));
});
