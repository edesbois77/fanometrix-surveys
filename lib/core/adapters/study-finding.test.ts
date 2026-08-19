import { test } from "node:test";
import assert from "node:assert/strict";
import { fromStudyFinding, type StudyFindingRowInput, type FrozenEvidenceInput } from "./study-finding";

const row: StudyFindingRowInput = {
  id: "sf-1", study_id: "study-1", headline: "Rewards lead sponsor expectations.",
  commentary: "Fans favour tangible value.", status: "published",
  origin_type: "analysis_proposal", origin_analysis_proposal_id: "prop-3", created_at: "2026-08-01T00:00:00Z",
};
const frozen: FrozenEvidenceInput[] = [
  { evidenceClass: "base", ref: "e1", canonicalQuestionKey: "q_offer", question: "What should sponsors offer?", optionId: "rewards", optionLabel: "Rewards and benefits", count: 100, base: 274, percentage: 100 / 274, scope: "combined" },
  { evidenceClass: "derived", ref: "d1", label: "Rewards leads by 14.6pp", kind: "leader", value: 36.5 },
  { evidenceClass: "segment", ref: "s1", dimension: "country", groupLabel: "Germany", label: "Germany differs" },
];

test("fromStudyFinding maps headline, source, status and frozen-at", () => {
  const f = fromStudyFinding(row, frozen);
  assert.equal(f.statement, "Rewards lead sponsor expectations.");
  assert.deepEqual(f.source, { studyId: "study-1" });
  assert.equal(f.status, "published");
  assert.equal(f.frozen?.frozenAt, "2026-08-01T00:00:00Z");
  assert.deepEqual(f.version, { standardVersion: null, coreVersion: null, runProvenance: "prop-3" });
});

test("commentary is provenance, NOT a governed Insight", () => {
  const f = fromStudyFinding(row, frozen);
  assert.equal(f.insight, undefined);
  assert.equal((f.sourceMeta as Record<string, unknown>).commentary, "Fans favour tangible value.");
});

test("frozen evidence is mapped verbatim by class; percentage preserved (not rescaled)", () => {
  const f = fromStudyFinding(row, frozen);
  assert.equal(f.evidence.length, 3);
  const base = f.evidence[0];
  assert.equal(base.kind, "base");
  assert.equal(base.question?.canonicalKey, "q_offer");
  assert.equal(base.option?.id, "rewards");
  assert.equal(base.numerator, 100);
  assert.equal(base.denominator, 274);
  // VERBATIM fraction, tagged as a proportion — never rescaled, never ambiguous.
  assert.equal(base.quantity?.unit, "proportion");
  assert.equal(base.quantity?.value, 100 / 274);
  assert.equal(base.frozen?.frozenAt, "2026-08-01T00:00:00Z");
  assert.equal(f.evidence[1].kind, "derived");
  assert.equal(f.evidence[1].quantity, undefined); // derived scale not asserted by the adapter
  assert.equal(f.evidence[2].kind, "segment");
  assert.deepEqual(f.evidence[2].segment, { dimension: "country", value: "Germany" });
});

test("no confidence/materiality is invented for Studio findings", () => {
  const f = fromStudyFinding(row, frozen);
  assert.equal(f.confidence, undefined);
  assert.equal(f.materiality, undefined);
  assert.equal(f.recommendations, undefined);
});

test("untagged historical base rows still classify as base", () => {
  const f = fromStudyFinding(row, [{ ref: "e9", optionLabel: "Legacy", count: 5, base: 50, percentage: 0.1 }]);
  assert.equal(f.evidence[0].kind, "base");
});
