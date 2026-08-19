import { test } from "node:test";
import assert from "node:assert/strict";
import { shares, marginOfError, index100 } from "./calc";
// TEST-ONLY read references to the existing canonical implementations, to prove
// behaviour-equivalence. These imports are in tests, never in Core runtime.
import { marginOfError as reportsMoE, index100 as reportsIndex100 } from "@/lib/reports/stats";

test("shares reproduces the FedEx Q1 distribution exactly (base 274)", () => {
  const { base, options } = shares([
    { id: "strong_fit", count: 92 },
    { id: "relevant_unclear", count: 85 },
    { id: "brand_visibility", count: 29 },
    { id: "never_noticed", count: 68 },
  ]);
  assert.equal(base, 274);
  // The rule is identical to survey-results.ts:94 — pct = count/base (a fraction).
  assert.equal(options[0].pct, 92 / 274);
  assert.equal(options[1].pct, 85 / 274);
  assert.equal(options[2].pct, 29 / 274);
  assert.equal(options[3].pct, 68 / 274);
  // Rounded display matches the human gold standard 33.6 / 31.0 / 10.6 / 24.8.
  assert.deepEqual(options.map((o) => Math.round((o.pct as number) * 1000) / 10), [33.6, 31.0, 10.6, 24.8]);
});

test("shares: base conservation and zero-base → null pct", () => {
  const { base, options } = shares([{ id: "a", count: 3 }, { id: "b", count: 7 }]);
  assert.equal(base, options.reduce((a, o) => a + o.count, 0));
  const empty = shares([{ id: "a", count: 0 }, { id: "b", count: 0 }]);
  assert.equal(empty.base, 0);
  assert.ok(empty.options.every((o) => o.pct === null));
});

test("marginOfError is identical to lib/reports/stats.ts and follows 98/√n", () => {
  for (const n of [1, 25, 50, 100, 274, 584, 1000]) {
    assert.equal(marginOfError(n), reportsMoE(n), `n=${n} must equal reports MoE`);
    assert.ok(Math.abs(marginOfError(n) - 98 / Math.sqrt(n)) < 1e-9, `n=${n} ~ 98/√n`);
  }
  assert.equal(marginOfError(0), 100);
  assert.equal(marginOfError(-5), 100);
  // Dashboard presentation (round to 1dp) reproduces its known value.
  assert.equal(Math.round(marginOfError(100) * 10) / 10, 9.8);
});

test("index100 is identical to lib/reports/stats.ts", () => {
  const cases: [number, number][] = [[50, 100], [120, 100], [0, 100], [33, 274], [7, 0]];
  for (const [v, b] of cases) assert.equal(index100(v, b), reportsIndex100(v, b), `index100(${v},${b})`);
  assert.equal(index100(7, 0), 0);
});
