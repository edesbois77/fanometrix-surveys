import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAdmittedHolderKind, anyHolderKindAdmitted, isAuthorityConstraintType, isAuthorityBasisKind, isInternalBasisKind,
  evaluateConstraintDimension, authorityTemporalState, authorityAppliesOn,
} from "./bp05";

// ── Holder eligibility is externally governed; NO kind admitted now (preserved, J-1) ──
test("no holder kind is eligible while the admitted set is empty (Authority instances unavailable)", () => {
  const admitted: string[] = []; // authority_eligible_holder_kinds is empty in production
  assert.equal(anyHolderKindAdmitted(admitted), false);
  // Existing IC-01 subjecthood is NOT eligibility (control J-1): none are admitted merely for existing.
  for (const k of ["organisation", "organisation_unit", "organisational_office", "person"]) {
    assert.equal(isAdmittedHolderKind(k, admitted), false);
  }
});
test("once a kind is admitted under an eligibility architecture, it is recognised (additive evolvability)", () => {
  const admitted = ["some_governed_eligible_actor"]; // hypothetical future admission
  assert.ok(anyHolderKindAdmitted(admitted));
  assert.ok(isAdmittedHolderKind("some_governed_eligible_actor", admitted));
  assert.equal(isAdmittedHolderKind("organisation", admitted), false);
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
