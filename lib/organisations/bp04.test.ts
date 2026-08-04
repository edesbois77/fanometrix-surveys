import { test } from "node:test";
import assert from "node:assert/strict";
import { intervalsOverlap, validateAttachmentExclusivity, type AttachmentInterval } from "./bp04";
import { isEligibleFactSubjectKind } from "./bp02";
import { isRelationshipParticipantKind } from "./bp03";

// ── F-3 additive widening: office is now an eligible fact subject + participant ──
test("organisational_office is an eligible fact subject and relationship participant (BP-04 F-3)", () => {
  assert.ok(isEligibleFactSubjectKind("organisational_office"));
  assert.ok(isRelationshipParticipantKind("organisational_office"));
  // existing kinds preserved
  assert.ok(isEligibleFactSubjectKind("organisation"));
  assert.ok(isRelationshipParticipantKind("organisation_unit"));
});

// ── half-open overlap ────────────────────────────────────────────────────────
test("half-open intervals: adjacent [.,D)+[D,.) do not overlap; nested/partial do", () => {
  assert.equal(intervalsOverlap({ effectiveFrom: null, effectiveTo: "2024-01-01" }, { effectiveFrom: "2024-01-01", effectiveTo: null }), false);
  assert.ok(intervalsOverlap({ effectiveFrom: "2023-01-01", effectiveTo: "2025-01-01" }, { effectiveFrom: "2024-01-01", effectiveTo: null }));
  assert.ok(intervalsOverlap({ effectiveFrom: null, effectiveTo: null }, { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-01" }));
  assert.equal(intervalsOverlap({ effectiveFrom: "2020-01-01", effectiveTo: "2021-01-01" }, { effectiveFrom: "2022-01-01", effectiveTo: "2023-01-01" }), false);
});

// ── FR-010 attachment exclusivity (one governing Organisation per applicable point) ──
const A = (from: string | null, to: string | null, id: string): AttachmentInterval => ({ effectiveFrom: from, effectiveTo: to, id });

test("FR-010: a non-overlapping attachment is accepted", () => {
  const existing = [A("2020-01-01", "2022-01-01", "e1")];
  assert.ok(validateAttachmentExclusivity({ effectiveFrom: "2022-01-01", effectiveTo: null }, existing).ok); // adjacent
});
test("FR-010: an overlapping attachment is rejected", () => {
  const existing = [A("2020-01-01", null, "e1")];
  const r = validateAttachmentExclusivity({ effectiveFrom: "2021-01-01", effectiveTo: null }, existing);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /exactly one governing Organisation/);
  assert.equal((r as { conflictsWith?: string }).conflictsWith, "e1");
});
test("FR-010: editing a row does not conflict with itself", () => {
  const existing = [A("2020-01-01", null, "self")];
  assert.ok(validateAttachmentExclusivity({ effectiveFrom: "2020-06-01", effectiveTo: null }, existing, "self").ok);
});
test("FR-010: a reversed/zero-length candidate interval is rejected", () => {
  assert.equal(validateAttachmentExclusivity({ effectiveFrom: "2024-01-01", effectiveTo: "2024-01-01" }, []).ok, false);
});
