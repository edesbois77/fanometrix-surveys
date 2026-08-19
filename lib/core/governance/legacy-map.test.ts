import { test } from "node:test";
import assert from "node:assert/strict";
import { GOVERNANCE_RULES } from "./rules";
import { LEGACY_DIVERGENCES, getDivergence } from "./legacy-map";

test("every rule has a legacy divergence record with matching equivalence", () => {
  for (const r of GOVERNANCE_RULES) {
    const d = getDivergence(r.id);
    assert.ok(d, `${r.id} missing divergence`);
    assert.equal(d!.equivalence, r.equivalence, `${r.id} equivalence mismatch between rule and legacy map`);
    assert.ok(d!.divergence.length > 30, `${r.id} divergence text too short`);
  }
});

test("conflicts are named explicitly (not hidden)", () => {
  for (const d of LEGACY_DIVERGENCES) {
    if (d.equivalence === "conflict") assert.match(d.divergence, /CONFLICT/, `${d.ruleId} conflict must be labelled`);
  }
});

test("no orphan divergence entries", () => {
  const ids = new Set(GOVERNANCE_RULES.map((r) => r.id));
  for (const d of LEGACY_DIVERGENCES) assert.ok(ids.has(d.ruleId), `orphan divergence ${d.ruleId}`);
});

test("every divergence states a future migration implication", () => {
  for (const d of LEGACY_DIVERGENCES) assert.ok(d.migration && d.migration.length > 20, `${d.ruleId} needs a migration note`);
});

test("resolved conflicts are marked canonical_supersedes with a migration effect", () => {
  for (const id of ["unsupported_causation", "unsupported_trend", "aggregate_to_respondent_inference", "unsupported_statistical_language"]) {
    const d = getDivergence(id)!;
    assert.equal(d.equivalence, "canonical_supersedes");
    assert.ok(d.migration.length > 20);
  }
});
