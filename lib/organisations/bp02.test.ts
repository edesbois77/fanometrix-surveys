import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEligibleFactSubjectKind,
  isValidEffectiveInterval,
  isApplicableOn,
  ancestorsOf,
  validateContainment,
  validateUnitOrganisationImmutable,
  selectPrimaryName,
  type UnitNode,
  type NameFact,
} from "./bp02";

// ── Eligible subject kinds (Office excluded until BP-04) ─────────────────────────
test("organisation and organisation_unit are eligible fact subjects", () => {
  assert.ok(isEligibleFactSubjectKind("organisation"));
  assert.ok(isEligibleFactSubjectKind("organisation_unit"));
});
test("organisational_office is NOT an eligible fact subject in BP-02", () => {
  assert.equal(isEligibleFactSubjectKind("organisational_office"), false);
});

// ── Effective Applicability intervals ───────────────────────────────────────────
test("open start or open end is always valid", () => {
  assert.ok(isValidEffectiveInterval({ effectiveFrom: null, effectiveTo: "2024-01-01" }));
  assert.ok(isValidEffectiveInterval({ effectiveFrom: "2024-01-01", effectiveTo: null }));
  assert.ok(isValidEffectiveInterval({ effectiveFrom: null, effectiveTo: null }));
});
test("half-open: end strictly after start is valid; reversed and zero-length are invalid", () => {
  assert.ok(isValidEffectiveInterval({ effectiveFrom: "2023-01-01", effectiveTo: "2024-01-01" }));
  assert.equal(isValidEffectiveInterval({ effectiveFrom: "2024-01-01", effectiveTo: "2024-01-01" }), false); // zero-length [d,d)
  assert.equal(isValidEffectiveInterval({ effectiveFrom: "2024-01-01", effectiveTo: "2023-01-01" }), false); // reversed
});
test("applicability is from-inclusive, to-exclusive; open bounds are unbounded", () => {
  assert.ok(isApplicableOn({ effectiveFrom: "2020-01-01", effectiveTo: null }, "2026-08-03"));
  assert.equal(isApplicableOn({ effectiveFrom: "2027-01-01", effectiveTo: null }, "2026-08-03"), false);
  // effectiveFrom = D is applicable on D (inclusive start)
  assert.ok(isApplicableOn({ effectiveFrom: "2026-08-03", effectiveTo: null }, "2026-08-03"));
  // effectiveTo = D is NOT applicable on D (exclusive end)
  assert.equal(isApplicableOn({ effectiveFrom: null, effectiveTo: "2026-08-03" }, "2026-08-03"), false);
});
test("transition boundary has no overlap: retired [.,D) and replacement [D,.) — exactly one applies on D", () => {
  const D = "2026-08-04";
  const retired = { effectiveFrom: null, effectiveTo: D };   // former, closed at D (exclusive)
  const current = { effectiveFrom: D, effectiveTo: null };   // replacement, opens at D (inclusive)
  const appliesOnD = [retired, current].filter((i) => isApplicableOn(i, D));
  assert.equal(appliesOnD.length, 1);
  assert.equal(appliesOnD[0], current);
  // and the day before D, only the retired fact applies
  const dayBefore = "2026-08-03";
  assert.ok(isApplicableOn(retired, dayBefore));
  assert.equal(isApplicableOn(current, dayBefore), false);
});

// ── Unit containment ─────────────────────────────────────────────────────────────
function tree(...nodes: UnitNode[]): Map<string, UnitNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
const A: UnitNode = { id: "A", organisationId: "org1", parentUnitId: null };
const B: UnitNode = { id: "B", organisationId: "org1", parentUnitId: "A" };
const C: UnitNode = { id: "C", organisationId: "org1", parentUnitId: "B" };
const X: UnitNode = { id: "X", organisationId: "org2", parentUnitId: null };

test("root unit (null parent) is always allowed", () => {
  assert.deepEqual(validateContainment(tree(A), "A", "org1", null), { ok: true });
});
test("nesting under a same-organisation parent is allowed", () => {
  assert.deepEqual(validateContainment(tree(A, B), "B", "org1", "A"), { ok: true });
});
test("self-parenting is rejected", () => {
  assert.equal(validateContainment(tree(A), "A", "org1", "A").ok, false);
});
test("nonexistent parent is rejected", () => {
  assert.equal(validateContainment(tree(A), "A", "org1", "ghost").ok, false);
});
test("cross-organisation nesting is rejected", () => {
  const r = validateContainment(tree(A, X), "A", "org1", "X");
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /different organisation/);
});
test("circular containment is rejected (A under its descendant C)", () => {
  const r = validateContainment(tree(A, B, C), "A", "org1", "C");
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /circular/);
});
test("ancestry walk lists the chain to the root and terminates on corrupt cycles", () => {
  assert.deepEqual(ancestorsOf(tree(A, B, C), "C"), ["C", "B", "A"]);
  const corrupt = tree(
    { id: "P", organisationId: "o", parentUnitId: "Q" },
    { id: "Q", organisationId: "o", parentUnitId: "P" }
  );
  // must not hang
  assert.ok(ancestorsOf(corrupt, "P").length <= 2);
});

test("a unit's organisation is immutable; same-org 'change' is a no-op pass", () => {
  assert.deepEqual(validateUnitOrganisationImmutable("org1", "org1"), { ok: true });
  const r = validateUnitOrganisationImmutable("org1", "org2");
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /cross-organisation movement/);
});

// ── Primary name selection ──────────────────────────────────────────────────────
test("primary display name is the sole non-deleted primary", () => {
  const names: NameFact[] = [
    { value: "Old", isPrimary: false, deletedAt: null },
    { value: "Current", isPrimary: true, deletedAt: null },
  ];
  assert.equal(selectPrimaryName(names), "Current");
});
test("a deleted primary does not project", () => {
  const names: NameFact[] = [{ value: "Gone", isPrimary: true, deletedAt: "2026-01-01" }];
  assert.equal(selectPrimaryName(names), null);
});
