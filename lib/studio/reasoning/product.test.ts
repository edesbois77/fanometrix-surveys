// ── Research Reasoner — product shaping: soften / citation / authority (pure) ─
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReasonerPackage } from "./evidence-package";
import { shapeIntelligence } from "./product";
import type { ReasonerOutput } from "./reasoning-schema";

const SNAP = {
  study: { name: "T", objective: null, completedResponses: 196, respondentUniquenessProven: false },
  evidence: [
    { ref: "r1", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Strong fit", count: 62, base: 196, percentage: 0.316 },
    { ref: "r2", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Never noticed", count: 53, base: 196, percentage: 0.27 },
    { ref: "r3", scope: "combined", canonicalQuestionKey: "q2", question: "Offer?", optionLabel: "Rewards", count: 66, base: 196, percentage: 0.337 },
  ],
  derived: [], segmentDerived: [],
};
const ctxInput = () => { const b = buildReasonerPackage(SNAP as never, []); return { pkg: b.pkg, ctxInput: { validRefs: b.validRefs, numbersByRef: b.numbersByRef, groupedShareRefs: b.groupedShareRefs, refToQuestion: b.refToQuestion } }; };

const baseOut = (over: Partial<ReasonerOutput>): ReasonerOutput => ({
  executiveStory: { headline: "Strong fit leads at 31.6%", summary: "Strong fit is 31.6%, Never noticed 27%.", evidenceRefs: ["e1", "e2"] },
  insights: [], supportingObservations: [], tensions: [], openQuestions: [], cannotConclude: ["No causal claims possible."], ...over,
});

test("authority tiers: synthesis/interpretation → key insights, implication → 'to consider'", () => {
  const { pkg, ctxInput: ci } = ctxInput();
  const { product: p } = shapeIntelligence(baseOut({ insights: [
    { id: "s", title: "Split perception", type: "synthesis", statement: "Strong fit 31.6% vs Never noticed 27%.", whyItMatters: "x", evidenceRefs: ["e1", "e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
    { id: "h", title: "Try experiences", type: "implication", statement: "Experiential activation may help.", whyItMatters: "x", evidenceRefs: ["e1"], counterEvidenceRefs: [], confidence: "low", caveat: "hypothesis" },
  ] }), pkg, ci);
  assert.equal(p.displayable, true);
  assert.deepEqual(p.keyInsights.map((i) => i.authority), ["synthesis"]);
  assert.deepEqual(p.toConsider.map((i) => i.authority), ["hypothesis"]);
});

test("citation resolution: evidence ids become human-readable lines (no raw ids leak)", () => {
  const { pkg, ctxInput: ci } = ctxInput();
  const { product: p } = shapeIntelligence(baseOut({ insights: [
    { id: "s", title: "t", type: "synthesis", statement: "Strong fit 31.6% vs Never noticed 27%.", whyItMatters: "x", evidenceRefs: ["e1", "e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
  ] }), pkg, ci);
  const ev = p.keyInsights[0].evidence;
  assert.ok(ev.some((e) => e.label === "Strong fit" && e.percentage === 31.6 && e.question === "Fit?"));
  assert.ok(!JSON.stringify(p).includes('"e1"'), "internal ids never reach the product");
});

test("SOFTEN policy: a stray recommendation in a synthesis is RE-TIERED to a hypothesis, not laundered", () => {
  const { pkg, ctxInput: ci } = ctxInput();
  const { product: p } = shapeIntelligence(baseOut({ insights: [
    { id: "s", title: "Do it", type: "synthesis", statement: "The client should launch rewards.", whyItMatters: "x", evidenceRefs: ["e3"], counterEvidenceRefs: [], confidence: "moderate", caveat: "" },
  ] }), pkg, ci);
  assert.equal(p.keyInsights.length, 0, "not shown as a synthesis");
  assert.equal(p.toConsider.length, 1, "re-tiered to a hypothesis");
  assert.equal(p.toConsider[0].authority, "hypothesis");
});

test("SOFTEN policy: causal/respondent overreach is DROPPED (never laundered)", () => {
  const { pkg, ctxInput: ci } = ctxInput();
  const { product: p, dropped } = shapeIntelligence(baseOut({ insights: [
    { id: "c", title: "Cause", type: "interpretation", statement: "Never noticed is high because of weak media spend.", whyItMatters: "x", evidenceRefs: ["e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
  ] }), pkg, ci);
  assert.equal(p.keyInsights.length, 0);
  assert.equal(p.toConsider.length, 0);
  assert.ok(dropped.some((d) => d.where === "insight:c"));
});

test("REJECT: a fabricated number in an insight is dropped and never rendered", () => {
  const { pkg, ctxInput: ci } = ctxInput();
  const { product: p } = shapeIntelligence(baseOut({ insights: [
    { id: "f", title: "Fab", type: "synthesis", statement: "88% see a strong fit.", whyItMatters: "x", evidenceRefs: ["e1"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
  ] }), pkg, ci);
  assert.equal(p.keyInsights.length + p.toConsider.length, 0);
  assert.ok(!JSON.stringify(p).includes("88%"));
});

test("non-defensible executive story ⇒ displayable=false (product falls back to deterministic)", () => {
  const { pkg, ctxInput: ci } = ctxInput();
  const { product: p } = shapeIntelligence(baseOut({ executiveStory: { headline: "A statistically significant 88% love it", summary: "x", evidenceRefs: ["e1"] } }), pkg, ci);
  assert.equal(p.displayable, false);
  assert.equal(p.story, null);
});

test("cannotConclude/openQuestions (boundary) are preserved verbatim", () => {
  const { pkg, ctxInput: ci } = ctxInput();
  const { product: p } = shapeIntelligence(baseOut({ cannotConclude: ["Whether fit causes loyalty."], openQuestions: ["What drives Germany?"] }), pkg, ci);
  assert.deepEqual(p.cannotConclude, ["Whether fit causes loyalty."]);
  assert.deepEqual(p.openQuestions, ["What drives Germany?"]);
});
