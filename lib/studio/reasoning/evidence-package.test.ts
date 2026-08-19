// ── Research Reasoner — evidence package construction (pure) ─────────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReasonerPackage } from "./evidence-package";

const SNAP = {
  study: { name: "T", objective: "obj", completedResponses: 196, respondentUniquenessProven: false },
  evidence: [
    { ref: "r1", scope: "combined", canonicalQuestionKey: "q1", question: "Q1?", optionLabel: "A", count: 62, base: 196, percentage: 0.3163 },
    { ref: "r2", scope: "combined", canonicalQuestionKey: "q1", question: "Q1?", optionLabel: "B", count: 58, base: 196, percentage: 0.296 },
    { ref: "r3", scope: "survey", canonicalQuestionKey: "q1", question: "Q1?", optionLabel: "A", count: 1, base: 3, percentage: 0.33 }, // non-combined → excluded
  ],
  derived: [
    { ref: "d-lead", kind: "leader", canonicalQuestionKey: "q1", label: "Leading A (31.6%) ahead of B (29.6%)", value: 2, detail: { leaderPct: 31.6 } },
    { ref: "d-grp", kind: "grouped_share", canonicalQuestionKey: "q1", label: "A or B account for 61.2%", value: 61.2, detail: {} },
  ],
  segmentDerived: [
    { ref: "s-mk", kind: "seg_concentration", canonicalQuestionKey: "q1", dimension: "market", label: "A 41.9% of UK vs 25.1% overall", value: 16.8, detail: { groupPct: 41.9 } },
    { ref: "s-dv", kind: "seg_reversal", canonicalQuestionKey: "q1", dimension: "device", label: "differs by device", value: 2, detail: {} },
  ],
};

test("full combined distributions become questions with SHORT ids; non-combined excluded", () => {
  const { pkg, validRefs } = buildReasonerPackage(SNAP as never, []);
  assert.equal(pkg.questions.length, 1);
  assert.equal(pkg.questions[0].options.length, 2, "the survey-scope row is excluded");
  assert.ok(pkg.questions[0].options.every((o) => /^e\d+$/.test(o.id)), "options carry short e-ids");
  assert.ok([...validRefs].some((r) => r === "e1"), "short ids are the valid citation tokens");
  assert.ok(![...validRefs].some((r) => r === "r1"), "raw snapshot refs are NOT citation tokens");
});

test("grouped_share is flagged UNGOVERNED with an explicit hold note; leader is governed", () => {
  const { pkg, groupedShareRefs } = buildReasonerPackage(SNAP as never, []);
  const grp = pkg.derivedFacts.find((d) => d.kind === "grouped_share")!;
  const lead = pkg.derivedFacts.find((d) => d.kind === "leader")!;
  assert.equal(grp.governed, false);
  assert.match(grp.note ?? "", /UNGOVERNED/);
  assert.equal(lead.governed, true);
  assert.ok(groupedShareRefs.has(grp.id), "grouped-share id tracked for the verifier");
});

test("segment dimensionClass separates research (market) from technical (device)", () => {
  const { pkg } = buildReasonerPackage(SNAP as never, []);
  assert.equal(pkg.segmentFacts.find((s) => s.dimension === "market")!.dimensionClass, "research");
  assert.equal(pkg.segmentFacts.find((s) => s.dimension === "device")!.dimensionClass, "technical");
});

test("the package invents NO context — only snapshot-derived fields + fixed limitations", () => {
  const { pkg } = buildReasonerPackage(SNAP as never, []);
  assert.equal(pkg.survey.name, "T");
  assert.equal(pkg.survey.respondents, 196);
  assert.ok(pkg.dataLimitations.some((l) => /aggregate/i.test(l)) && pkg.dataLimitations.some((l) => /respondent uniqueness is NOT proven/i.test(l)));
  // numbersByRef only holds numbers actually present in the evidence.
  const { numbersByRef } = buildReasonerPackage(SNAP as never, []);
  assert.ok(numbersByRef.get("e1")!.includes(31.6));
});

test("refToQuestion maps every citable id back to its question (for cross-question guard)", () => {
  const { refToQuestion } = buildReasonerPackage(SNAP as never, []);
  assert.equal(refToQuestion.get("e1"), "q1");
  assert.equal(refToQuestion.get("d1"), "q1");
  assert.equal(refToQuestion.get("s1"), "q1");
});
