// ── Stage 6 — Core → product projection (pure) ───────────────────────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectAnalysis } from "./projection";
import { studioEvidenceToGovernedInput, type StudioEvidenceSnapshot } from "./studio-evidence-adapter";
import { studioToDiscoveryInput } from "./adapter";
import { runAnalysis } from "../pipeline/analyse";
import type { SemanticGroupingProposer } from "../semantic/grouping";

// A governed 4-point satisfaction snapshot (top-box 1+2, base 200).
function governedSnapshot(): StudioEvidenceSnapshot {
  const base = 200;
  const rows = [
    { optionId: "1", optionLabel: "Very satisfied", count: 90, op: 4, pol: "positive" as const },
    { optionId: "2", optionLabel: "Satisfied", count: 70, op: 3, pol: "positive" as const },
    { optionId: "3", optionLabel: "Dissatisfied", count: 25, op: 2, pol: "negative" as const },
    { optionId: "4", optionLabel: "Very dissatisfied", count: 15, op: 1, pol: "negative" as const },
  ];
  return {
    study: { id: "S", objective: "satisfaction" },
    evidence: rows.map((r) => ({
      canonicalQuestionKey: "q1", question: "How satisfied are you?", scope: "combined",
      optionId: r.optionId, optionLabel: r.optionLabel, count: r.count, base,
      scaleType: "ordinal", constructKey: "satisfaction", ordinalPosition: r.op, polarity: r.pol,
    })),
  };
}
const project = (snap: StudioEvidenceSnapshot, proposer?: SemanticGroupingProposer) =>
  projectAnalysis(runAnalysis(studioToDiscoveryInput(studioEvidenceToGovernedInput(snap, { kind: "survey", id: "S" })), proposer ? { groupingProposer: proposer } : {}));

test("§A governed survey → a Core DERIVED finding projects as a 'governed' product finding with statistic + evidence", () => {
  const p = project(governedSnapshot());
  const governed = p.findings.filter((f) => f.basis === "governed");
  assert.ok(governed.length >= 1, "at least one governed finding");
  const topbox = governed.find((f) => f.statistic === "80%"); // 90+70 of 200
  assert.ok(topbox, "top-box 80% governed finding present");
  assert.match(topbox!.title, /selected/i);
  // Tier is the Core's ranking call (not asserted here — Stage 6 does not tune it);
  // a governed finding is eligible for headline presentation (never re-tiered down).
  assert.ok(["key", "supporting", "context"].includes(topbox!.tier));
  assert.ok(topbox!.evidence.length >= 2, "carries its base evidence");
  assert.ok(topbox!.evidence.every((e) => e.base === 200), "evidence base traces to source");
  // §M no engine jargon leaks
  assert.doesNotMatch(topbox!.title, /threshold recode|constructId|authority|provisional/i);
});

test("§B a model-only (provisional) grouping can NEVER be a key finding (re-tiered to context)", () => {
  // A custom (no-semantics) question so the grouping is unable → model proposes.
  const base = 200;
  const custom: StudioEvidenceSnapshot = { study: { id: "S", objective: "o" }, evidence: [
    { canonicalQuestionKey: "qc", question: "Which most?", scope: "combined", optionId: "1", optionLabel: "A", count: 70, base },
    { canonicalQuestionKey: "qc", question: "Which most?", scope: "combined", optionId: "2", optionLabel: "B", count: 60, base },
    { canonicalQuestionKey: "qc", question: "Which most?", scope: "combined", optionId: "3", optionLabel: "C", count: 40, base },
    { canonicalQuestionKey: "qc", question: "Which most?", scope: "combined", optionId: "4", optionLabel: "D", count: 30, base },
  ] };
  const proposer: SemanticGroupingProposer = { propose: () => ({ proposedConstruct: "some theme", ambiguity: "low", competingInterpretations: false, rationale: [] }) };
  const p = project(custom, proposer);
  const exploratory = p.findings.filter((f) => f.basis === "exploratory");
  for (const f of exploratory) assert.notEqual(f.tier, "key", "a model-origin reading is never a key finding");
  for (const f of exploratory) assert.ok(f.caveats.some((c) => /possible interpretation/i.test(c)), "exploratory carries a non-deceptive caveat");
  // No governed/derived finding on a custom question.
  assert.equal(p.findings.filter((f) => f.basis === "governed").length, 0, "custom question yields no governed finding");
});

test("§C historic snapshot (no governed semantics) is safe: descriptive-only, no governed findings", () => {
  const base = 200;
  const historic: StudioEvidenceSnapshot = { study: { id: "OLD", objective: null }, evidence: [
    { canonicalQuestionKey: "q", question: "Pick", scope: "combined", optionId: "1", optionLabel: "A", count: 120, base },
    { canonicalQuestionKey: "q", question: "Pick", scope: "combined", optionId: "2", optionLabel: "B", count: 80, base },
  ] };
  const p = project(historic);
  assert.equal(p.findings.filter((f) => f.basis === "governed").length, 0);
  assert.ok(p.findings.every((f) => f.basis !== "exploratory"), "no model run ⇒ no exploratory content");
});

test("§H statistic + evidence lineage: every projected evidence figure has a base and a percentage", () => {
  const p = project(governedSnapshot());
  for (const f of p.findings) for (const e of f.evidence) {
    assert.ok(e.base > 0, "evidence has a base");
    assert.ok(e.percentage == null || (e.percentage >= 0 && e.percentage <= 100));
  }
});

test("counts summarise the tiers", () => {
  const p = project(governedSnapshot());
  assert.equal(p.counts.key, p.findings.filter((f) => f.tier === "key").length);
  assert.equal(p.deterministic, true);
  assert.equal(p.generatedFrom, "immutable_snapshot");
});
