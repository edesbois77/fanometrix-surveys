import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStudyAnalysisEvidence, evidenceRef, validateProposals, validateNarrative } from "./study-analysis";
import { buildStudyAnalysisPrompt, buildNarrativeRepairPrompt } from "./study-analysis-prompt";
import type { StudyResultGroup } from "./study-results";
import type { OptionResult } from "./survey-results";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const opt = (id: string, label: string, count: number, base: number): OptionResult =>
  ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });

const STUDY = { id: "STU", name: "FedEx UCL Study", objective: "Help M&C Saatchi", surveyCount: 2, completedResponses: 274 };

// One combined group (Q1) with two survey sources.
const combinedGroup: StudyResultGroup = {
  canonicalQuestionKey: "qk1",
  label: "FedEx as a Champions League sponsor?",
  comparability: "combined",
  combined: { base: 274, sourceCount: 2, options: [opt("1", "Strong natural fit", 92, 274), opt("2", "Relevant but unclear", 85, 274)] },
  sources: [
    { surveyId: "A", surveyName: "Survey 1", questionIndex: 0, questionId: "qk1", canonicalQuestionKey: "qk1", label: "FedEx as a Champions League sponsor?", resultMode: "historical", completedResponses: 196, base: 196, shown: null, displayLanguage: "en", options: [opt("1", "Strong natural fit", 62, 196), opt("2", "Relevant but unclear", 58, 196)] },
    { surveyId: "B", surveyName: "Survey v2", questionIndex: 0, questionId: "qk1", canonicalQuestionKey: "qk1", label: "FedEx as a Champions League sponsor?", resultMode: "historical", completedResponses: 78, base: 78, shown: null, displayLanguage: "en", options: [opt("1", "Strong natural fit", 30, 78), opt("2", "Relevant but unclear", 27, 78)] },
  ],
};

// A separate (single-survey) group with a DIFFERENT canonical key.
const separateGroup: StudyResultGroup = {
  canonicalQuestionKey: "qk2",
  label: "What should sponsors offer fans?",
  comparability: "separate",
  combined: null,
  sources: [
    { surveyId: "A", surveyName: "Survey 1", questionIndex: 1, questionId: "qk2", canonicalQuestionKey: "qk2", label: "What should sponsors offer fans?", resultMode: "historical", completedResponses: 196, base: 196, shown: null, displayLanguage: "en", options: [opt("1", "Rewards and benefits", 100, 196)] },
  ],
};

const payload = buildStudyAnalysisEvidence(STUDY, [combinedGroup, separateGroup]);

