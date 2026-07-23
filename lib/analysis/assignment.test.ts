import { test } from "node:test";
import assert from "node:assert/strict";
import { assignSource, needsOf, declaredNeeds } from "./assignment";
import { needIdFor } from "@/lib/information-needs";
import { SURVEY_CONTRACT, DOCUMENT_CONTRACT, CONVERSATION_CONTRACT } from "./source-contract";
import type { EvidenceRequirement, MethodRecommendation, ResearchMethod } from "@/lib/research-design";
import type { MethodFit } from "@/lib/information-needs";

// Evidence Assignment maps evidence that attaches to a PROJECT onto the
// QUESTIONS the approved design commissioned it to answer. The mapping is
// declared by the design, never inferred, and this file names no source.

const method = (m: ResearchMethod, fit: MethodFit): MethodRecommendation =>
  ({ method: m, fit, rationale: `${m} is ${fit}` });

const requirement = (over: Partial<EvidenceRequirement> = {}): EvidenceRequirement => ({
  role: "direct",
  requirement: "Understand how fans see the sponsorship",
  why_it_matters: "It decides renewal",
  aspect: "Brand Perception",
  information_needs: ["How do fans describe it?", "What do they associate with it?"],
  expected_availability: "moderate",
  availability_note: "",
  evidence_strategy: { recommended_methods: [method("conversation", "primary")], comparators: [], rationale: "" },
  ...over,
});

// ── The design decides, not the source ───────────────────────────────────────

test("a survey is assigned to the questions the design commissioned a survey for", () => {
  const req = requirement({ evidence_strategy: { recommended_methods: [method("survey", "primary")], comparators: [], rationale: "" } });
  const { assigned } = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] });

  assert.equal(assigned.length, 2, "one assignment per information need");
  assert.equal(assigned[0].viaMethod, "survey");
  assert.equal(assigned[0].need.method_fit, "primary");
});

test("a source the design never commissioned for a requirement is not assigned to it", () => {
  const req = requirement({ evidence_strategy: { recommended_methods: [method("conversation", "primary")], comparators: [], rationale: "" } });
  const { assigned, unassigned } = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] });

  assert.equal(assigned.length, 0);
  assert.ok(unassigned[0].reason.includes("did not commission"));
});

test("a method the design ruled out is reported with the design's own reason", () => {
  const req = requirement({ evidence_strategy: { recommended_methods: [method("survey", "not_suitable")], comparators: [], rationale: "" } });
  const { assigned, unassigned } = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] });

  assert.equal(assigned.length, 0);
  assert.ok(unassigned[0].reason.includes("Survey Research"));
  assert.ok(unassigned[0].reason.includes("unable to answer"));
});

test("the design's verdict travels onto the need, so admissibility can act on it", () => {
  const req = requirement({ evidence_strategy: { recommended_methods: [method("survey", "conditional")], comparators: [], rationale: "" } });
  const { assigned } = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] });
  assert.equal(assigned[0].need.method_fit, "conditional");
});

// ── Several methods, one source ──────────────────────────────────────────────

test("a source fulfilling several methods takes the verdict the design trusted least", () => {
  // A Research Library document may be an academic study, an industry report or
  // neither, and which it is cannot be recovered from the file. Where we cannot
  // tell which method a source represents, we assume the one trusted least.
  const req = requirement({
    evidence_strategy: {
      recommended_methods: [method("academic", "primary"), method("library", "conditional")],
      comparators: [],
      rationale: "",
    },
  });
  const { assigned } = assignSource({ fulfils: DOCUMENT_CONTRACT.fulfils, requirements: [req] });
  assert.equal(assigned[0].need.method_fit, "conditional");
});

test("one ruled-out method among several rules the source out of that requirement", () => {
  const req = requirement({
    evidence_strategy: {
      recommended_methods: [method("academic", "primary"), method("library", "not_suitable")],
      comparators: [],
      rationale: "",
    },
  });
  assert.equal(assignSource({ fulfils: DOCUMENT_CONTRACT.fulfils, requirements: [req] }).assigned.length, 0);
});

// ── Shared identity is what makes triangulation possible ─────────────────────

test("a question served by a survey and by conversation is one question, not two", () => {
  // The whole point. Assignment seeds need ids the same way the task generators
  // do, so cross-source evidence lands in ONE frame without any merge step.
  const req = requirement({
    evidence_strategy: {
      recommended_methods: [method("survey", "primary"), method("conversation", "primary")],
      comparators: [],
      rationale: "",
    },
  });
  const viaSurvey = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] });
  const viaConversation = assignSource({ fulfils: CONVERSATION_CONTRACT.fulfils, requirements: [req] });

  assert.deepEqual(
    viaSurvey.assigned.map(a => a.need.id),
    viaConversation.assigned.map(a => a.need.id),
  );
  assert.equal(viaSurvey.assigned[0].need.id, needIdFor("Brand Perception", "How do fans describe it?"));
});

// ── Edges ────────────────────────────────────────────────────────────────────

test("a requirement stating no answerable questions has nothing to assign evidence to", () => {
  const req = requirement({
    information_needs: [],
    evidence_strategy: { recommended_methods: [method("survey", "primary")], comparators: [], rationale: "" },
  });
  const { assigned, unassigned } = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] });
  assert.equal(assigned.length, 0);
  assert.ok(unassigned[0].reason.includes("no answerable questions"));
});

test("a requirement with no declared aspect still produces stable identities", () => {
  const req = requirement({ aspect: null, evidence_strategy: { recommended_methods: [method("survey", "primary")], comparators: [], rationale: "" } });
  const { assigned } = assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] });
  assert.equal(assigned[0].need.id, needIdFor("General", "How do fans describe it?"));
});

test("needsOf identifies every question a requirement states", () => {
  assert.equal(needsOf(requirement(), "primary").length, 2);
});

// ── The honest denominator ───────────────────────────────────────────────────

test("declared needs count every question the design set out to answer, once", () => {
  // Coverage is measured against what we set out to learn, not against what
  // evidence happened to arrive.
  const a = requirement();
  const b = requirement({ requirement: "Second", information_needs: ["How do fans describe it?", "Something else?"] });
  const declared = declaredNeeds([a, b]);

  assert.equal(declared.length, 3, "the question shared by two requirements is counted once");
});

test("no assignment reason uses an em-dash", () => {
  const req = requirement({ evidence_strategy: { recommended_methods: [method("survey", "not_suitable")], comparators: [], rationale: "" } });
  for (const u of assignSource({ fulfils: SURVEY_CONTRACT.fulfils, requirements: [req] }).unassigned) {
    assert.ok(!/[—–]/.test(u.reason), u.reason);
  }
});
