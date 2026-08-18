import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evidenceRef, stripInlineRefs, containsInlineRef, makeRefResolver,
  validateProposals, validateNarrative, respondentCorrelationReasons,
} from "./study-analysis";
import { buildSurveyAnalysisEvidence } from "./survey-analysis-evidence";
import { runSurveyAnalysis, selectCurrentRun, analysisScopeVisible } from "./survey-analysis-service";
import { readFileSync } from "node:fs";
import type { QuestionResultView } from "./dashboard-results";

// ── Fixtures ──────────────────────────────────────────────────────────────────
function qrv(index: number, id: string, text: string, pairs: [string, number][], shown: number | null = null): QuestionResultView {
  const base = pairs.reduce((a, [, c]) => a + c, 0);
  const options = pairs.map(([label, count], i) => ({ optionId: String(i + 1), label, count, percentage: base > 0 ? count / base : null }));
  return { questionIndex: index, questionId: id, text, shown, answered: base, base, completionRate: null, options, marginOfError: null };
}
const SURVEY_QS: QuestionResultView[] = [
  qrv(0, "q1", "How do you rate FedEx as a Champions League sponsor?", [["Strong natural fit", 62], ["Relevant but unclear", 58], ["Never noticed them", 30]]),
  qrv(1, "q2", "What should sponsors offer fans?", [["Rewards and benefits", 66], ["Better fan experiences", 41], ["Investment in grassroots", 33]]),
];
const scope = { surveyId: "SVY", surveyName: "FedEx UCL", objective: "Understand sponsorship perception", completedResponses: 274, mode: "studio_native" as const };

// ── Firewall is scope-agnostic: study# unchanged, survey# now works ──────────
test("study# refs still strip and resolve identically (regression)", () => {
  const ref = evidenceRef("S1", "q1", "1", "combined"); // default namespace = study
  assert.equal(ref, "study#S1|q#q1|opt#1|src#combined");
  const resolve = makeRefResolver([{ ref }]);
  assert.equal(resolve("e1"), ref);
  assert.equal(resolve(ref), ref);
  assert.equal(stripInlineRefs(`As the data (${ref}) shows, X.`), "As the data shows, X.");
  assert.equal(containsInlineRef(`see ${ref}`), true);
});
test("survey# refs strip and resolve through the SAME firewall", () => {
  const ref = evidenceRef("SVY", "q1", "1", "combined", null, "survey");
  assert.equal(ref, "survey#SVY|q#q1|opt#1|src#combined");
  const resolve = makeRefResolver([{ ref }]);
  assert.equal(resolve("e1"), ref);
  assert.equal(resolve(ref), ref);
  assert.equal(stripInlineRefs(`Evidence ${ref} supports this.`), "Evidence supports this.");
  assert.equal(containsInlineRef(`per survey#SVY|q#q1`), true);
});

// ── Evidence adapter ─────────────────────────────────────────────────────────
test("buildSurveyAnalysisEvidence: survey# base refs + within-survey derived leader facts, no cross-survey spread", () => {
  const payload = buildSurveyAnalysisEvidence(scope, SURVEY_QS, []);
  assert.equal(payload.study.surveyCount, 1);
  assert.equal(payload.study.respondentUniquenessProven, false);
  assert.ok(payload.evidence.every((e) => e.ref.startsWith("survey#SVY")), "all base refs are survey-namespaced");
  assert.equal(payload.evidence.length, 6); // 3 + 3 options
  // Derived: leader + top-2 per question (2 questions) = 4; no spread/consistency (1 source).
  assert.ok(payload.derived.some((d) => d.kind === "leader"));
  assert.ok(payload.derived.every((d) => d.kind !== "spread" && d.kind !== "consistency"), "single survey ⇒ no cross-survey derivations");
  assert.ok(payload.derived.every((d) => d.ref.includes("survey#SVY")));
});

// ── Validation firewall over survey evidence ─────────────────────────────────
const payload = buildSurveyAnalysisEvidence(scope, SURVEY_QS, []);
const allDerived = [...payload.derived, ...payload.segmentDerived];