// ── EVIDENCE PAYLOAD (matrix 1-7) ────────────────────────────────────────────
test("1,2. payload is structured evidence only — no raw responses, no free-form rows", () => {
  for (const e of payload.evidence) {
    assert.ok(typeof e.count === "number" && typeof e.base === "number");
    assert.equal(Object.prototype.hasOwnProperty.call(e, "responses"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(e, "q1"), false);
  }
});

test("3. study operational total is distinct from any question base", () => {
  assert.equal(payload.study.completedResponses, 274);
  // No combined base equals the operational total by construction (here it does numerically,
  // but the fields are separate): the base lives on each evidence item, not on the study.
  assert.equal(Object.prototype.hasOwnProperty.call(payload.study, "base"), false);
});

test("4. duplicate-respondent caveat is carried (uniqueness not proven)", () => {
  assert.equal(payload.study.respondentUniquenessProven, false);
});

test("5,6,7. canonical key, source Survey provenance and option identity/count/%/base preserved", () => {
  const combined1 = payload.evidence.find((e) => e.scope === "combined" && e.optionId === "1")!;
  assert.equal(combined1.canonicalQuestionKey, "qk1");
  assert.equal(combined1.count, 92);
  assert.equal(combined1.base, 274);
  assert.equal(Math.round((combined1.percentage ?? 0) * 1000), 336);
  const srcA = payload.evidence.find((e) => e.scope === "survey" && e.surveyId === "A" && e.optionId === "1")!;
  assert.equal(srcA.surveyName, "Survey 1");
  assert.equal(srcA.count, 62);
  assert.equal(srcA.base, 196);
  assert.equal(srcA.resultMode, "historical");
});

// ── OBJECTIVE IN THE BRIEF (v4) ──────────────────────────────────────────────
test("the objective is preserved in the immutable evidence snapshot", () => {
  const withObj = buildStudyAnalysisEvidence({ ...STUDY, objective: "Assess FedEx as a natural CL sponsor." }, [combinedGroup]);
  assert.equal(withObj.study.objective, "Assess FedEx as a natural CL sponsor.");
});

test("the analysis brief embeds the objective + carries the verdict into the narrative", () => {
  const withObj = buildStudyAnalysisEvidence({ ...STUDY, objective: "Determine whether FedEx is a natural CL sponsor." }, [combinedGroup]);
  const p = buildStudyAnalysisPrompt(withObj);
  assert.match(p, /Determine whether FedEx is a natural CL sponsor\./);
  assert.match(p, /carries the verdict/);
  assert.match(p, /strongly/);
  assert.match(p, /DEMONSTRATE/);
});

test("with no objective the brief drops into EXPLORE mode (no verdict instruction)", () => {
  const p = buildStudyAnalysisPrompt(buildStudyAnalysisEvidence({ ...STUDY, objective: null }, [combinedGroup]));
  assert.match(p, /EXPLORE/);
  assert.doesNotMatch(p, /carries the verdict/);
});

test("an objective-verdict synthesis (support + limiting evidence) passes validation", () => {
  const rSep2 = evidenceRef("STU", "qk2", "1", "survey", "A");
  const { valid } = validateProposals([{ type: "synthesis", headline: "Partially supported: a credible fit, but awareness limits the claim", explanation: "92 of 274 see a strong fit, yet a notable minority have never noticed the sponsorship.", evidenceRefs: [rCombined1, rSep2] }], payload.evidence);
  assert.equal(valid.length, 1);
});

// ── STUDY NARRATIVE (v5) ─────────────────────────────────────────────────────
test("a valid narrative passes; refs resolve into the evidence set", () => {
  const { narrative, rejected } = validateNarrative({ narrative: { headline: "Credible fit, weak visibility", summary: "92 of 274 see a strong fit, yet a notable minority never noticed it.", evidenceRefs: [rCombined1, rSep] } }, payload.evidence);
  assert.equal(rejected, null);
  assert.equal(narrative?.headline, "Credible fit, weak visibility");
  assert.deepEqual(narrative?.evidenceRefs, [rCombined1, rSep]);
});

test("a hallucinated narrative ref fails closed (no narrative)", () => {
  const { narrative, rejected } = validateNarrative({ narrative: { headline: "x", summary: "y", evidenceRefs: ["study#STU|q#NOPE|opt#9|src#combined"] } }, payload.evidence);
  assert.equal(narrative, null);
  assert.match(rejected!.reasons.join(), /unknown narrative evidence ref/);
});

test("banned language in the narrative fails closed", () => {
  assert.equal(validateNarrative({ narrative: { headline: "Significantly higher visibility", summary: "x", evidenceRefs: [rCombined1] } }, payload.evidence).narrative, null);
  assert.equal(validateNarrative({ narrative: { headline: "Sponsorship caused loyalty", summary: "x", evidenceRefs: [rCombined1] } }, payload.evidence).narrative, null);
});

test("a narrative with no refs, or no narrative at all, yields none (run stays valid)", () => {
  assert.equal(validateNarrative({ narrative: { headline: "h", summary: "s", evidenceRefs: [] } }, payload.evidence).narrative, null);
  assert.deepEqual(validateNarrative({ proposals: [] }, payload.evidence), { narrative: null, rejected: null });
});

// ── ANALYST BRIEF (v5) instructions + surveyIds in the snapshot ───────────────
test("the v8 brief is EXPLORATORY (interrogate + breadth) with the suppression rules removed", () => {
  const p = buildStudyAnalysisPrompt(buildStudyAnalysisEvidence({ ...STUDY, objective: "Assess FedEx as a natural sponsor." }, [combinedGroup]));
  assert.match(p, /INTERROGATE THE EVIDENCE/);
  assert.match(p, /worth an analyst considering/);
  assert.match(p, /supports the objective and evidence that limits/i);
  assert.match(p, /STUDY NARRATIVE/);
  // the old generation-time suppression rules are GONE (moved to verification/presentation)
  assert.doesNotMatch(p, /MATERIALITY TEST/);
  assert.doesNotMatch(p, /SUPPRESS WEAK COMPARISONS/);
  assert.doesNotMatch(p, /If these two percentages were EQUAL/);
  assert.doesNotMatch(p, /between 3 and 7/);
});

test("the constituent survey-id SET is frozen (sorted) in the evidence snapshot", () => {
  const ev = buildStudyAnalysisEvidence({ ...STUDY, surveyIds: ["B", "A"] }, [combinedGroup]);
  assert.deepEqual(ev.study.surveyIds, ["A", "B"]); // sorted → order-independent
});

// ── SCALING: the contract does not cap proposal volume ───────────────────────
test("SCALING: a large study yields many evidence items and no proposal cap is imposed", () => {
  // Synthetic: 10 questions, each combined with 4 options + 2 survey sources.
  const groups = Array.from({ length: 10 }, (_, qi) => ({
    canonicalQuestionKey: `k${qi}`, label: `Question ${qi}`, comparability: "combined" as const,
    combined: { base: 500, sourceCount: 2, options: ["1", "2", "3", "4"].map((id) => opt(id, `Opt ${id}`, 125, 500)) },
    sources: ["A", "B"].map((sid) => ({ surveyId: sid, surveyName: `S${sid}`, questionIndex: qi, questionId: `k${qi}`, canonicalQuestionKey: `k${qi}`, label: `Question ${qi}`, resultMode: "studio_native" as const, completedResponses: 250, base: 250, shown: null, displayLanguage: "en", options: ["1", "2", "3", "4"].map((id) => opt(id, `Opt ${id}`, 62, 250)) })),
  }));
  const big = buildStudyAnalysisEvidence({ id: "STU", name: "Big", objective: "Explore", surveyCount: 5, completedResponses: 2500, surveyIds: ["A", "B", "C", "D", "E"] }, groups);
  assert.ok(big.evidence.length >= 100); // 10 * (4 combined + 2*4 source) = 120
  // 20 valid proposals with DISTINCT headlines all pass — nothing collapses the set to a
  // small fixed number (each headline shares only "insight" → Jaccard 0.5, below the merge).
  const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  const many = Array.from({ length: 20 }, (_, i) => ({ type: "observation", headline: `Insight ${WORDS[i]}`, explanation: "A specific, evidence-grounded read.", evidenceRefs: [big.evidence[i].ref] }));
  const { valid } = validateProposals({ proposals: many }, big.evidence);
  assert.equal(valid.length, 20);
});

// ── v6 REDUNDANCY + BRIEF INSTRUCTIONS + NARRATIVE REPAIR ────────────────────
test("exact-duplicate proposals are dropped (deterministic redundancy control)", () => {
  const p = { type: "observation", headline: "Strong fit leads", explanation: "92 of 274.", evidenceRefs: [rCombined1] };
  const { valid, rejected } = validateProposals({ proposals: [p, { ...p }] }, payload.evidence);
  assert.equal(valid.length, 1);
  assert.ok(rejected.some((r) => r.reasons.join().includes("duplicate")));
});

test("the v8 brief surfaces DERIVED facts + relaxes the arithmetic rule to 'no self-arithmetic'", () => {
  const withDerived = buildStudyAnalysisEvidence({ ...STUDY, surveyIds: ["A", "B"], objective: "Assess FedEx." }, [combinedGroup]);
  const p = buildStudyAnalysisPrompt(withDerived);
  assert.match(p, /DERIVED FACTS/);
  assert.match(p, /Do NOT perform or introduce your own arithmetic/);
  assert.match(p, /Use ONLY the supplied figures — including the supplied DERIVED facts/);
  assert.match(p, /"priority":"key\|supporting"/);
  assert.doesNotMatch(p, /Never change, average or recalculate/); // old over-broad rule removed
});

test("priority is captured (key/supporting), defaults to supporting, never affects validity", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "observation", priority: "key", headline: "A key point", explanation: "92 of 274.", evidenceRefs: [rCombined1] },
    { type: "observation", priority: "supporting", headline: "A secondary point", explanation: "85 of 274.", evidenceRefs: [rCombined1] },
    { type: "observation", headline: "Unmarked point", explanation: "68 of 274.", evidenceRefs: [rSep] }, // no priority → supporting
  ] }, payload.evidence);
  assert.equal(valid.length, 3);
  assert.equal(valid[0].priority, "key");
  assert.equal(valid[1].priority, "supporting");
  assert.equal(valid[2].priority, "supporting");
});

