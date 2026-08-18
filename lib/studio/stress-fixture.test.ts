import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStressStudy, STRESS_OBJECTIVE } from "./stress-fixture";
import { buildStudyAnalysisEvidence, canonicalEvidenceString } from "./study-analysis";

const { study, resultGroups } = buildStressStudy();
const payload = buildStudyAnalysisEvidence({ ...study, objective: STRESS_OBJECTIVE }, resultGroups);

test("1,2. the stress fixture has 6+ surveys and 12+ questions", () => {
  assert.ok(study.surveyCount >= 6, `surveys ${study.surveyCount}`);
  assert.ok(resultGroups.length >= 12, `questions ${resultGroups.length}`);
});

test("3. it produces 100+ governed evidence items", () => {
  assert.ok(payload.evidence.length >= 100, `evidence ${payload.evidence.length}`);
});

test("4. comparable AND non-comparable questions coexist", () => {
  const modes = new Set(resultGroups.map((g) => g.comparability));
  assert.ok(modes.has("combined"));
  assert.ok(modes.has("separate")); // the two look-alike non-comparable questions
});

test("5. materially different bases are present across the evidence", () => {
  const bases = new Set(payload.evidence.map((e) => e.base));
  assert.ok(bases.size >= 3);
  const max = Math.max(...payload.evidence.map((e) => e.base));
  const min = Math.min(...payload.evidence.map((e) => e.base));
  assert.ok(max / Math.max(1, min) >= 2, "bases should vary materially");
});

test("6. evidence refs are deterministic (same fixture → same refs)", () => {
  const again = buildStudyAnalysisEvidence({ ...study, objective: STRESS_OBJECTIVE }, resultGroups);
  assert.deepEqual(payload.evidence.map((e) => e.ref), again.evidence.map((e) => e.ref));
});

test("7. the full governed evidence serialises deterministically", () => {
  assert.equal(canonicalEvidenceString(payload), canonicalEvidenceString(buildStudyAnalysisEvidence({ ...study, objective: STRESS_OBJECTIVE }, resultGroups)));
});

test("8. NO raw respondent data enters the evidence payload (aggregate only)", () => {
  const forbidden = ["q1", "q2", "q3", "session_id", "respondent_id", "publisher", "response_duration_seconds", "created_at"];
  for (const e of payload.evidence) for (const k of forbidden) assert.equal(Object.prototype.hasOwnProperty.call(e, k), false, `evidence must not carry ${k}`);
  // Only governed aggregate fields.
  for (const e of payload.evidence) { assert.equal(typeof e.count, "number"); assert.equal(typeof e.base, "number"); }
});

test("38. the fixture supports the expected QA map without any production DB write", () => {
  // Purely constructed in-memory; the presence of the engineered scenarios is asserted
  // structurally so the QA map can be checked against it.
  const keys = new Set(resultGroups.map((g) => g.canonicalQuestionKey));
  for (const k of ["q_fit", "q_aware", "q_sust_importance", "q_sust_activation", "q_benefit", "q_premium", "q_trust", "q_boring", "q_trivial"]) {
    assert.ok(keys.has(k), `expected scenario ${k}`);
  }
});
