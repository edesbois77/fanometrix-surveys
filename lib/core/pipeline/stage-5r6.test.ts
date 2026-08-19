// ── Stage 5R.6 — synthesis governance + claim-level disconfirmation ────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAnalysis } from "./analyse";
import { FixtureSynthesisProposer, type SynthesisProposal } from "../semantic/synthesis";
import { disconfirmationEffect } from "../disconfirmation/assess";
import type { DisconfirmationAssessment, DisconfirmationKind, DisconfirmationStatus } from "../disconfirmation/types";
import type { DiscoveryInput } from "../candidates/types";

const OBJ = "Understand fan value and access preferences for the sponsorship.";
const q = (key: string, opts: [string, number][], base: number) => ({ questionKey: key, questionText: key, base, sourceType: "survey" as const, contribution: "elicited_perception" as const, options: opts.map(([id, count]) => ({ id, label: id, count })) });
const SYN: SynthesisProposal = { id: "syn", claim: "Across questions fans favour value and access.", construct: "value/access", questionKeys: ["v1", "v2"], componentCandidateIds: ["v1#lead", "v2#lead"] };
const formsStory = new FixtureSynthesisProposer({ syn: { formsStory: true, ambiguity: "low", rationale: [] } });
// Two questions, each with a clear leader so the components surface.
const input = (extra: Partial<DiscoveryInput> = {}): DiscoveryInput => ({ questions: [q("v1", [["rewards", 150], ["b", 60], ["c", 64]], 274), q("v2", [["access", 130], ["b", 80], ["c", 64]], 274)], objective: OBJ, ...extra });
const synOutcome = (opts: Parameters<typeof runAnalysis>[1]) => runAnalysis(input(), opts).outcomes.find((o) => o.candidate.id === "syn");

// ── Synthesis ranking (§20) ────────────────────────────────────────────────────
test("A: a model-proposed synthesis is never automatically Primary", () => {
  const o = synOutcome({ synthesisProposals: [SYN], synthesisProposer: formsStory })!;
  assert.equal(o.finalState, "promoted");
  assert.notEqual(o.priority, "primary");            // ≤ Secondary
  assert.ok(["secondary", "contextual"].includes(o.priority ?? ""));
});

test("B: a synthesis does not create a new quantitative Result (no percentage/quantity)", () => {
  const o = synOutcome({ synthesisProposals: [SYN], synthesisProposer: formsStory })!;
  assert.ok(!(o.candidate.results ?? []).some((r) => !!r.quantity));
});

test("C: synthesis abstention → held, nothing invented (no forced 'big story')", () => {
  const o = synOutcome({ synthesisProposals: [SYN], synthesisProposer: new FixtureSynthesisProposer({}) })!; // abstains
  assert.equal(o.finalState, "held_for_semantic_review");
});

test("D: a structurally-invalid synthesis (new percentage) is rejected", () => {
  const bad: SynthesisProposal = { ...SYN, claim: "69.3% of fans value benefits and access." };
  const o = synOutcome({ synthesisProposals: [bad], synthesisProposer: formsStory })!;
  assert.equal(o.finalState, "rejected");
});

// ── Synthesis safety (§22–§25) ─────────────────────────────────────────────────
test("§22 causal synthesis over elicited-perception evidence is held (no governed causal support)", () => {
  const o = synOutcome({ synthesisProposals: [{ ...SYN, claimType: "causal" }], synthesisProposer: formsStory })!;
  assert.equal(o.finalState, "held_for_semantic_review");
  assert.match(o.decisionReason, /causal/i);
});

test("§23 temporal synthesis without a governed comparable change is held", () => {
  const o = synOutcome({ synthesisProposals: [{ ...SYN, claimType: "temporal" }], synthesisProposer: formsStory })!;
  assert.equal(o.finalState, "held_for_semantic_review");
  assert.match(o.decisionReason, /temporal/i);
});

test("§25 a significance claim without a supported statistical assessment is held", () => {
  const o = synOutcome({ synthesisProposals: [{ ...SYN, assertsSignificance: true }], synthesisProposer: formsStory })!;
  assert.equal(o.finalState, "held_for_semantic_review");
  assert.match(o.decisionReason, /statistical/i);
});

// ── Claim-level disconfirmation (§13, §21) ─────────────────────────────────────
const dis = (status: DisconfirmationStatus, kinds: DisconfirmationKind[]): DisconfirmationAssessment => ({ status, kinds, evidenceIds: [], reasons: ["reason"], reviewRequired: false, assessor: "deterministic" });

test("§13 an alternative explanation (causal challenge) does NOT demote a valid descriptive observation", () => {
  const eff = disconfirmationEffect(dis("materially_weakened", ["alternative_explanation"]));
  assert.equal(eff.suppress, false);
  assert.equal(eff.demoteTo, null);                  // caveat only
  assert.ok(eff.caveats.length > 0);
});

test("a construct-mismatch (interpretation challenge) does not demote the observation either", () => {
  const eff = disconfirmationEffect(dis("materially_weakened", ["construct_mismatch"]));
  assert.equal(eff.demoteTo, null);
});

test("§21B/C a challenge to the CORE observation can demote/suppress", () => {
  assert.equal(disconfirmationEffect(dis("materially_weakened", ["weak_magnitude"])).demoteTo, "contextual");
  assert.equal(disconfirmationEffect(dis("materially_weakened", ["base_limitation"])).demoteTo, "contextual");
  assert.equal(disconfirmationEffect(dis("contradicted", ["direct_contradiction"])).suppress, true);
});

test("a contradiction that targets only a causal claim does NOT suppress the descriptive observation", () => {
  const eff = disconfirmationEffect(dis("contradicted", ["alternative_explanation"]));
  assert.equal(eff.suppress, false);                 // no core-observation contradiction
  assert.equal(eff.demoteTo, null);
});

test("§21E none_found neither demotes nor boosts (clean pass is not proof of truth)", () => {
  const eff = disconfirmationEffect(dis("none_found", []));
  assert.equal(eff.suppress, false);
  assert.equal(eff.demoteTo, null);
});

// ── Product-agnostic (§29, §31) ────────────────────────────────────────────────
test("§31 campaign: an observed metric change survives while a causal attribution is unsupported", () => {
  // The descriptive observation stands (alternative explanation = caveat)…
  assert.equal(disconfirmationEffect(dis("materially_weakened", ["alternative_explanation"])).demoteTo, null);
  // …and a causal synthesis of that movement cannot be asserted without behavioural evidence.
  const campaign: DiscoveryInput = { questions: [q("reach", [["up", 6000], ["flat", 4000]], 10000), q("engage", [["down", 5500], ["flat", 4500]], 10000)], objective: OBJ };
  const o = runAnalysis(campaign, { synthesisProposals: [{ id: "syn", claim: "quality deteriorated", construct: "quality", questionKeys: ["reach", "engage"], componentCandidateIds: ["reach#lead", "engage#lead"], claimType: "causal" }], synthesisProposer: formsStory }).outcomes.find((o2) => o2.candidate.id === "syn")!;
  assert.equal(o.finalState, "held_for_semantic_review"); // causal claim unsupported
});