test("two DISTINCT conclusions citing overlapping evidence are BOTH kept (not deduped)", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "observation", headline: "Strong fit is a credible foundation", explanation: "92 of 274.", evidenceRefs: [rCombined1] },
    { type: "synthesis", headline: "Credible fit sits alongside desired activation", explanation: "Strong sponsorship fit connects with what fans want sponsors to provide.", evidenceRefs: [rCombined1, rSep] },
  ] }, payload.evidence);
  assert.equal(valid.length, 2); // overlapping evidence, distinct headlines → both survive
});

test("genuine duplicates (identical headline) are still removed", () => {
  const p = { type: "observation", headline: "Same headline", explanation: "92 of 274.", evidenceRefs: [rCombined1] };
  const { valid } = validateProposals({ proposals: [p, { ...p, evidenceRefs: [rSep] }] }, payload.evidence);
  assert.equal(valid.length, 1);
});

test("the narrative-repair prompt reuses the same evidence + objective and never asks for proposals", () => {
  const ev = buildStudyAnalysisEvidence({ ...STUDY, objective: "Assess FedEx as a sponsor." }, [combinedGroup]);
  const p = buildNarrativeRepairPrompt(ev, { headline: "bad", summary: "x", evidenceRefs: ["nope"] }, ["unknown narrative evidence ref(s): nope"]);
  assert.match(p, /Assess FedEx as a sponsor\./);
  assert.match(p, /id=e1/);                 // same evidence, short ids
  assert.match(p, /Fix ONLY those problems/);
  assert.doesNotMatch(p, /"proposals"/);    // narrative only — never regenerates proposals
});

