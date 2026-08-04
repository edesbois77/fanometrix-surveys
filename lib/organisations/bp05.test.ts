import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAuthorityHolderKind, isAuthorityConstraintType, isAuthorityBasisKind, isInternalBasisKind,
  evaluateConstraintDimension, authorityTemporalState, authorityAppliesOn,
} from "./bp05";

// ── Holder kinds (IC-01 actors admitted; external preserved; eligibility not decided) ──
test("IC-01 subjects are admissible Authority holders; a Person/external actor kind is not (preserved)", () => {
  assert.ok(isAuthorityHolderKind("organisation"));
  assert.ok(isAuthorityHolderKind("organisation_unit"));
  assert.ok(isAuthorityHolderKind("organisational_office"));
  assert.equal(isAuthorityHolderKind("person"), false); // external actor holder is a preserved dependency
});

test("constraint types and basis kinds are the governed sets", () => {
  for (const t of ["threshold", "jurisdiction", "condition", "limit"]) assert.ok(isAuthorityConstraintType(t));
  assert.equal(isAuthorityConstraintType("mood"), false);
  assert.ok(isAuthorityBasisKind("office") && isInternalBasisKind("office"));
  assert.ok(isAuthorityBasisKind("relationship") && isInternalBasisKind("relationship"));
  assert.ok(isAuthorityBasisKind("delegation") && !isInternalBasisKind("delegation")); // external, reference-only
  assert.ok(isAuthorityBasisKind("contract") && !isInternalBasisKind("contract"));
  assert.equal(isAuthorityBasisKind("random"), false);
});

// ── FA-B constraint dimension (FR-011/012/013) ──────────────────────────────────
test("constraint dimension: all satisfied permits; any deterministic failure prevents", () => {
  assert.equal(evaluateConstraintDimension(["satisfied", "satisfied"]), "satisfied");
  assert.equal(evaluateConstraintDimension(["satisfied", "failed", "undetermined"]), "failed");
});
test("constraint dimension: insufficient/disputed info is NOT a failure (indeterminate, FR-012)", () => {
  assert.equal(evaluateConstraintDimension(["satisfied", "undetermined"]), "indeterminate");
  assert.equal(evaluateConstraintDimension([]), "satisfied"); // no material constraints
});

// ── FA-D temporal (FR-019/020) - half-open, derived, never inherited ────────────
test("authority temporal state is derived half-open; from=D current on D, to=D historical on D", () => {
  assert.equal(authorityTemporalState({ effectiveFrom: "2026-08-04", effectiveTo: null }, "2026-08-04"), "current");
  assert.equal(authorityTemporalState({ effectiveFrom: null, effectiveTo: "2026-08-04" }, "2026-08-04"), "historical");
  assert.equal(authorityTemporalState({ effectiveFrom: "2027-01-01", effectiveTo: null }, "2026-08-04"), "future");
  assert.ok(authorityAppliesOn({ effectiveFrom: "2020-01-01", effectiveTo: null }, "2026-08-04"));
  assert.equal(authorityAppliesOn({ effectiveFrom: null, effectiveTo: "2026-08-04" }, "2026-08-04"), false);
});
