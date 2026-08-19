// ── Stage 5R.1 — Construct-authority safety ceiling (deterministic, no live AI) ─
// Guards against recurrence of the Stage 5 empirical leak: a model-only novel
// quantitative construct must acquire only PROVISIONAL authority and can never
// exceed Contextual priority — regardless of confidence/materiality/relevance/
// base/significance/magnitude — while simple descriptive Findings are unaffected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAnalysis } from "./analyse";
import { assignPriority } from "../assessment/ranking";
import { FixtureGroupingProposer, type GroupingProposal, type SemanticGroupingProposer } from "../semantic/grouping";
import { proportion } from "../evidence/scale";
import type { Candidate } from "../candidates/types";
import type { Evidence } from "../evidence/types";
import type { Finding } from "../findings/types";
import type {
  RankingInput,
} from "../assessment/ranking";

const OBJ = "Understand fan value and access preferences for the sponsorship.";
// The most CONFIDENT possible model proposal (low ambiguity, no competing reading).
const propose = (construct = "some construct"): GroupingProposal => ({ proposedConstruct: construct, proposedLabel: construct, ambiguity: "low", competingInterpretations: false, rationale: [] });

/** A structurally-VALID same-question 2-option grouping (arithmetic is fine — only
 *  its construct authority is in question). `qkey` lets two differ only by label. */
function validGrouping(id: string, aLabel: string, bLabel: string): Candidate {
  const base = 200;
  const ev = (oid: string, n: number, label: string): Evidence => ({
    id: `${id}:${oid}`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s",
    question: { canonicalKey: `q_${id}`, text: "Qx" }, option: { id: oid, label },
    numerator: n, denominator: base, denominatorType: "respondents", quantity: proportion(n / base),
  });
  return {
    id, kind: "semantic_grouping", claim: "construct unverified", sourceQuestionKeys: [`q_${id}`],
    evidence: [ev("a", 80, aLabel), ev("b", 60, bLabel)],
    results: [{ id: `${id}#grp`, operation: "grouping", quantity: proportion(140 / base), components: [`${id}:a`, `${id}:b`], grouping: { kind: "governed_semantic", componentLabels: [aLabel, bLabel], parentConstruct: "construct unverified" } }],
    provenance: { generator: "external-model", deterministic: false, modelProposed: true },
    reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review",
  };
}

// ── Test A — model approval alone yields ONLY provisional authority ────────────
test("A: a model-proposed novel grouping gets a PROVISIONAL interpretation (not declared/derived/attested)", () => {
  const g = validGrouping("g1", "A", "B");
  const proposer = new FixtureGroupingProposer({ g1: propose() });
  const o = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: proposer, externalCandidates: [g] })
    .outcomes.find((x) => x.candidate.id === "g1")!;
  assert.equal(o.finalState, "promoted");                       // retained, not rejected
  // Authority lives on the Result's interpretation (Stage 5R.2 single source).
  const interp = o.candidate.results!.find((r) => r.interpretation)!.interpretation!;
  assert.equal(interp.decision, "approved");                    // plausible…
  assert.equal(interp.authority, "provisional");                // …but model cannot self-grant more
  assert.equal(interp.provenance, "model_proposed");
  assert.notEqual(interp.authority, "declared");
  assert.notEqual(interp.authority, "derived");
  assert.notEqual(interp.authority, "attested");
  // Review requirement is NOT erased by approval (the Stage 5 leak).
  assert.ok(o.candidate.reviewRequirements.length > 0);
  assert.equal(interp.reviewRequired, true);
});

// ── Test B — the ceiling holds under every strong signal ───────────────────────
test("B: a PROVISIONAL novel construct is capped at Contextual even with high confidence/materiality/relevance/n>=100/supported stat", () => {
  const provisional: Finding = {
    id: "p", statement: "A novel construct", evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }],
    results: [{ id: "grp", operation: "grouping", quantity: proportion(0.7), grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "some construct" } }],
    constructAuthority: "provisional",
    version: { standardVersion: "1.2", coreVersion: "0.1.0", runProvenance: null }, status: "candidate",
  };
  const strong = (f: Finding): RankingInput => ({
    eligibility: { level: "eligible", reasons: [], caveats: [], governanceIssueIds: [], assessor: "deterministic" },
    confidence: { level: "high", reasons: [], constraints: [], assessor: "deterministic" },
    materiality: { level: "critical", reasons: [], constraints: [], assessor: "deterministic", modelAssistedNeeded: [] },
    relevance: { level: "high", reasons: [], assessor: "deterministic" },
    redundancy: { subsumedBy: null, kind: "none", reason: null, semanticReviewNeeded: false },
    finding: f,
  });
  assert.equal(assignPriority(strong(provisional)).priority, "contextual");
  // The SAME strong signals WITHOUT provisional authority reach Primary — proving
  // the cap comes from authority, not from weak evidence.
  const authoritative: Finding = { ...provisional, constructAuthority: "derived" };
  assert.equal(assignPriority(strong(authoritative)).priority, "primary");
});

