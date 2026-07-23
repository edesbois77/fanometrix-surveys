import { test } from "node:test";
import assert from "node:assert/strict";
import { compatibility, admissibilityFor, hasNativeKind, combinationViolations } from "./matrix";
import type { AssertionType, ContributionKind } from "./types";

// docs/compatibility-matrix.md, as executable claims. A failure here means the
// platform is entitled to say something the matrix says it is not.

const KINDS: ContributionKind[] = [
  "elicited_perception", "unprompted_discourse", "documented_activity",
  "interested_claim", "expert_judgement", "established_knowledge",
];
const ASSERTIONS: AssertionType[] = [
  "descriptive", "comparative", "magnitude", "temporal", "causal", "predictive", "absence",
];

// ── The prohibitions that matter most ────────────────────────────────────────

test("conversation volume can never establish what share of a population thinks something", () => {
  // The single most important cell in the matrix, and the most common failure in
  // social listening: discourse volume is a product of platform, window and
  // query, never of population.
  assert.equal(admissibilityFor("magnitude", "unprompted_discourse"), "inadmissible");
});

test("a party's account of itself may never ground a comparison against a rival", () => {
  assert.equal(admissibilityFor("comparative", "interested_claim"), "inadmissible");
});

test("an interested claim can only ever establish that the claim was made", () => {
  // Descriptive-with-limits, and inadmissible for every assertion that would
  // require the claim to be true.
  assert.equal(admissibilityFor("descriptive", "interested_claim"), "admissible_with_limits");
  for (const a of ["comparative", "magnitude", "temporal", "causal", "predictive"] as AssertionType[]) {
    assert.equal(admissibilityFor(a, "interested_claim"), "inadmissible", `${a} must reject an interested claim`);
  }
});

test("a party's own reach figures are a claim, not a measurement", () => {
  assert.equal(admissibilityFor("magnitude", "interested_claim"), "inadmissible");
  assert.equal(admissibilityFor("magnitude", "expert_judgement"), "inadmissible");
});

test("no kind is native to causation, so nothing can carry a causal claim alone", () => {
  for (const k of KINDS) {
    const cell = compatibility("causal", k);
    assert.equal(cell.native, false, `${k} must not be native to a causal claim`);
    assert.notEqual(cell.verdict, "admissible", `${k} must not be able to carry a causal claim`);
  }
});

test("established knowledge can never establish that it holds for this engagement", () => {
  // Its single prohibition, so it is with-limits everywhere it is admissible.
  for (const a of ASSERTIONS.filter(a => a !== "absence")) {
    assert.equal(admissibilityFor(a, "established_knowledge"), "admissible_with_limits", `${a}`);
  }
});

// ── Home ground ──────────────────────────────────────────────────────────────

test("a survey is the native instrument for measuring stated attitude", () => {
  assert.ok(compatibility("magnitude", "elicited_perception").native);
  assert.ok(hasNativeKind("magnitude", ["elicited_perception"]));
});

test("unprompted discourse is native to change over time but not to measurement", () => {
  assert.ok(compatibility("temporal", "unprompted_discourse").native);
  assert.equal(admissibilityFor("magnitude", "unprompted_discourse"), "inadmissible");
});

test("a single wave of a survey cannot show change over time", () => {
  assert.equal(admissibilityFor("temporal", "elicited_perception"), "admissible_with_limits");
});

// ── Structural completeness ──────────────────────────────────────────────────

test("every cell is decided, for every kind and every assertion", () => {
  for (const a of ASSERTIONS) {
    for (const k of KINDS) {
      const cell = compatibility(a, k);
      assert.ok(cell, `${a} x ${k} is undecided`);
      assert.ok(["admissible", "admissible_with_limits", "inadmissible"].includes(cell.verdict));
    }
  }
});

test("every constrained cell states its constraint, so an exclusion is never unexplained", () => {
  for (const a of ASSERTIONS) {
    for (const k of KINDS) {
      const cell = compatibility(a, k);
      if (cell.verdict !== "admissible" || !cell.native) {
        assert.ok(cell.constraint && cell.constraint.length > 0, `${a} x ${k} constrains without saying why`);
      }
    }
  }
});

test("no constraint text uses an em-dash", () => {
  for (const a of ASSERTIONS) {
    for (const k of KINDS) {
      const c = compatibility(a, k).constraint;
      if (c) assert.ok(!/[—–]/.test(c), `em-dash in ${a} x ${k}`);
    }
  }
});

// ── Absence is governed separately ───────────────────────────────────────────

test("an absence claim is governed by the search, not by the kind of evidence", () => {
  for (const k of KINDS) {
    const cell = compatibility("absence", k);
    assert.equal(cell.verdict, "admissible");
    assert.ok(cell.constraint?.includes("examined"), "it counts as material examined, not as support");
  }
});

// ── Combination rules ────────────────────────────────────────────────────────

test("a causal claim resting on one kind of evidence violates the combination rule", () => {
  const v = combinationViolations({ assertion: "causal", kinds: ["unprompted_discourse"], allWithLimits: false });
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "6.1");
});

test("a causal claim across two kinds clears the combination rule", () => {
  const v = combinationViolations({
    assertion: "causal", kinds: ["unprompted_discourse", "established_knowledge"], allWithLimits: false,
  });
  assert.deepEqual(v, []);
});

test("a descriptive claim on one kind is fine, because description is not causation", () => {
  assert.deepEqual(combinationViolations({ assertion: "descriptive", kinds: ["unprompted_discourse"], allWithLimits: false }), []);
});

test("grounds that are entirely admitted with limits violate the second combination rule", () => {
  const v = combinationViolations({ assertion: "descriptive", kinds: ["established_knowledge"], allWithLimits: true });
  assert.equal(v.length, 1);
  assert.equal(v[0].rule, "6.2");
});
