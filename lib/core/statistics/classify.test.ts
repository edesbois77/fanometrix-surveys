import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBase, classifyCandidateDifference } from "./classify";

test("classifyBase covers every approved boundary (Decision 1)", () => {
  const cases: [number, string][] = [
    [0, "suppressed"], [19, "suppressed"],
    [20, "directional"], [29, "directional"],
    [30, "analytically_usable"], [49, "analytically_usable"],
    [50, "standard"], [99, "standard"],
    [100, "stronger"], [101, "stronger"],
  ];
  for (const [n, expected] of cases) assert.equal(classifyBase(n), expected, `n=${n}`);
});

test("classifyBase treats negative / non-finite n as suppressed", () => {
  assert.equal(classifyBase(-5), "suppressed");
  assert.equal(classifyBase(NaN), "suppressed");
});

test("classifyCandidateDifference covers every approved boundary (Decision 3)", () => {
  const cases: [number, string][] = [
    [0, "negligible"], [4.9, "negligible"],
    [5, "weak"], [9.9, "weak"],
    [10, "clear"], [14.9, "clear"],
    [15, "strong"], [20, "strong"],
  ];
  for (const [pp, expected] of cases) assert.equal(classifyCandidateDifference(pp), expected, `pp=${pp}`);
});

test("classifyCandidateDifference uses magnitude (sign-independent)", () => {
  assert.equal(classifyCandidateDifference(-15), "strong");
  assert.equal(classifyCandidateDifference(-4.9), "negligible");
});
