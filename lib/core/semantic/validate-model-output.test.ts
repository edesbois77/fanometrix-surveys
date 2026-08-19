import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGroupingResponse, validateSynthesisResponse, validateDisconfirmationResponse } from "./validate-model-output";

test("a well-formed grouping verdict validates", () => {
  const r = validateGroupingResponse({ constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, construct: "some relevance", reasons: ["both encode relevance"] });
  assert.equal(r.ok, true);
  assert.equal(r.value?.construct, "some relevance");
});

test("model output that introduces a NUMBER is rejected (arithmetic is the Core's)", () => {
  const r = validateGroupingResponse({ constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, reasons: ["together they are 64.6%"] });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /number/i.test(x)));
});

test("invalid enums are rejected, not coerced", () => {
  assert.equal(validateGroupingResponse({ constructCoherent: "maybe", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, reasons: [] }).ok, false);
  assert.equal(validateSynthesisResponse({ coherent: "yes", centralStory: "no", humanReviewRequired: false, reasons: [] }).ok, false);
});

test("a synthesis verdict must not introduce a new share", () => {
  assert.equal(validateSynthesisResponse({ coherent: "yes", centralStory: false, humanReviewRequired: false, reasons: ["69.3% value both"] }).ok, false);
});

test("disconfirmation citing an unknown evidence id is rejected", () => {
  const ok = validateDisconfirmationResponse({ status: "qualified", kinds: ["qualification"], reasons: ["e1 qualifies it"] }, ["e1"]);
  assert.equal(ok.ok, true);
  const bad = validateDisconfirmationResponse({ status: "qualified", kinds: ["qualification"], reasons: ["e9 qualifies it"] }, ["e1"]);
  assert.equal(bad.ok, false);
});
