import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGeneric, hasPrescription, magnitudeScore, synthesisScore, objectiveRelevance,
  scoreProposal, selectQualityProposals, QUALITY_MIN_SCORE, QUALITY_MAX_KEEP,
  type ResolvedProposalEvidence, type QualityProposal,
} from "./analysis-quality";

const ev = (over: Partial<ResolvedProposalEvidence> = {}): ResolvedProposalEvidence => ({
  topPct: over.topPct ?? 0, gapPP: over.gapPP ?? 0, minBase: over.minBase ?? 60,
  distinctQuestions: over.distinctQuestions ?? 1, refCount: over.refCount ?? 1,
});
const prop = (over: Partial<QualityProposal>): QualityProposal => ({
  displayType: over.displayType ?? "observation", headline: over.headline ?? "Headline",
  explanation: over.explanation ?? "Explanation.", evidenceRefs: over.evidenceRefs ?? ["e1"],
});

// ── Genericness ──────────────────────────────────────────────────────────────
test("generic 'opinion is split' style headlines are detected", () => {
  for (const h of [
    "Opinion is split — no single answer dominates",
    "Responses were mixed on the sponsorship",
    "No clear winner among the offerings",
    "Views were divided",
    "Opinions varied across the options",
    "The result is evenly split",
  ]) assert.equal(isGeneric(h), true, h);
});
test("substantive headlines are NOT flagged generic", () => {
  for (const h of [
    "A clear majority see FedEx as a natural fit",
    "Rewards and benefits were the most-selected sponsor offering",
    "Practical fan benefits appear more prominent than visibility-led sponsorship",
  ]) assert.equal(isGeneric(h), false, h);
});

// ── Prescription (narrow) ────────────────────────────────────────────────────
test("directive recommendations the survey did not test are caught", () => {
  for (const t of [
    "FedEx should launch targeted mobile marketing campaigns.",
    "Brands should invest in experiential activations.",
    "This highlights the potential for FedEx to leverage its sponsorship for greater visibility.",
    "The strategy should focus on younger fans.",
    "We recommend a rewards-led sponsorship.",
    "Sponsors could improve by targeting experiences.",
  ]) assert.equal(hasPrescription(t), true, t);
});
test("neutral interpretation is NOT flagged as prescription (firewall already allows it)", () => {
  for (const t of [
    "Rewards and benefits were selected more often than the other sponsor offerings.",
    "Practical fan benefits appear more prominent in the survey than purely visibility-led sponsorship.",
    "There is an opportunity to strengthen engagement, on the evidence of the strong fit rating.",
    "Recognition of the sponsorship is established but uneven across markets.",
  ]) assert.equal(hasPrescription(t), false, t);
});

// ── Scoring components ───────────────────────────────────────────────────────
test("magnitude rewards strong preference and clear lead", () => {
  assert.ok(magnitudeScore(72, 40) > magnitudeScore(38, 3));
  assert.equal(magnitudeScore(20, 0), 0); // near-even, no lead → nothing
});
test("synthesis rewards multi-question connection over single restatement", () => {
  assert.ok(synthesisScore("synthesis", 2) > synthesisScore("observation", 1));
});
test("objective relevance is a soft boost only when a distinctive token overlaps", () => {
  assert.equal(objectiveRelevance("Sponsorship fit is strong", "measure sponsorship effectiveness"), 10);
  assert.equal(objectiveRelevance("Device usage differs", "measure sponsorship effectiveness"), 0);
  assert.equal(objectiveRelevance("anything", null), 0);
});

// ── Proposal scoring / drop decisions (the core product standard) ────────────
test("1. a generic 'opinion is split' proposal is NOT promoted — it is dropped", () => {
  const s = scoreProposal(prop({ headline: "Opinion is split — no single answer dominates" }), ev({ topPct: 36, gapPP: 3 }), null);
  assert.equal(s.drop, true);
});
test("2. a strong majority/preference survives", () => {
  const s = scoreProposal(prop({ headline: "A clear majority chose “strong natural fit”" }), ev({ topPct: 68, gapPP: 33 }), null);
  assert.equal(s.drop, false);
  assert.ok(s.score >= QUALITY_MIN_SCORE);
});
test("3. a meaningful segment contrast survives (spread carried as gapPP)", () => {
  const s = scoreProposal(prop({ displayType: "pattern", headline: "Recognition is markedly stronger in the UK than in Germany" }), ev({ topPct: 45, gapPP: 24, distinctQuestions: 1 }), null);
  assert.equal(s.drop, false);
});
test("7. an unsupported recommendation is dropped regardless of magnitude", () => {
  const s = scoreProposal(prop({ headline: "FedEx should launch targeted campaigns", explanation: "Given the fit." }), ev({ topPct: 70, gapPP: 40 }), null);
  assert.equal(s.drop, true);
  assert.match(s.reasons.join(" "), /prescription/);
});
test("8/9. aggregate cross-question synthesis (correctly phrased) survives and is not respondent-level", () => {
  const s = scoreProposal(
    prop({ displayType: "synthesis", headline: "Practical benefits outweigh visibility as the survey's sponsorship priority", explanation: "Across the offering and opportunity questions, benefit-led options lead." , evidenceRefs: ["e1", "e5"] }),
    ev({ topPct: 44, gapPP: 12, distinctQuestions: 2 }), null,
  );
  assert.equal(s.drop, false);
});

// ── Select + rank + omit ─────────────────────────────────────────────────────
test("12. strong multi-question synthesis outranks a simple single-question restatement", () => {
  const items = [
    prop({ displayType: "observation", headline: "Most chose option A", evidenceRefs: ["e1"] }),
    prop({ displayType: "synthesis", headline: "Benefits lead the survey's sponsorship story", evidenceRefs: ["e1", "e4"] }),
  ];
  const resolve = (p: QualityProposal): ResolvedProposalEvidence =>
    p.displayType === "synthesis" ? ev({ topPct: 44, gapPP: 12, distinctQuestions: 2 }) : ev({ topPct: 52, gapPP: 8, distinctQuestions: 1 });
  const { kept } = selectQualityProposals(items, resolve, null);
  assert.equal(kept[0].displayType, "synthesis", "synthesis ranks first");
});
test("10/11. a survey may yield ZERO worth-showing conclusions (no filler forced)", () => {
  const items = [
    prop({ headline: "Opinion is split on the offering" }),
    prop({ headline: "Responses were mixed" }),
    prop({ headline: "Brands should invest more" }),
  ];
  const { kept, dropped } = selectQualityProposals(items, () => ev({ topPct: 34, gapPP: 2 }), null);
  assert.equal(kept.length, 0, "no manufactured findings");
  assert.equal(dropped.length, 3);
});
test("survivors are capped at QUALITY_MAX_KEEP, strongest first", () => {
  const items = Array.from({ length: QUALITY_MAX_KEEP + 3 }, (_, i) => prop({ headline: `Strong finding ${i}`, evidenceRefs: [`e${i}`] }));
  const { kept } = selectQualityProposals(items, () => ev({ topPct: 60 + 0, gapPP: 25 }), null);
  assert.equal(kept.length, QUALITY_MAX_KEEP);
});