test("evidenceRef is deterministic + opaque and matches the builder", () => {
  assert.equal(evidenceRef("STU", "qk1", "1", "combined"), "study#STU|q#qk1|opt#1|src#combined");
  assert.equal(evidenceRef("STU", "qk1", "1", "survey", "A"), "study#STU|q#qk1|opt#1|src#survey#A");
});

// ── OUTPUT VALIDATION (matrix 8-17) ──────────────────────────────────────────
const rCombined1 = evidenceRef("STU", "qk1", "1", "combined");
const rSrcA1 = evidenceRef("STU", "qk1", "1", "survey", "A");
const rSrcB1 = evidenceRef("STU", "qk1", "1", "survey", "B");
const rSep = evidenceRef("STU", "qk2", "1", "survey", "A");

test("8,9. a valid observation with >=1 known ref is accepted", () => {
  const { valid } = validateProposals({ proposals: [{ type: "observation", headline: "Strong fit leads", explanation: "92 of 274 selected it.", evidenceRefs: [rCombined1] }] }, payload.evidence);
  assert.equal(valid.length, 1);
});

test("9. observation with ZERO refs is rejected", () => {
  const { valid, rejected } = validateProposals([{ type: "observation", headline: "x", explanation: "y", evidenceRefs: [] }], payload.evidence);
  assert.equal(valid.length, 0);
  assert.match(rejected[0].reasons.join(), /needs ≥1/);
});