// ── Test C — no model review signal can lift authority (5R.5) ──────────────────
test("C: the most confident model proposal, and model review signals, cannot raise authority above PROVISIONAL", () => {
  // Even a maximally-confident proposal (low ambiguity, no competing reading) →
  // provisional. There is no `humanReviewRequired`-style approval field any more.
  const confident = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: new FixtureGroupingProposer({ g: propose() }), externalCandidates: [validGrouping("g", "A", "B")] }).outcomes.find((x) => x.candidate.id === "g")!;
  assert.equal(confident.candidate.results!.find((r) => r.interpretation)!.interpretation!.authority, "provisional");
  assert.equal(confident.priority, "contextual");
  // A proposal flagging ambiguity/competing interpretations is likewise provisional.
  const flagged = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: new FixtureGroupingProposer({ g: { proposedConstruct: "x", ambiguity: "high", competingInterpretations: true, rationale: [] } }), externalCandidates: [validGrouping("g", "A", "B")] }).outcomes.find((x) => x.candidate.id === "g")!;
  assert.equal(flagged.candidate.results!.find((r) => r.interpretation)!.interpretation!.authority, "provisional");
});

// ── No string-coupled authority ────────────────────────────────────────────────
test("authority is structured, not label-coupled: two provisional groupings with different labels get the same ceiling", () => {
  const proposer: SemanticGroupingProposer = new FixtureGroupingProposer({ x: propose(), y: propose() });
  const outs = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: proposer, externalCandidates: [validGrouping("x", "Relevant but unclear", "Never noticed"), validGrouping("y", "Totally different wording", "Another label")] }).outcomes;
  const px = outs.find((o) => o.candidate.id === "x")!.priority;
  const py = outs.find((o) => o.candidate.id === "y")!.priority;
  assert.equal(px, "contextual");
  assert.equal(py, "contextual");
  assert.equal(px, py); // label wording is irrelevant to the ceiling
});

// ── Simple descriptive Findings are unaffected ─────────────────────────────────
test("a simple descriptive finding with NO novel construct can still reach Primary (no authority ceiling)", () => {
  const descriptive: Finding = {
    id: "d", statement: "Rewards leads the next option by a clear margin.",
    evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }],
    results: [{ id: "cmp", operation: "comparison", quantity: proportion(0.15) }],
    // NOTE: constructAuthority intentionally ABSENT — no novel construct introduced.
    version: { standardVersion: "1.2", coreVersion: "0.1.0", runProvenance: null }, status: "candidate",
  };
  const strong: RankingInput = {
    eligibility: { level: "eligible", reasons: [], caveats: [], governanceIssueIds: [], assessor: "deterministic" },
    confidence: { level: "high", reasons: [], constraints: [], assessor: "deterministic" },
    materiality: { level: "high", reasons: [], constraints: [], assessor: "deterministic", modelAssistedNeeded: [] },
    relevance: { level: "high", reasons: [], assessor: "deterministic" },
    redundancy: { subsumedBy: null, kind: "none", reason: null, semanticReviewNeeded: false },
    finding: descriptive,
  };
  assert.equal(descriptive.constructAuthority, undefined);
  assert.equal(assignPriority(strong).priority, "primary"); // the ceiling does not touch authority-less Findings
});

test("a pipeline leading option carries no authority field and is never authority-capped to Contextual", () => {
  const input = { questions: [{ questionKey: "value", questionText: "value", base: 274, sourceType: "survey" as const, contribution: "elicited_perception" as const, options: [{ id: "rewards", label: "Rewards", count: 130 }, { id: "experiences", label: "Experiences", count: 74 }, { id: "other", label: "Other", count: 70 }] }], objective: OBJ };
  const lead = runAnalysis(input).outcomes.find((x) => x.candidate.kind === "leading_option")!;
  assert.equal(lead.candidate.constructAuthority, undefined);            // no novel construct → no authority
  assert.ok(["primary", "secondary"].includes(lead.priority ?? ""));     // ranked on merit, not capped
});

// ── Arithmetic before model + abstention ───────────────────────────────────────
test("a structurally-invalid (cross-question) grouping is rejected BEFORE the semantic model is called", () => {
  let judged = 0;
  const spy: SemanticGroupingProposer = { propose() { judged++; return { proposedConstruct: "x", ambiguity: "low", competingInterpretations: false, rationale: [] }; } };
  // Cross-question grouping: two different canonical keys → structural reject.
  const base = 100;
  const ev = (qk: string, oid: string, n: number): Evidence => ({ id: `${qk}:${oid}`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", question: { canonicalKey: qk }, option: { id: oid }, numerator: n, denominator: base, denominatorType: "respondents", quantity: proportion(n / base) });
  const crossQ: Candidate = {
    id: "xq", kind: "semantic_grouping", claim: "cross-question sum", sourceQuestionKeys: ["q1", "q2"],
    evidence: [ev("q1", "a", 40), ev("q2", "b", 35)],
    results: [{ id: "xq#grp", operation: "grouping", quantity: proportion(0.75), components: ["q1:a", "q2:b"], grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "construct unverified" } }],
    provenance: { generator: "external-model", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_construct"], state: "held_for_semantic_review",
  };
  const o = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: spy, externalCandidates: [crossQ] }).outcomes.find((x) => x.candidate.id === "xq")!;
  assert.equal(judged, 0);                 // model never consulted
  assert.equal(o.finalState, "rejected");  // structural failure stands
});

test("an abstained grouping (model offers no construct) never becomes authoritative", () => {
  // Unknown candidate → FixtureGroupingProposer abstains (no construct) → held.
  const o = runAnalysis({ questions: [], objective: OBJ }, { groupingProposer: new FixtureGroupingProposer({}), externalCandidates: [validGrouping("h", "A", "B")] }).outcomes.find((x) => x.candidate.id === "h")!;
  assert.equal(o.finalState, "held_for_semantic_review");
  // Abstention/hold attaches NO interpretation → no authority granted.
  assert.equal(o.candidate.results!.find((r) => r.interpretation), undefined);
  assert.notEqual(o.priority, "primary");
  assert.notEqual(o.priority, "secondary");
});
