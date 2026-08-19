import { test } from "node:test";
import assert from "node:assert/strict";
import { GOVERNANCE_RULES, getRule } from "./rules";
import { PROMPT_FRAGMENTS } from "./prompt-fragments";
import { getDivergence } from "./legacy-map";

test("rule ids are unique and stable", () => {
  const ids = GOVERNANCE_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every rule is well-formed", () => {
  for (const r of GOVERNANCE_RULES) {
    assert.ok(r.title && r.description, `${r.id} needs title+description`);
    assert.ok(r.standardRef.length > 0, `${r.id} needs a Standard reference`);
    assert.ok(r.legacy.length > 0, `${r.id} needs a legacy mapping`);
    assert.ok(r.applicability.evidenceTypes.length > 0 && r.applicability.scope.length > 0, `${r.id} needs applicability`);
    assert.ok(["blocking", "advisory"].includes(r.severity));
    assert.ok(["deterministic", "heuristic"].includes(r.enforcement));
  }
});

test("every rule with a prompt fragment has one; every rule has a legacy divergence entry", () => {
  for (const r of GOVERNANCE_RULES) {
    if (r.hasPromptFragment) assert.ok(PROMPT_FRAGMENTS[r.id], `${r.id} missing prompt fragment`);
    assert.ok(getDivergence(r.id), `${r.id} missing legacy divergence`);
  }
});

test("getRule resolves by id", () => {
  assert.equal(getRule("unsupported_causation")?.category, "causality");
  assert.equal(getRule("nope"), undefined);
});

test("Stage 2.1 resolved the causation/trend/significance conflicts to canonical policy", () => {
  const byId = new Map(GOVERNANCE_RULES.map((r) => [r.id, r]));
  for (const id of ["unsupported_causation", "unsupported_trend", "unsupported_statistical_language", "aggregate_to_respondent_inference"]) {
    assert.equal(byId.get(id)?.equivalence, "canonical_supersedes", `${id} should be canonical_supersedes`);
  }
});

test("genuine remaining conflicts are still recorded, not hidden", () => {
  const conflicts = GOVERNANCE_RULES.filter((r) => r.equivalence === "conflict").map((r) => r.id);
  for (const id of ["preference_to_outcome_leap", "unsupported_recommendation_outcome", "sample_composition_not_popularity"]) {
    assert.ok(conflicts.includes(id), `${id} should remain a recorded conflict`);
  }
});

test("preference→outcome is blocking; recommendation/overstated/sample-composition remain advisory", () => {
  const byId = new Map(GOVERNANCE_RULES.map((r) => [r.id, r]));
  assert.equal(byId.get("preference_to_outcome_leap")?.severity, "blocking");
  for (const id of ["unsupported_recommendation_outcome", "overstated_leadership", "sample_composition_not_popularity", "imprecise_significance_wording"]) {
    assert.equal(byId.get(id)?.severity, "advisory", `${id} should be advisory`);
  }
});