test("10. a 1-ref synthesis/comparison is SALVAGED as an observation (not rejected)", () => {
  const one = validateProposals([{ type: "synthesis", headline: "x", explanation: "y", evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(one.valid.length, 1);
  assert.equal(one.valid[0].type, "observation"); // reclassified — single evidence
  const two = validateProposals([{ type: "synthesis", headline: "x", explanation: "y", evidenceRefs: [rCombined1, rSep] }], payload.evidence);
  assert.equal(two.valid.length, 1);
  assert.equal(two.valid[0].type, "synthesis"); // 2 refs → stays a synthesis
});

test("11. an unknown/hallucinated evidence ref is rejected", () => {
  const { valid, rejected } = validateProposals([{ type: "observation", headline: "x", explanation: "y", evidenceRefs: ["study#STU|q#qkZ|opt#9|src#combined"] }], payload.evidence);
  assert.equal(valid.length, 0);
  assert.match(rejected[0].reasons.join(), /unknown evidence ref/);
});

test("12b. a ref echoed with a 'ref='/'id='/bracket prefix is normalised to the bare id", () => {
  const { valid } = validateProposals([{ type: "observation", headline: "Strong fit leads", explanation: "92 of 274.", evidenceRefs: [`ref=${rCombined1}`] }], payload.evidence);
  assert.equal(valid.length, 1);
  assert.deepEqual(valid[0].evidenceRefs, [rCombined1]); // stored bare, matched exactly
  // A genuinely wrong ref still fails (normalisation never fabricates a match).
  assert.equal(validateProposals([{ type: "observation", headline: "x", explanation: "y", evidenceRefs: ["ref=study#STU|q#NOPE|opt#9|src#combined"] }], payload.evidence).valid.length, 0);
});

test("12c. citations resolve by short id (e1), full ref, or a prefix-dropped ref", () => {
  const full = payload.evidence[0].ref;
  const short = validateProposals([{ type: "observation", headline: "x", explanation: "y", evidenceRefs: ["e1"] }], payload.evidence);
  assert.equal(short.valid.length, 1);
  assert.equal(short.valid[0].evidenceRefs[0], full); // stored as the canonical full ref
  const dropped = full.replace(/^study#[^|]*\|/, "");
  const drop = validateProposals([{ type: "observation", headline: "x", explanation: "y", evidenceRefs: [dropped] }], payload.evidence);
  assert.equal(drop.valid.length, 1);
  assert.equal(drop.valid[0].evidenceRefs[0], full);
});

test("12. duplicate refs are normalised (deduped), not double-counted", () => {
  const { valid } = validateProposals([{ type: "observation", headline: "x", explanation: "y", evidenceRefs: [rCombined1, rCombined1] }], payload.evidence);
  assert.equal(valid.length, 1);
  assert.deepEqual(valid[0].evidenceRefs, [rCombined1]);
});

test("13. an invalid proposal type is rejected", () => {
  const { valid, rejected } = validateProposals([{ type: "prediction", headline: "x", explanation: "y", evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(valid.length, 0);
  assert.match(rejected[0].reasons.join(), /invalid type/);
});

test("14. malformed / overlong content is rejected", () => {
  const long = "a".repeat(800);
  const { valid, rejected } = validateProposals([{ type: "observation", headline: "ok", explanation: long, evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(valid.length, 0);
  assert.match(rejected[0].reasons.join(), /explanation too long/);
});

test("15. a comparison over non-directly-comparable (separate) evidence is rejected", () => {
  const { valid, rejected } = validateProposals([{ type: "comparison", headline: "x", explanation: "y", evidenceRefs: [rCombined1, rSep] }], payload.evidence);
  assert.equal(valid.length, 0);
  assert.match(rejected[0].reasons.join(), /one comparable question|non-directly-comparable/);
});

test("15b. a governed comparison across the two source Surveys of a combined question is accepted", () => {
  const { valid } = validateProposals([{ type: "comparison", headline: "S1 vs v2 on fit", explanation: "62 of 196 vs 30 of 78.", evidenceRefs: [rSrcA1, rSrcB1] }], payload.evidence);
  assert.equal(valid.length, 1);
});

test("16. statistical-significance / causal / unique-respondent language is rejected", () => {
  const sig = validateProposals([{ type: "observation", headline: "Statistically significant lead", explanation: "x", evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(sig.valid.length, 0);
  const uniq = validateProposals([{ type: "observation", headline: "Most unique respondents agree", explanation: "x", evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(uniq.valid.length, 0);
  const causal = validateProposals([{ type: "observation", headline: "Sponsorship causes loyalty", explanation: "x", evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(causal.valid.length, 0);
});

// ── TIGHTENED LANGUAGE (matrix 25-29 + regression on the live FedEx overclaims) ──
test("25. change-over-time language is rejected (cross-sectional evidence)", () => {
  for (const headline of ["Preference for rewards increased in Survey v2", "Interest in FedEx grew", "A rising trend in visibility", "Support declined over time"]) {
    const { valid } = validateProposals([{ type: "comparison", headline, explanation: "62 of 196 vs 30 of 78.", evidenceRefs: [rSrcA1, rSrcB1] }], payload.evidence);
    assert.equal(valid.length, 0, `should reject: ${headline}`);
  }
});

test("25b. forward-looking interpretation ('improve'/'strengthen'/'opportunity') is ALLOWED", () => {
  for (const headline of ["An opportunity to strengthen fan engagement", "FedEx could improve recognition among fans"]) {
    const { valid } = validateProposals([{ type: "synthesis", headline, explanation: "Two results point the same way.", evidenceRefs: [rCombined1, rSep] }], payload.evidence);
    assert.equal(valid.length, 1, `should allow: ${headline}`);
  }
});

test("26. priority-from-share language is rejected", () => {
  for (const headline of ["Rewards are the top priority for fans", "The main priority is experiences", "Highest priority: rewards"]) {
    const { valid } = validateProposals([{ type: "observation", headline, explanation: "100 of 274 selected it.", evidenceRefs: [rCombined1] }], payload.evidence);
    assert.equal(valid.length, 0, `should reject: ${headline}`);
  }
});

test("27. causal language is rejected", () => {
  for (const headline of ["Sponsorship drives loyalty", "Visibility led to interest", "Strong fit due to branding", "Interest resulted in engagement"]) {
    const { valid } = validateProposals([{ type: "observation", headline, explanation: "x", evidenceRefs: [rCombined1] }], payload.evidence);
    assert.equal(valid.length, 0, `should reject: ${headline}`);
  }
});

test("28. statistical-significance framing is rejected", () => {
  for (const headline of ["A statistically significant lead", "Significantly higher in v2", "A significant difference between surveys", "A meaningful difference between surveys", "Materially higher in v2"]) {
    const { valid } = validateProposals([{ type: "observation", headline, explanation: "x", evidenceRefs: [rCombined1] }], payload.evidence);
    assert.equal(valid.length, 0, `should reject: ${headline}`);
  }
});

test("28b. colloquial 'a significant portion/opportunity' is ALLOWED (reasonable interpretation)", () => {
  for (const headline of ["A significant portion see FedEx as a strong fit", "A significant opportunity for FedEx"]) {
    const { valid } = validateProposals([{ type: "observation", headline, explanation: "92 of 274 selected it.", evidenceRefs: [rCombined1] }], payload.evidence);
    assert.equal(valid.length, 1, `should allow: ${headline}`);
  }
});

test("29. unique-people language is rejected; 'completed responses' is fine", () => {
  const bad = validateProposals([{ type: "observation", headline: "92 people chose strong fit", explanation: "x", evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(bad.valid.length, 0);
  const ok = validateProposals([{ type: "observation", headline: "Strong fit leads among 274 completed responses", explanation: "92 of 274 selected it.", evidenceRefs: [rCombined1] }], payload.evidence);
  assert.equal(ok.valid.length, 1);
});

test("17. client-supplied numbers are irrelevant — validation only trusts supplied refs", () => {
  // A proposal cannot smuggle numbers: only refs are honoured; extra fields ignored.
  const { valid } = validateProposals([{ type: "observation", headline: "x", explanation: "y", evidenceRefs: [rCombined1], count: 9999, percentage: 1 } as unknown], payload.evidence);
  assert.equal(valid.length, 1);
  assert.deepEqual(Object.keys(valid[0]).sort(), ["displayType", "evidenceRefs", "explanation", "headline", "priority", "type"]);
});
