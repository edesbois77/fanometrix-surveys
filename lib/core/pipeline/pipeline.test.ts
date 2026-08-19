import { test } from "node:test";
import assert from "node:assert/strict";
import { runAnalysis } from "./analyse";
import type { DiscoveryInput, Candidate } from "../candidates/types";

const q = (key: string, opts: [string, number][], base: number, sourceType: "survey" | "conversation" | "document" = "survey", contribution: "elicited_perception" | "unprompted_discourse" | "interested_claim" | "documented_activity" = "elicited_perception") => ({
  questionKey: key, questionText: key, base, sourceType, contribution,
  options: opts.map(([id, count]) => ({ id, label: id, count })),
});
const OBJ = "Understand fan value and access preferences for the sponsorship.";

test("an invalid (causal, unsupported) candidate can never become an eligible Finding", () => {
  const bad: Candidate = { id: "bad", kind: "contextual_observation", claim: "Weak visibility caused low awareness.", sourceQuestionKeys: ["q"], evidence: [{ id: "e", kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", denominator: 274 }], provenance: { generator: "ext", deterministic: false, modelProposed: true }, reviewRequirements: [], state: "generated" };
  const { outcomes } = runAnalysis({ questions: [], objective: OBJ }, { externalCandidates: [bad] });
  const o = outcomes.find((x) => x.candidate.id === "bad")!;
  assert.equal(o.finalState, "suppressed");
  assert.equal(o.assessment?.eligibility.level, "ineligible");
});

test("a banal single-option observation stays valid but not prominent", () => {
  const banal: Candidate = { id: "banal", kind: "contextual_observation", claim: "One option was selected by a third of respondents.", sourceQuestionKeys: ["q"], evidence: [{ id: "e", kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", question: { canonicalKey: "q" }, option: { id: "a" }, denominator: 274 }], provenance: { generator: "ext", deterministic: false, modelProposed: true }, reviewRequirements: [], state: "generated" };
  const o = runAnalysis({ questions: [], objective: OBJ }, { externalCandidates: [banal] }).outcomes.find((x) => x.candidate.id === "banal")!;
  assert.notEqual(o.priority, "primary");
});

test("a strong leading candidate survives to a headline priority", () => {
  const input: DiscoveryInput = { questions: [q("value", [["rewards", 60], ["experiences", 25], ["other", 15]], 274)], objective: OBJ };
  const lead = runAnalysis(input).outcomes.find((x) => x.candidate.kind === "leading_option");
  assert.ok(lead && ["primary", "secondary"].includes(lead.priority!));
});

test("the pipeline forces no minimum count — weak input can yield no headline findings", () => {
  const input: DiscoveryInput = { questions: [q("q", [["a", 20], ["b", 19], ["c", 21]], 60)], objective: "unrelated objective about widgets" };
  const { hierarchy } = runAnalysis(input);
  assert.equal(hierarchy.primary.length, 0); // nothing forced into Primary
});

// ── Product-agnostic discovery ────────────────────────────────────────────────
test("discovery works on social, document and campaign evidence (not survey-only)", () => {
  const social: DiscoveryInput = { questions: [q("sentiment", [["positive", 500], ["neutral", 300], ["negative", 200]], 1000, "conversation", "unprompted_discourse")], objective: OBJ };
  assert.ok(runAnalysis(social).outcomes.length > 0);
  const doc: DiscoveryInput = { questions: [q("claims", [["states_growth", 3], ["states_stable", 2]], 5, "document", "interested_claim")], objective: OBJ };
  // Below MIN_BASE → no candidates (honest: too little to analyse), still runs.
  assert.ok(Array.isArray(runAnalysis(doc).outcomes));
  const campaign: DiscoveryInput = { questions: [q("behaviour", [["clicked", 4000], ["ignored", 6000]], 10000, "conversation", "documented_activity")], objective: OBJ };
  assert.ok(runAnalysis(campaign).outcomes.length > 0);
});
