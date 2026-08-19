import { test } from "node:test";
import assert from "node:assert/strict";
import type { FindingRow, EvidenceRow } from "@/lib/analysis/finding-store";
import { fromRpFinding } from "./rp-finding";

const row: FindingRow = {
  id: "f-1", research_project_id: "proj-1", requirement_key: "req_a", requirement_text: "Understand perception",
  need_id: "need_1", need_text: "How do fans perceive it?", aspect: "perception",
  statement: "Fans mostly perceive some relevance.", assertion_type: "descriptive", scope: "overall",
  temporal_validity: "point_in_time", warrant: "distribution", reading: "some relevance", is_null: false,
  confidence_level: "High", evidence_strength: "moderate", assessment: { factors: [] },
  disconfirmed: false, disconfirmation: {}, rank: 1, status: "candidate", authored_by: "engine",
  version: 1, run_id: "run-9", model: "gpt-4o", matrix_version: 1, assertion_taxonomy_version: 1,
};
const evidence: EvidenceRow[] = [{
  finding_id: "f-1", evidence_ref: "obs-1", stance: "establishes", admissibility: "admissible",
  constraint_note: null, contribution_kind: "elicited_perception", evidence_role: "direct",
  observation_key: "survey:412", observations: 412, bearing: 0.9, rejected: false,
  rejected_reason: null, snippet: "62% chose strong fit", provenance: "Survey 1",
}];

test("fromRpFinding maps claim, source, questions and status faithfully", () => {
  const f = fromRpFinding(row, evidence);
  assert.equal(f.statement, "Fans mostly perceive some relevance.");
  assert.equal(f.assertionType, "descriptive");
  assert.deepEqual(f.source, { projectId: "proj-1" });
  assert.deepEqual(f.questions, ["need_1"]);
  assert.equal(f.status, "candidate");
  assert.equal(f.analysisRunId, "run-9");
  assert.deepEqual(f.version, { standardVersion: null, coreVersion: null, runProvenance: "run-9" });
});

test("RP grade is preserved in sourceMeta, NOT mapped into Core confidence", () => {
  const f = fromRpFinding(row, evidence);
  assert.equal(f.confidence, undefined);          // not mapped
  assert.equal(f.materiality, undefined);
  assert.equal((f.sourceMeta as Record<string, unknown>).confidence_level, "High");
  assert.equal((f.sourceMeta as Record<string, unknown>).evidence_strength, "moderate");
});

test("evidence maps verbatim; RP citations carry no sourceType/sourceId (absent)", () => {
  const f = fromRpFinding(row, evidence);
  assert.equal(f.evidence.length, 1);
  const e = f.evidence[0];
  assert.equal(e.id, "obs-1");
  assert.equal(e.kind, "base");
  assert.equal(e.observationKey, "survey:412");
  assert.equal(e.sourceType, undefined);          // RP row has no plain source type
  assert.equal(e.sourceId, undefined);
  assert.equal((e.sourceMeta as Record<string, unknown>).contribution_kind, "elicited_perception");
  assert.equal((e.sourceMeta as Record<string, unknown>).bearing, 0.9);
});

test("no interpretive fields are fabricated", () => {
  const f = fromRpFinding(row, evidence);
  for (const k of ["insight", "implications", "recommendations", "caveats", "priority", "claimStrength", "change"]) {
    assert.equal((f as Record<string, unknown>)[k], undefined, `${k} must be absent`);
  }
});
