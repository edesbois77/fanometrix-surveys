import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isRelationshipParticipantKind,
  deriveTemporalState,
  validateParticipants,
  isRelationshipDirectionality,
  type ParticipantInput,
} from "./bp03";

// ── Eligible participant kinds (Office excluded until BP-04) ─────────────────────
test("organisation and organisation_unit are eligible relationship participants", () => {
  assert.ok(isRelationshipParticipantKind("organisation"));
  assert.ok(isRelationshipParticipantKind("organisation_unit"));
});
test("organisational_office IS an eligible participant kind since BP-04 (F-3); a bogus kind is not", () => {
  assert.ok(isRelationshipParticipantKind("organisational_office"));
  assert.equal(isRelationshipParticipantKind("person"), false);
});

// ── Temporal state derivation (half-open; derived, not stored) ───────────────────
test("temporal state is derived half-open: from=D current on D, to=D historical on D", () => {
  assert.equal(deriveTemporalState({ effectiveFrom: "2026-08-04", effectiveTo: null }, "2026-08-04"), "current");
  assert.equal(deriveTemporalState({ effectiveFrom: null, effectiveTo: "2026-08-04" }, "2026-08-04"), "historical");
  assert.equal(deriveTemporalState({ effectiveFrom: "2027-01-01", effectiveTo: null }, "2026-08-04"), "future");
  assert.equal(deriveTemporalState({ effectiveFrom: null, effectiveTo: null }, "2026-08-04"), "current");
});

// ── Participant structure (R05 FR-001/013) ──────────────────────────────────────
const p = (subjectId: string, role?: string): ParticipantInput => ({ subjectId, subjectKind: "organisation", role });

test("a relationship needs at least two participants", () => {
  assert.equal(validateParticipants([p("A")]).ok, false);
  assert.ok(validateParticipants([p("A"), p("B")]).ok);
});
test("participants must be eligible subject kinds", () => {
  const r = validateParticipants([p("A"), { subjectId: "B", subjectKind: "person" }]);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /not eligible/);
});
test("exact-duplicate participant (same subject and role) is rejected", () => {
  assert.equal(validateParticipants([p("A", "member"), p("A", "member")]).ok, false);
  // same subject in DIFFERENT roles is allowed (e.g. distinct capacities)
  assert.ok(validateParticipants([p("A", "predecessor"), p("A", "successor")]).ok);
});

test("directionality accepts only directed or symmetric", () => {
  assert.ok(isRelationshipDirectionality("directed"));
  assert.ok(isRelationshipDirectionality("symmetric"));
  assert.equal(isRelationshipDirectionality("bidirectional"), false);
});
