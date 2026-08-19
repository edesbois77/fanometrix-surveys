import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICY_V1 } from "./policy";

test("POLICY_V1 encodes the approved descriptive base bands (Decision 1)", () => {
  assert.deepEqual(POLICY_V1.descriptiveBaseBands, [
    { minInclusive: 0, maxExclusive: 20, state: "suppressed" },
    { minInclusive: 20, maxExclusive: 30, state: "directional" },
    { minInclusive: 30, maxExclusive: 50, state: "analytically_usable" },
    { minInclusive: 50, maxExclusive: 100, state: "standard" },
    { minInclusive: 100, maxExclusive: null, state: "stronger" },
  ]);
});

test("POLICY_V1 encodes the approved candidate-difference bands (Decision 3)", () => {
  assert.deepEqual(POLICY_V1.candidateDifferenceBands, [
    { minTenthsInclusive: 0, maxTenthsExclusive: 50, strength: "negligible" },
    { minTenthsInclusive: 50, maxTenthsExclusive: 100, strength: "weak" },
    { minTenthsInclusive: 100, maxTenthsExclusive: 150, strength: "clear" },
    { minTenthsInclusive: 150, maxTenthsExclusive: null, strength: "strong" },
  ]);
});

test("POLICY_V1 inferential default is 95% / alpha 0.05 (Decision 2)", () => {
  assert.equal(POLICY_V1.inferential.confidenceLevel, 95);
  assert.equal(POLICY_V1.inferential.alpha, 0.05);
  assert.equal(POLICY_V1.version, "1");
});