test("valid proposal citing a supplied ref is accepted; its refs resolve to evidence", () => {
  const raw = { proposals: [{ type: "observation", priority: "key", headline: "Recognition is credible but not settled", explanation: "The leading view is a natural fit, but a large share is unclear or unaware.", evidenceRefs: ["e1", "e2"] }] };
  const { valid } = validateProposals(raw, payload.evidence, allDerived);
  assert.equal(valid.length, 1);
  const resolve = makeRefResolver([...payload.evidence, ...allDerived]);
  for (const r of valid[0].evidenceRefs) assert.ok(resolve(r), `ref ${r} resolves`);
});
test("invented evidenceRef is rejected (dropped, never rendered)", () => {
  const raw = { proposals: [
    { type: "observation", priority: "key", headline: "Real one", explanation: "Grounded.", evidenceRefs: ["e1"] },
    { type: "observation", priority: "key", headline: "Fabricated", explanation: "Cites nothing real.", evidenceRefs: ["e999"] },
  ] };
  const { valid } = validateProposals(raw, payload.evidence, allDerived);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].headline, "Real one");
});
test("causal claim rejected", () => {
  const raw = { proposals: [{ type: "observation", priority: "key", headline: "Weak recognition is caused by poor activation", explanation: "This is unsupported causation.", evidenceRefs: ["e1"] }] };
  assert.equal(validateProposals(raw, payload.evidence, allDerived).valid.length, 0);
});
test("statistical-significance claim rejected", () => {
  const raw = { proposals: [{ type: "observation", priority: "key", headline: "A statistically significant lead for natural fit", explanation: "No governed test exists.", evidenceRefs: ["e1"] }] };
  assert.equal(validateProposals(raw, payload.evidence, allDerived).valid.length, 0);
});
test("respondent-level correlation wording rejected", () => {
  const raw = { proposals: [{ type: "synthesis", priority: "key", headline: "Respondents who chose natural fit were also more likely to want rewards", explanation: "Aggregate data cannot support this.", evidenceRefs: ["e1", "e4"] }] };
  assert.equal(validateProposals(raw, payload.evidence, allDerived).valid.length, 0);
});
test("aggregate cross-question synthesis (no respondent linkage) is allowed", () => {
  const raw = { proposals: [{ type: "synthesis", priority: "key", headline: "Fans want tangible value, and see the fit as credible", explanation: "Across both questions the survey points to substance over visibility.", evidenceRefs: ["e1", "e4"] }] };
  assert.equal(validateProposals(raw, payload.evidence, allDerived).valid.length, 1);
});
test("respondentCorrelationReasons: flags the linkage structure, not plain aggregate comparison", () => {
  assert.equal(respondentCorrelationReasons("those who chose A were also more likely to pick B").length, 1);
  assert.equal(respondentCorrelationReasons("A correlates with B").length, 1);
  assert.equal(respondentCorrelationReasons("more respondents chose experiences than visibility").length, 0);
});
test("narrative validates against survey evidence and strips leaked refs", () => {
  const raw = { narrative: { headline: "A credible but not-yet-landed sponsorship", summary: `The survey shows a plurality see a natural fit (survey#SVY|q#q1|opt#1), tempered by uncertainty.`, evidenceRefs: ["e1", "e2"] } };
  const { narrative } = validateNarrative(raw, payload.evidence, allDerived);
  assert.ok(narrative);
  assert.doesNotMatch(narrative!.summary, /survey#/);
});

// ── runSurveyAnalysis with a FAKE model (no real AI) ─────────────────────────
type FakeCall = { prompt: string };
function fakeModel(responses: { stage1: unknown; stage2: unknown }) {
  const calls: FakeCall[] = [];
  const complete = (async ({ prompt }: { prompt: string }) => {
    calls.push({ prompt });
    return prompt.includes("KEY THEMES") || prompt.includes("STEP 1") ? responses.stage2 : responses.stage1;
  }) as unknown as Parameters<typeof runSurveyAnalysis>[2];
  return { complete, calls };
}

test("runSurveyAnalysis: fake model → validated proposals + themes + narrative, model called (not by Discover)", async () => {
  const { complete, calls } = fakeModel({
    stage1: { proposals: [
      { type: "observation", priority: "key", headline: "Recognition is credible but uneven", explanation: "The leading view is a natural fit, but many are unclear.", evidenceRefs: ["e1", "e2"] },
      { type: "synthesis", priority: "key", headline: "Fans value substance over visibility", explanation: "Rewards and experiences lead what sponsors should offer.", evidenceRefs: ["e4", "e5"] },
    ] },
    stage2: { themes: [{ title: "Recognition is established but not settled", interpretation: "The fit reads as credible yet a large share is unclear.", proposals: [1], importance: "primary", relationToObjective: "Directly addresses perception." }],
      narrative: { headline: "A credible fit that is not yet fully landed", summary: "The survey points to a plausible sponsorship fit tempered by uncertainty, with fans favouring tangible value.", evidenceRefs: ["e1", "e4"] } },
  });
  const out = await runSurveyAnalysis(payload, scope.objective, complete);
  assert.ok(out.proposals.length >= 1);
  assert.ok(out.proposals.every((p) => p.evidenceRefs.length >= 1));
  assert.ok(out.narrative && out.narrative.headline.length > 0);
  assert.ok(out.themes.length >= 1);
  assert.equal(calls.length >= 2, true, "stage1 + stage2 called");
});
test("runSurveyAnalysis: a clean run with nothing worth showing COMPLETES (no strong conclusions), never throws", async () => {
  // Model returned valid JSON but the only proposal is generic/low-value → quality drops it.
  const { complete } = fakeModel({ stage1: { proposals: [{ type: "observation", priority: "key", headline: "Opinion is split — no single answer dominates", explanation: "The top two are close.", evidenceRefs: ["e1", "e2"] }] }, stage2: {} });
  const out = await runSurveyAnalysis(payload, scope.objective, complete);
  assert.equal(out.proposals.length, 0, "no filler proposal survives");
  assert.equal(out.narrative, null, "no manufactured narrative");
  assert.equal(out.themes.length, 0);
});

test("runSurveyAnalysis: a genuine provider/parse error still THROWS (a failed run, previous analysis preserved)", async () => {
  // Both attempts throw → lastErr set → the run must fail (not silently 'complete').
  const complete = (async () => { throw new Error("provider 500"); }) as unknown as Parameters<typeof runSurveyAnalysis>[2];
  await assert.rejects(() => runSurveyAnalysis(payload, scope.objective, complete));
});

test("runSurveyAnalysis: an ungrounded prescription proposal is dropped by the quality layer", async () => {
  const { complete } = fakeModel({ stage1: { proposals: [{ type: "implication", priority: "key", headline: "A rewards-led opportunity", explanation: "FedEx should launch targeted reward campaigns.", evidenceRefs: ["e4", "e5"] }] }, stage2: {} });
  const out = await runSurveyAnalysis(payload, scope.objective, complete);
  assert.equal(out.proposals.length, 0, "prescription is not shown as analysis");
});

test("unsupported comparison across different questions (numeric magnitude) rejected", () => {
  const raw = { proposals: [{ type: "observation", priority: "key", headline: "Natural fit is higher than rewards", explanation: "This compares magnitudes across two different questions, which is invalid.", evidenceRefs: ["e1", "e4"] }] };
  assert.equal(validateProposals(raw, payload.evidence, allDerived).valid.length, 0);
});
test("ungrounded implication (generic advice not discussing the cited evidence) rejected", () => {
  const raw = { proposals: [{ type: "implication", priority: "key", headline: "Invest more in digital marketing channels next year", explanation: "Brands should broaden their omnichannel funnel strategy.", evidenceRefs: ["e1"] }] };
  assert.equal(validateProposals(raw, payload.evidence, allDerived).valid.length, 0);
});
test("a segment claim citing a non-existent segment ref is rejected (no invented audience facts)", () => {
  // No segment facts were supplied, so any 'audience' ref is unknown → rejected.
  const raw = { proposals: [{ type: "observation", priority: "key", headline: "German respondents differ", explanation: "Cites an audience fact that was never supplied.", evidenceRefs: ["e50"] }] };
  assert.equal(validateProposals(raw, payload.evidence, allDerived).valid.length, 0);
});

// ── Base gate / historical / studio-native compatibility ─────────────────────
test("low-base questions are excluded from analysis evidence (cannot be promoted)", () => {
  const weak = buildSurveyAnalysisEvidence(scope, [qrv(0, "q1", "Weak", [["A", 12], ["B", 8]])], []);
  assert.equal(weak.evidence.length, 0, "base 20 < 30 ⇒ no evidence");
});
test("historical ≤3Q: only the supplied questions, all flagged historical", () => {
  const hist = buildSurveyAnalysisEvidence({ ...scope, mode: "historical_completed_only" }, SURVEY_QS, []);
  assert.ok(hist.evidence.length > 0);
  assert.ok(hist.evidence.every((e) => e.resultMode === "historical"));
  const qids = new Set(hist.evidence.map((e) => e.canonicalQuestionKey));
  assert.deepEqual([...qids].sort(), ["q1", "q2"]); // never invents q3/q4/q5
});
test("studio-native supports 1–5 questions", () => {
  const five = Array.from({ length: 5 }, (_, i) => qrv(i, `q${i + 1}`, `Q${i + 1}`, [["A", 40], ["B", 30], ["C", 20]]));
  const p = buildSurveyAnalysisEvidence(scope, five, []);
  assert.equal(new Set(p.evidence.map((e) => e.canonicalQuestionKey)).size, 5);
});

// ── Prompt provenance / historical honesty ───────────────────────────────────
test("survey prompt states the historical limitation when data is completed-only", async () => {
  const { buildSurveyStage1Prompt } = await import("./survey-analysis-prompt");
  const hist = buildSurveyAnalysisEvidence({ ...scope, mode: "historical_completed_only" }, SURVEY_QS, []);
  const prompt = buildSurveyStage1Prompt(hist, scope.objective);
  assert.match(prompt, /COMPLETED-response answers only/i);
  assert.match(prompt, /first questions/i);
  // And the respondent-correlation prohibition is spelled out.
  assert.match(prompt, /NEVER claim the same respondents/i);
});

// ── Current-run selection (failed regen preserves previous valid) ────────────
test("selectCurrentRun: latest COMPLETED wins; a newer failed/running run never becomes current", () => {
  const runs = [
    { id: "r3", status: "failed", created_at: "2026-08-18T03:00:00Z" },
    { id: "r2", status: "running", created_at: "2026-08-18T02:00:00Z" },
    { id: "r1", status: "completed", created_at: "2026-08-18T01:00:00Z" },
  ];
  assert.equal(selectCurrentRun(runs)?.id, "r1");
  assert.equal(selectCurrentRun([{ id: "x", status: "failed", created_at: "t" }]), null);
});

// ── Entitlement scope-matching (the security rule) ───────────────────────────
test("analysisScopeVisible: caller must be entitled to the WHOLE generation scope", () => {
  const AB = ["camp-a", "camp-b"];
  // exact scope → visible
  assert.equal(analysisScopeVisible({ runCampaignScope: AB, unrestricted: false, authorisedCampaignIds: ["camp-a", "camp-b"] }), true);
  // authorised SUPERSET (A+B+C+D authorised, run over A+B) → visible
  assert.equal(analysisScopeVisible({ runCampaignScope: AB, unrestricted: false, authorisedCampaignIds: ["camp-a", "camp-b", "camp-c", "camp-d"] }), true);
  // authorised SUBSET (run over A+B, caller entitled to A only) → hidden
  assert.equal(analysisScopeVisible({ runCampaignScope: AB, unrestricted: false, authorisedCampaignIds: ["camp-a"] }), false);
  // PARTIAL OVERLAP (run over B+C, caller entitled to A+B) → hidden
  assert.equal(analysisScopeVisible({ runCampaignScope: ["camp-b", "camp-c"], unrestricted: false, authorisedCampaignIds: ["camp-a", "camp-b"] }), false);
  // UNRELATED (run over A+B, caller entitled to X+Y) → hidden
  assert.equal(analysisScopeVisible({ runCampaignScope: AB, unrestricted: false, authorisedCampaignIds: ["camp-x", "camp-y"] }), false);
  // OPERATOR / full-data (unrestricted) → visible regardless
  assert.equal(analysisScopeVisible({ runCampaignScope: AB, unrestricted: true, authorisedCampaignIds: [] }), true);
  // MISSING / empty frozen scope → unverifiable → fail closed (hidden)
  assert.equal(analysisScopeVisible({ runCampaignScope: [], unrestricted: false, authorisedCampaignIds: ["camp-a", "camp-b"] }), false);
  assert.equal(analysisScopeVisible({ runCampaignScope: undefined, unrestricted: false, authorisedCampaignIds: ["camp-a", "camp-b"] }), false);
});

test("the entitlement gate runs BEFORE any analysis content is read (no leak via provenance)", () => {
  // Structural guarantee: getCurrentSurveyAnalysis checks analysisScopeVisible and
  // returns null before it ever queries proposals / resolves supportingQuestions.
  const src = readFileSync(new URL("./survey-analysis-service.ts", import.meta.url), "utf8");
  const gateAt = src.indexOf("if (!analysisScopeVisible(");
  // The proposal content read unique to getCurrentSurveyAnalysis (by run id).
  const proposalsReadAt = src.indexOf('.eq("analysis_run_id", current.id)');
  assert.ok(gateAt > 0 && proposalsReadAt > 0);
  assert.ok(gateAt < proposalsReadAt, "scope gate must precede reading proposal content");
  // …and it returns null between the gate and that read (no partial disclosure).
  const returnNullAt = src.indexOf("return null;", gateAt);
  assert.ok(returnNullAt > gateAt && returnNullAt < proposalsReadAt, "gate returns null before any content read");
});

test("Discover findings route passes the caller's governed entitlement to the analysis read", () => {
  const src = readFileSync(new URL("../../app/api/survey-studio/discover/dashboards/[surveyId]/findings/route.ts", import.meta.url), "utf8");
  assert.match(src, /getCurrentSurveyAnalysis\(surveyId,\s*\{/);
  assert.match(src, /unrestricted:\s*scope\.unrestricted/);
  assert.match(src, /authorisedCampaignIds:\s*scope\.authorisedCampaignIds/);
});

// ── Prompt v2 behavioural requirements (so quality guidance can't silently regress) ──
import {
  buildSurveyStage1Prompt, buildSurveyStage2Prompt,
  SURVEY_STAGE1_PROMPT_VERSION, SURVEY_STAGE2_PROMPT_VERSION,
} from "./survey-analysis-prompt";

test("prompt v2: Stage 1 grants permission to omit, sets a materiality bar, and forbids prescription", () => {
  const p = buildSurveyStage1Prompt(payload, scope.objective);
  assert.match(p, /PERMISSION TO OMIT/);
  assert.match(p, /even ZERO/i);
  assert.match(p, /WORTH SAYING/);
  assert.match(p, /NO PRESCRIPTION/);
  assert.match(p, /should launch\/invest/i);
  assert.match(p, /RESULT; leave it to Results/);
  assert.equal(SURVEY_STAGE1_PROMPT_VERSION, "survey-analysis-stage1-v2");
});

test("prompt v2: Stage 2 allows one/zero themes and lets the narrative admit no strong conclusion", () => {
  const p = buildSurveyStage2Prompt(payload, [{ displayType: "synthesis", headline: "x", explanation: "y", evidenceRefs: ["e1"] }], scope.objective);
  assert.match(p, /only as many as the evidence genuinely supports/i);
  assert.match(p, /often just ONE/i);
  assert.match(p, /no single strong overarching conclusion/i);
  assert.match(p, /Do NOT prescribe/i);
  assert.equal(SURVEY_STAGE2_PROMPT_VERSION, "survey-analysis-stage2-v2");
});
