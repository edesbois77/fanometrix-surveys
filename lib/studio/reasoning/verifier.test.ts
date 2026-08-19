// ── Research Reasoner — verifier (pure; reuses the production firewall) ──────
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClaimContext, verifyClaimText, verifyReasoning } from "./verifier";
import type { ReasonerOutput } from "./reasoning-schema";

const ctx = buildClaimContext({
  validRefs: new Set(["e1", "e2", "d1"]),
  numbersByRef: new Map([["e1", [31.6]], ["e2", [29.6]], ["d1", [61.2]]]),
  groupedShareRefs: new Set(["d1"]),
  refToQuestion: new Map([["e1", "q1"], ["e2", "q1"], ["d1", "q1"]]),
});

test("a clean claim citing a real id with a supported number PASSES", () => {
  assert.equal(verifyClaimText(ctx, "A was chosen by 31.6% of respondents.", ["e1"], { requireRefs: true }).verdict, "PASS");
});

test("a fabricated evidence ref is REJECTED (fail closed)", () => {
  const r = verifyClaimText(ctx, "Germany leads.", ["e999"], { requireRefs: true });
  assert.equal(r.verdict, "REJECT");
  assert.ok(r.badRefs.includes("e999"));
});

test("a quoted number not supported by the cited evidence is REJECTED", () => {
  const r = verifyClaimText(ctx, "72% rated it highly.", ["e1"], { requireRefs: true });
  assert.equal(r.verdict, "REJECT");
  assert.ok(r.badNums.includes("72%"));
});

test("a SUMMED combined share (61.2% = A+B) is caught unless the governed grouped_share is cited", () => {
  // Quoting 61.2% while citing only the two option ids → the number is unsupported.
  assert.equal(verifyClaimText(ctx, "Together A and B reach 61.2%.", ["e1", "e2"], { requireRefs: true }).verdict, "REJECT");
});

test("significance / causal / respondent-correlation language SOFTENS a would-be measured claim", () => {
  assert.equal(verifyClaimText(ctx, "A is significantly ahead.", ["e1"], { requireRefs: true }).verdict, "SOFTEN");
  assert.equal(verifyClaimText(ctx, "A leads, caused by strong preference.", ["e1"], { requireRefs: true }).verdict, "SOFTEN");
  assert.equal(verifyClaimText(ctx, "The same respondents who chose A also chose B.", ["e1", "e2"], { requireRefs: true }).verdict, "SOFTEN");
});

test("prescription is allowed ONLY inside an implication", () => {
  assert.equal(verifyClaimText(ctx, "The client should launch a loyalty programme.", ["e1"], { requireRefs: true, type: "synthesis" }).verdict, "SOFTEN");
  assert.equal(verifyClaimText(ctx, "The client should launch a loyalty programme.", ["e1"], { requireRefs: true, type: "implication" }).verdict, "PASS");
});

test("boundary statements (cannotConclude) are never graded — they may name causal/significance to disclaim it", () => {
  const r = verifyClaimText(ctx, "We cannot establish whether A causes B, nor any statistically significant difference.", [], { requireRefs: false, boundary: true });
  assert.equal(r.verdict, "PASS");
  assert.equal(r.reasons.length, 0);
});

test("verifyReasoning aggregates and never lets a fabrication count as pass", () => {
  const out: ReasonerOutput = {
    executiveStory: { headline: "A leads", summary: "A is 31.6%.", evidenceRefs: ["e1"] },
    insights: [
      { id: "i1", title: "ok", type: "synthesis", statement: "A (31.6%) exceeds B (29.6%).", whyItMatters: "x", evidenceRefs: ["e1", "e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
      { id: "i2", title: "bad", type: "interpretation", statement: "88% love it.", whyItMatters: "x", evidenceRefs: ["e1"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
    ],
    supportingObservations: [], tensions: [], openQuestions: [], cannotConclude: ["No causal claims possible."],
  };
  const v = verifyReasoning(out, new Set(["e1", "e2", "d1"]), ctx.numbersByRef, ctx.groupedShareRefs, ctx.refToQuestion);
  assert.ok(v.counts.reject >= 1, "the 88% fabrication is rejected");
  assert.equal(v.fabricatedNumbers.length >= 1, true);
});
