import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDataDivergence, dualRunGatePasses } from "./g3-tightening";

// ORG-005 · G-3 — the accepted GD-4 disposition (Option i) as executable expectation.

const base = { orgIsStudyParticipant: true, studyCreatedByAdmin: false, studyDeleted: false };

test("no change is preserved", () => {
  assert.equal(classifyDataDivergence({ ...base, legacyAllow: true, newAllow: true }), "preserved");
  assert.equal(classifyDataDivergence({ ...base, legacyAllow: false, newAllow: false }), "preserved");
});

test("DENY→ALLOW is an expansion (gate must fail)", () => {
  assert.equal(classifyDataDivergence({ ...base, legacyAllow: false, newAllow: true }), "expansion");
});

test("ALLOW→DENY on campaign-monitoring of a non-participant/admin/deleted Study is GOVERNED tightening (GD-4)", () => {
  // admin-created Study
  assert.equal(classifyDataDivergence({ legacyAllow: true, newAllow: false, orgIsStudyParticipant: true, studyCreatedByAdmin: true, studyDeleted: false }), "governed_tightening");
  // deleted Study
  assert.equal(classifyDataDivergence({ legacyAllow: true, newAllow: false, orgIsStudyParticipant: true, studyCreatedByAdmin: false, studyDeleted: true }), "governed_tightening");
  // org is NOT a study-level participant (pure campaign-monitoring)
  assert.equal(classifyDataDivergence({ legacyAllow: true, newAllow: false, orgIsStudyParticipant: false, studyCreatedByAdmin: false, studyDeleted: false }), "governed_tightening");
});

test("ALLOW→DENY on a Study the org DOES legitimately participate in is UNEXPLAINED (a real loss — gate must fail)", () => {
  assert.equal(classifyDataDivergence({ legacyAllow: true, newAllow: false, orgIsStudyParticipant: true, studyCreatedByAdmin: false, studyDeleted: false }), "unexplained");
});

test("the gate passes on preserved + governed_tightening only, fails on expansion or unexplained", () => {
  assert.equal(dualRunGatePasses(["preserved", "governed_tightening", "preserved"]), true);
  assert.equal(dualRunGatePasses(["preserved", "expansion"]), false);
  assert.equal(dualRunGatePasses(["preserved", "unexplained"]), false);
});
