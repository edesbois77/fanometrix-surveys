import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStudyAnalysisEvidence, validateProposals, validateNarrative, validateThemes, dedupeProposals,
  stripInlineRefs, containsInlineRef, groupedShareSemanticReasons,
  storedTypeOf, ARTIFACT_KINDS, PROPOSAL_TYPES, type StudyAnalysisProposal,
} from "./study-analysis";
import { buildStage1Prompt, buildStage2Prompt } from "./study-analysis-prompt";
import type { StudyResultGroup } from "./study-results";
import type { OptionResult } from "./survey-results";

// ── Synthesis + Study-story refinement V1 — Part 24 test matrix (pure) ────────
const opt = (id: string, label: string, count: number, base: number): OptionResult => ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });

// One combined Q (Q1) across two surveys → yields a leader + grouped_share derived fact.
const q1: StudyResultGroup = {
  canonicalQuestionKey: "q_fit", label: "FedEx as a Champions League sponsor?", comparability: "combined",
  combined: { base: 274, sourceCount: 2, options: [opt("1", "Strong natural fit", 92, 274), opt("2", "Relevant but unclear", 85, 274), opt("3", "Mostly brand visibility", 29, 274), opt("4", "Never noticed them", 68, 274)] },
  sources: [
    { surveyId: "A", surveyName: "Survey 1", questionIndex: 0, questionId: "q_fit", canonicalQuestionKey: "q_fit", label: "FedEx as a Champions League sponsor?", resultMode: "historical", completedResponses: 196, base: 196, shown: null, displayLanguage: "en", options: [opt("1", "Strong natural fit", 62, 196), opt("2", "Relevant but unclear", 58, 196), opt("3", "Mostly brand visibility", 23, 196), opt("4", "Never noticed them", 53, 196)] },
    { surveyId: "B", surveyName: "Survey v2", questionIndex: 0, questionId: "q_fit", canonicalQuestionKey: "q_fit", label: "FedEx as a Champions League sponsor?", resultMode: "historical", completedResponses: 78, base: 78, shown: null, displayLanguage: "en", options: [opt("1", "Strong natural fit", 30, 78), opt("2", "Relevant but unclear", 27, 78), opt("3", "Mostly brand visibility", 6, 78), opt("4", "Never noticed them", 15, 78)] },
  ],
};
const STUDY = { id: "STU", name: "FedEx UCL Study", objective: "Assess perceptions of FedEx as a UCL sponsor and identify fan expectations for sponsor engagement.", surveyCount: 2, completedResponses: 274, surveyIds: ["A", "B"] };
const payload = buildStudyAnalysisEvidence(STUDY, [q1]);
const e1 = payload.evidence[0].ref; // combined "Strong natural fit"
const e2 = payload.evidence[1].ref; // combined "Relevant but unclear"
const groupedRef = payload.derived.find((d) => d.kind === "grouped_share")!.ref;

// ── 1,2,3. Internal-ref leakage — refs never survive into user-facing prose ───
test("1. narrative prose is stripped of internal short refs (id=eN / (e1))", () => {
  const raw = { narrative: { headline: "A credible foundation with a visibility gap (id=e1)", summary: "Strong fit leads (id=e1) while a quarter have not noticed the sponsorship (e2).", evidenceRefs: ["e1", "e2"] } };
  const { narrative } = validateNarrative(raw, payload.evidence, payload.derived);
  assert.ok(narrative);
  assert.equal(containsInlineRef(narrative!.headline), false);
  assert.equal(containsInlineRef(narrative!.summary), false);
});

test("2. narrative prose is stripped of canonical refs (study#..|q#..)", () => {
  const raw = { narrative: { headline: "Conclusion", summary: `Strong fit leads study#STU|q#q_fit|opt#1|src#combined among fans.`, evidenceRefs: ["e1"] } };
  const { narrative } = validateNarrative(raw, payload.evidence, payload.derived);
  assert.ok(narrative);
  assert.equal(containsInlineRef(narrative!.summary), false);
  assert.doesNotMatch(narrative!.summary, /study#/);
});

test("3. governed evidenceRefs are still persisted separately (stripping never drops them)", () => {
  const raw = { narrative: { headline: "Conclusion", summary: "Strong fit leads (id=e1), tempered by non-recognition (id=e2).", evidenceRefs: ["e1", "e2"] } };
  const { narrative } = validateNarrative(raw, payload.evidence, payload.derived);
  assert.equal(narrative!.evidenceRefs.length, 2);
  assert.deepEqual(narrative!.evidenceRefs, [e1, e2]);
});

test("proposals prose is stripped of internal refs too (headline + explanation)", () => {
  const { valid } = validateProposals({ proposals: [{ type: "observation", priority: "key", headline: "Fit leads (id=e1)", explanation: "Strong fit is the leading response (id=e1).", evidenceRefs: ["e1"] }] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 1);
  assert.equal(containsInlineRef(valid[0].headline), false);
  assert.equal(containsInlineRef(valid[0].explanation), false);
});

test("stripInlineRefs leaves clean prose untouched", () => {
  const clean = "FedEx has a credible foundation but the partnership is not yet cutting through.";
  assert.equal(stripInlineRefs(clean), clean);
});

// ── 4,5. Grouped-share semantic safety ───────────────────────────────────────
test("4. grouped derived share keeps a neutral, non-sentiment label", () => {
  const g = payload.derived.find((d) => d.kind === "grouped_share")!;
  assert.match(g.label, /two most-selected options together/);
  assert.doesNotMatch(g.label, /positive|favourable|approve/i);
  assert.match(String(g.detail.note), /not a sentiment measure/);
});

test("5. a grouped share restated as sentiment/approval is rejected (share ≠ sentiment)", () => {
  const { valid, rejected } = validateProposals({ proposals: [
    { type: "observation", priority: "key", headline: "64.6% view FedEx positively as a sponsor", explanation: "The two most-selected options together show fans see FedEx favourably.", evidenceRefs: ["e1", "e2", groupedRef] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 0);
  assert.ok(rejected[0].reasons.some((r) => /sentiment\/approval verdict/.test(r)));
});

test("5b. the SAME grouped share described factually is accepted", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "synthesis", priority: "key", headline: "Fit and unclear-relevance dominate the response", explanation: "The two most-selected options together account for most selections, with outright non-recognition a notable minority.", evidenceRefs: ["e1", "e2", groupedRef] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 1);
});

test("groupedShareSemanticReasons only fires when a grouped share is cited", () => {
  assert.equal(groupedShareSemanticReasons("fans view FedEx positively", false).length, 0); // no grouped ref cited
  assert.equal(groupedShareSemanticReasons("fans view FedEx positively", true).length, 1);
});

// ── 6-11. Analyst prompt requires CONNECTIONS + objective meaning ─────────────
test("6,7,8,9,10,11. analyst prompt explicitly asks to connect, reinforce, tension, contradict, synthesise, and read against the objective", () => {
  const p = buildStage1Prompt(payload, [q1], STUDY.objective);
  assert.match(p, /JOB B — CONNECT/);
  assert.match(p, /REINFORCE/);
  assert.match(p, /CONTRADICT/i);
  assert.match(p, /tension/i);
  assert.match(p, /same underlying story/i);
  assert.match(p, /implication — what the evidence means for the objective/i);
});

// ── 12,13. Higher-order artifact types are supported end-to-end ───────────────
test("12. analyst schema offers the higher-order kinds", () => {
  const p = buildStage1Prompt(payload, [q1], STUDY.objective);
  for (const k of ["pattern", "tension", "synthesis", "implication"]) assert.match(p, new RegExp(k));
});

test("12b. a pattern/tension proposal validates and maps to a stored enum (no migration)", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "pattern", priority: "key", headline: "Experiential value recurs across questions", explanation: "Access-to-experiences and rewards lead their questions, a consistent experiential signal.", evidenceRefs: ["e1", "e2"] },
    { type: "tension", priority: "key", headline: "Credible fit sits against non-recognition", explanation: "Strong fit leads, yet a quarter have never noticed the sponsorship.", evidenceRefs: ["e1", groupedRef] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 2);
  assert.equal(valid[0].displayType, "pattern");
  assert.equal(valid[1].displayType, "tension");
  assert.ok(PROPOSAL_TYPES.includes(valid[0].type)); // stored enum stays valid
  assert.ok(PROPOSAL_TYPES.includes(valid[1].type));
});

test("13. pattern/tension/synthesis need ≥2 refs; a 1-ref higher-order artifact salvages to observation", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "pattern", priority: "supporting", headline: "One result only", explanation: "Just one point.", evidenceRefs: ["e1"] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid[0].displayType, "observation"); // salvaged, not rejected
});

// ── 14,15. Implication grounding ─────────────────────────────────────────────
test("14. an implication grounded in its cited evidence is accepted", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "implication", priority: "key", headline: "Make the sponsorship more noticeable to close the recognition gap", explanation: "With strong fit leading but many fans not having noticed FedEx, the clearest step is activation that makes the partnership more visible.", evidenceRefs: ["e1", payload.evidence[3].ref] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].displayType, "implication");
});

test("15. a generic implication that name-drops refs but discusses none of them is rejected", () => {
  const { valid, rejected } = validateProposals({ proposals: [
    { type: "implication", priority: "key", headline: "Build engaging campaigns to win hearts and minds", explanation: "Brands should craft compelling storytelling to deepen loyalty and drive affinity.", evidenceRefs: ["e1", "e2"] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 0);
  assert.ok(rejected[0].reasons.some((r) => /not grounded in the cited evidence/.test(r)));
});

// ── 16,17. Priority is presentation only; breadth is not reduced by priority ──
test("16. projection prompt receives EVERY proposal (breadth not reduced by priority)", () => {
  const props = [
    { displayType: "tension", headline: "Central tension", explanation: "x", evidenceRefs: [e1, e2] },
    { displayType: "observation", headline: "A supporting minority", explanation: "y", evidenceRefs: [e1] },
    { displayType: "implication", headline: "The implication", explanation: "z", evidenceRefs: [e1, e2] },
  ];
  const p = buildStage2Prompt(payload, props, STUDY.objective);
  for (const pr of props) assert.ok(p.includes(pr.headline));
});

test("17. key vs supporting never changes validity", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "observation", priority: "key", headline: "Key one", explanation: "Strong fit leads.", evidenceRefs: ["e1"] },
    { type: "observation", priority: "supporting", headline: "Supporting one", explanation: "Unclear relevance is close behind.", evidenceRefs: ["e2"] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 2);
  assert.equal(valid[0].priority, "key");
  assert.equal(valid[1].priority, "supporting");
});

// ── 18,19,20,21. Projection receives the full analytical body + objective + derived ──
test("18. projection receives each proposal's kind, headline AND reasoning (not headline-only)", () => {
  const props = [{ displayType: "synthesis", headline: "Fit outpaces recognition", explanation: "Strong fit leads while non-recognition remains a notable minority.", evidenceRefs: [e1, e2] }];
  const p = buildStage2Prompt(payload, props, STUDY.objective);
  assert.match(p, /synthesis/);
  assert.ok(p.includes("Fit outpaces recognition"));
  assert.ok(p.includes("Strong fit leads while non-recognition remains a notable minority."));
});

test("19,20,21. projection prompt carries the objective, the derived facts, and asks for support AND limitation", () => {
  const p = buildStage2Prompt(payload, [{ displayType: "observation", headline: "h", explanation: "e", evidenceRefs: [e1] }], STUDY.objective);
  assert.ok(p.includes(STUDY.objective));       // 19
  assert.match(p, /DERIVED FACTS/);             // 20
  assert.match(p, /limiting\/counter-evidence/); // 21
  assert.match(p, /central interpretation → support → qualification\/tension → implication/i);
});

// ── No-migration invariant: every rich kind maps to a stored enum value ───────
test("no migration: every analytical kind maps to the persisted type CHECK enum", () => {
  for (const k of ARTIFACT_KINDS) assert.ok(PROPOSAL_TYPES.includes(storedTypeOf(k)), `${k} → ${storedTypeOf(k)} must be a stored enum`);
});

// ═══ Completeness + Narrative Precision V1 — Part 16 additions ════════════════

// Q2 (different canonical question) so we can test cross-question guards.
const q2: StudyResultGroup = {
  canonicalQuestionKey: "q_offer", label: "What should sponsors offer fans?", comparability: "combined",
  combined: { base: 274, sourceCount: 2, options: [opt("1", "Exclusive access", 59, 274), opt("2", "Rewards and benefits", 100, 274)] },
  sources: [
    { surveyId: "A", surveyName: "Survey 1", questionIndex: 1, questionId: "q_offer", canonicalQuestionKey: "q_offer", label: "What should sponsors offer fans?", resultMode: "historical", completedResponses: 196, base: 196, shown: null, displayLanguage: "en", options: [opt("1", "Exclusive access", 41, 196), opt("2", "Rewards and benefits", 66, 196)] },
    { surveyId: "B", surveyName: "Survey v2", questionIndex: 1, questionId: "q_offer", canonicalQuestionKey: "q_offer", label: "What should sponsors offer fans?", resultMode: "historical", completedResponses: 78, base: 78, shown: null, displayLanguage: "en", options: [opt("1", "Exclusive access", 18, 78), opt("2", "Rewards and benefits", 34, 78)] },
  ],
};
const payload2 = buildStudyAnalysisEvidence({ ...STUDY }, [q1, q2]);
const fitRef = payload2.evidence.find((e) => e.canonicalQuestionKey === "q_fit" && e.scope === "combined")!.ref;   // Q1
const offerRef = payload2.evidence.find((e) => e.canonicalQuestionKey === "q_offer" && e.scope === "combined")!.ref; // Q2
const spreadRef = payload2.derived.find((d) => d.kind === "spread")?.ref;

// P16.1 — Key/Supporting cannot remove a valid proposal
test("P16.1 classification (key/supporting) never removes a valid proposal", () => {
  const headlines = [
    "Strong natural fit leads sponsor perception",
    "A sizeable minority never noticed the sponsorship",
    "Rewards and benefits top what fans expect",
    "Access to experiences is the favoured contribution",
    "Grassroots investment appeals unevenly across audiences",
    "Exclusive access is a secondary expectation",
  ];
  const props = headlines.map((h, i) => ({ type: "observation", priority: i % 2 ? "supporting" : "key", headline: h, explanation: "Grounded in the evidence.", evidenceRefs: [payload2.evidence[i].ref] }));
  const { valid } = validateProposals({ proposals: props }, payload2.evidence, payload2.derived);
  assert.equal(valid.length, 6);
  assert.equal(valid.filter((p) => p.priority === "supporting").length, 3);
});

// P16.2 — distinct interpretations sharing evidence both survive
test("P16.2 distinct interpretations sharing evidence both survive", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "observation", priority: "key", headline: "Strong fit is a credible foundation", explanation: "Fit leads.", evidenceRefs: [fitRef] },
    { type: "implication", priority: "key", headline: "A credible platform still needs activation to land", explanation: "Fit gives permission but fans expect tangible value.", evidenceRefs: [fitRef, offerRef] },
  ] }, payload2.evidence, payload2.derived);
  assert.equal(valid.length, 2);
});

// P16.3 — genuine duplicates removed
test("P16.3 genuine duplicates (identical headline) are removed", () => {
  const p = { type: "observation", priority: "key", headline: "Same idea", explanation: "Fit leads.", evidenceRefs: [fitRef] };
  const { valid } = validateProposals({ proposals: [p, { ...p, evidenceRefs: [offerRef] }] }, payload2.evidence, payload2.derived);
  assert.equal(valid.length, 1);
});

// P16.4 — cross-question non-comparable percentages cannot be described as a numeric gap
test("P16.4 cross-question numeric 'gap' between different questions is rejected", () => {
  for (const headline of [
    "A gap between sponsorship fit and desired rewards",
    "Fit is higher than the demand for rewards",
    "Fit exceeds expectations for rewards",
  ]) {
    const { valid, rejected } = validateProposals({ proposals: [
      { type: "synthesis", priority: "key", headline, explanation: "Comparing the two percentages directly.", evidenceRefs: [fitRef, offerRef] },
    ] }, payload2.evidence, payload2.derived);
    assert.equal(valid.length, 0, `should reject: ${headline}`);
    assert.ok(rejected[0].reasons.some((r) => /different questions are not the same measure/.test(r)));
  }
});

// P16.5 — cross-question SEMANTIC synthesis (meaning, no magnitude) remains allowed
test("P16.5 cross-question synthesis connecting MEANING (no magnitude words) is allowed", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "synthesis", priority: "key", headline: "Permission to play, but fans want tangible value", explanation: "A credible sponsorship fit coexists with a clear expectation that sponsors deliver rewards and access.", evidenceRefs: [fitRef, offerRef] },
  ] }, payload2.evidence, payload2.derived);
  assert.equal(valid.length, 1);
});

// P16.4b — the SAME magnitude comparison WITHIN one question is fine (options in one Q)
test("P16.4b numeric comparison WITHIN one comparable question is not blocked", () => {
  const opt1 = payload2.evidence.find((e) => e.canonicalQuestionKey === "q_offer" && e.optionLabel === "Rewards and benefits" && e.scope === "combined")!.ref;
  const opt2 = payload2.evidence.find((e) => e.canonicalQuestionKey === "q_offer" && e.optionLabel === "Exclusive access" && e.scope === "combined")!.ref;
  const { valid } = validateProposals({ proposals: [
    { type: "observation", priority: "key", headline: "Rewards are chosen more than exclusive access", explanation: "Within the same question, rewards lead exclusive access.", evidenceRefs: [opt1, opt2] },
  ] }, payload2.evidence, payload2.derived);
  assert.equal(valid.length, 1);
});

// P16.6 — evidenceRefs JSON-ish leakage stripped from prose (many shapes)
test("P16.6 evidenceRefs / array / quoted-ref leakage is stripped from narrative prose", () => {
  const raw = { narrative: { headline: "A credible foundation", summary: `Fans see a fit (evidenceRefs: ["e1", "e14", "e25"]) and want value ["e3","e43"]. Non-recognition remains "e2".`, evidenceRefs: ["e1", "e2"] } };
  const { narrative } = validateNarrative(raw, payload.evidence, payload.derived);
  assert.ok(narrative);
  assert.equal(containsInlineRef(narrative!.summary), false);
  assert.doesNotMatch(narrative!.summary, /evidenceRefs|\[|e14|e25|e43/);
});

test("P16.6b stripInlineRefs handles the documented leak shapes", () => {
  for (const s of [`(id=e1)`, `ref=e1`, `refs: e1`, `["e1","e2"]`, `(evidenceRefs: ["e1", "e2"])`, `study#STU|q#q_fit|opt#1|src#combined`, `( e1 , e2 )`, `"e7"`]) {
    assert.equal(containsInlineRef(stripInlineRefs(`Prose ${s} more prose.`)), false, `not stripped: ${s}`);
  }
  // legitimate prose is untouched
  assert.equal(stripInlineRefs("The eventual outcome, e.g. more reach, matters."), "The eventual outcome, e.g. more reach, matters.");
});

// P16.7 — governance refs remain structurally intact after prose stripping
test("P16.7 governance evidenceRefs survive prose stripping", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "observation", priority: "key", headline: "Fit leads (evidenceRefs: [\"e1\"])", explanation: `Strong fit ["e1"].`, evidenceRefs: ["e1"] },
  ] }, payload.evidence, payload.derived);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].evidenceRefs.length, 1);       // ref preserved structurally
  assert.equal(containsInlineRef(valid[0].headline), false);
  assert.equal(containsInlineRef(valid[0].explanation), false);
});

// P16.11b — mislabeled cross-survey comparison (cites a derived spread) is PRESERVED as observation
test("P16.11b a 'comparison' citing a derived spread is preserved as an observation, not rejected", () => {
  if (!spreadRef) return; // fixture always yields a spread for q_fit
  const { valid } = validateProposals({ proposals: [
    { type: "comparison", priority: "supporting", headline: "Fit perception differs between the two surveys", explanation: "The spread across surveys is notable.", evidenceRefs: [spreadRef, fitRef] },
  ] }, payload2.evidence, payload2.derived);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].displayType, "observation"); // reclassified, avenue preserved
});

// P16.3b — near-identical RESTATEMENTS of the same avenue are merged (multi-pass union)
test("P16.3b near-duplicate restatements of one avenue are merged; distinct reads survive", () => {
  const mk = (headline: string, priority: "key" | "supporting" = "key"): StudyAnalysisProposal => ({ type: "observation", displayType: "observation", priority, headline, explanation: "x", evidenceRefs: [fitRef] });
  const { kept, dropped } = dedupeProposals([
    mk("FedEx perceived as a strong natural fit for UCL sponsorship"),
    mk("FedEx perceived as a natural fit in UCL sponsorship"),        // restatement → dropped
    mk("A credible platform still needs stronger activation to land"), // distinct → kept
    mk("Access to experiences leads what fans want from FedEx"),       // distinct → kept
  ]);
  assert.equal(kept.length, 3);
  assert.equal(dropped.length, 1);
  assert.ok(dropped[0].headline.includes("natural fit in UCL"));
});

test("P16.3c dedupe does NOT collapse distinct interpretations that share vocabulary", () => {
  const mk = (headline: string): StudyAnalysisProposal => ({ type: "synthesis", displayType: "synthesis", priority: "key", headline, explanation: "x", evidenceRefs: [fitRef, offerRef] });
  const { kept } = dedupeProposals([
    mk("Sponsorship fit gives FedEx permission to be present"),
    mk("Sponsorship fit alone does not create fan value"),
  ]);
  assert.equal(kept.length, 2); // same subject, opposite analytical point → both survive
});

// P16.11c — a genuine non-comparable BASE comparison is still rejected (firewall intact)
test("P16.11c a base comparison across different questions is still rejected (firewall intact)", () => {
  const { valid, rejected } = validateProposals({ proposals: [
    { type: "comparison", priority: "key", headline: "Comparing fit and offers", explanation: "Two base results from different questions.", evidenceRefs: [fitRef, offerRef] },
  ] }, payload2.evidence, payload2.derived);
  assert.equal(valid.length, 0);
  assert.ok(rejected[0].reasons.some((r) => /comparable question|non-directly-comparable|contrast ≥2 source/.test(r)));
});

// ═══ Hierarchy + Executive Synthesis V1 — theme tests ════════════════════════
const P = (headline: string, evidenceRefs: string[]): StudyAnalysisProposal => ({ type: "observation", displayType: "observation", priority: "key", headline, explanation: "x", evidenceRefs });
const THEME_PROPS: StudyAnalysisProposal[] = [
  P("Strong natural fit leads", [fitRef]),          // P1
  P("A quarter never noticed the sponsorship", [offerRef]), // P2 (ref used only for wiring)
  P("Rewards and benefits top expectations", [offerRef]),   // P3
];

// T1 — themes reference proposals by index; server computes evidenceRefs (union); model refs ignored
test("T1 theme evidenceRefs are the SERVER union of member proposals — model-supplied refs ignored", () => {
  const { themes } = validateThemes({ themes: [
    { title: "Credible fit but weak recognition", interpretation: "Fit is real yet many miss it.", proposals: [1, 2], importance: "primary", relationToObjective: "answers the perception half", evidenceRefs: ["e999"] },
  ] }, THEME_PROPS, payload2.evidence, payload2.derived);
  assert.equal(themes.length, 1);
  assert.equal(themes[0].id, "t1");
  assert.deepEqual(themes[0].proposalIndexes, [0, 1]);
  assert.deepEqual([...themes[0].evidenceRefs].sort(), [fitRef, offerRef].sort()); // union, NOT "e999"
  assert.ok(!themes[0].evidenceRefs.includes("e999"));
});

// T2 — a theme with no valid member is rejected (never shown unsupported)
test("T2 a theme whose proposal indices don't resolve is rejected (graceful)", () => {
  const { themes, rejected } = validateThemes({ themes: [
    { title: "Floating theme", interpretation: "Cites nothing real.", proposals: [99, 100], importance: "primary", relationToObjective: "n/a" },
  ] }, THEME_PROPS, payload2.evidence, payload2.derived);
  assert.equal(themes.length, 0);
  assert.ok(rejected[0].reasons.some((r) => /no valid supporting proposals/.test(r)));
});

// T3 — theme prose is stripped of internal refs; title/interpretation clean
test("T3 theme title/interpretation are stripped of internal refs", () => {
  const { themes } = validateThemes({ themes: [
    { title: `Credible fit (evidenceRefs: ["e1"])`, interpretation: `Fit leads ["e1","e2"] but recognition lags (id=e3).`, proposals: [1], importance: "secondary", relationToObjective: "study#STU|q#q_fit relevance" },
  ] }, THEME_PROPS, payload2.evidence, payload2.derived);
  assert.equal(themes.length, 1);
  assert.equal(containsInlineRef(themes[0].title), false);
  assert.equal(containsInlineRef(themes[0].interpretation), false);
  assert.equal(containsInlineRef(themes[0].relationToObjective), false);
});

// T4 — a proposal may belong to MULTIPLE themes (many-to-many)
test("T4 a proposal may support more than one theme", () => {
  const { themes } = validateThemes({ themes: [
    { title: "Recognition is the weakness", interpretation: "Awareness is thin.", proposals: [1, 2], importance: "primary", relationToObjective: "a" },
    { title: "Activation is the opportunity", interpretation: "Awareness feeds the activation story too.", proposals: [2, 3], importance: "primary", relationToObjective: "b" },
  ] }, THEME_PROPS, payload2.evidence, payload2.derived);
  assert.equal(themes.length, 2);
  assert.ok(themes[0].proposalIndexes.includes(1) && themes[1].proposalIndexes.includes(1)); // P2 in both
});

// T5 — a theme whose prose overstates a grouped share is rejected (governance on themes)
test("T5 theme governance: a grouped-share sentiment overstatement is rejected", () => {
  const grouped = payload2.derived.find((d) => d.kind === "grouped_share")!.ref;
  const props: StudyAnalysisProposal[] = [P("Combined fit share", [grouped])];
  const { themes, rejected } = validateThemes({ themes: [
    { title: "Most fans view FedEx positively", interpretation: "The combined share shows fans see FedEx favourably.", proposals: [1], importance: "primary", relationToObjective: "a" },
  ] }, props, payload2.evidence, payload2.derived);
  assert.equal(themes.length, 0);
  assert.ok(rejected[0].reasons.some((r) => /sentiment\/approval verdict/.test(r)));
});

// T6 — no themes at all → empty (graceful; UI falls back to proposal-level view)
test("T6 absent/empty themes degrade gracefully to []", () => {
  assert.deepEqual(validateThemes({ narrative: {} }, THEME_PROPS).themes, []);
  assert.deepEqual(validateThemes({}, THEME_PROPS).themes, []);
});

// T7 — synthesis prompt asks for themes-then-narrative and forbids refs in theme prose
test("T7 synthesis prompt requests themes + theme-driven narrative, refs out of theme prose", () => {
  const p = buildStage2Prompt(payload2, THEME_PROPS.map((x) => ({ displayType: x.displayType, headline: x.headline, explanation: x.explanation, evidenceRefs: x.evidenceRefs })), STUDY.objective);
  assert.match(p, /STEP 1 — THEMES/);
  assert.match(p, /STEP 2 — STUDY NARRATIVE/);
  assert.match(p, /could this title be written BEFORE seeing the results/i);
  assert.match(p, /do NOT force a count/i);
  assert.match(p, /do NOT put evidence refs on a theme/i);
  assert.match(p, /"themes":\[/);
});

// ═══ Audience segmentation integration (Part 23) ═════════════════════════════
import { buildSegmentDerived } from "./study-segments";
import { buildStudyAnalysisEvidence as bEv } from "./study-analysis";
// FedEx-shaped country segments (real numbers) → derived audience facts, then the FULL payload.
const segFixture = [
  { canonicalQuestionKey: "q_fit", question: "FedEx as a Champions League sponsor?", dimension: "country" as const,
    overall: [opt("1", "Strong natural fit", 92, 274), opt("2", "Relevant but unclear", 85, 274), opt("3", "Mostly brand visibility", 29, 274), opt("4", "Never noticed them", 68, 274)], overallBase: 274,
    groups: [
      { key: "FR", label: "France", base: 51, options: [opt("1", "Strong natural fit", 20, 51), opt("2", "Relevant but unclear", 15, 51), opt("3", "Mostly brand visibility", 6, 51), opt("4", "Never noticed them", 10, 51)] },
      { key: "DE", label: "Germany", base: 44, options: [opt("1", "Strong natural fit", 9, 44), opt("2", "Relevant but unclear", 12, 44), opt("3", "Mostly brand visibility", 5, 44), opt("4", "Never noticed them", 18, 44)] },
      { key: "UK", label: "the UK", base: 121, options: [opt("1", "Strong natural fit", 45, 121), opt("2", "Relevant but unclear", 41, 121), opt("3", "Mostly brand visibility", 12, 121), opt("4", "Never noticed them", 23, 121)] },
    ] },
];
const segDerived = buildSegmentDerived("STU", segFixture);
const segPayload = bEv({ ...STUDY }, [q1], segDerived);
const segRef = segDerived[0].ref;
const allDerived = [...segPayload.derived, ...segPayload.segmentDerived];

test("M. a proposal citing a segment (audience) fact resolves and validates", () => {
  const { valid } = validateProposals({ proposals: [
    { type: "observation", priority: "supporting", headline: "Recognition is weakest among German respondents", explanation: "Non-recognition of FedEx is most pronounced among Germany respondents.", evidenceRefs: [segRef] },
  ] }, segPayload.evidence, allDerived);
  assert.equal(valid.length, 1);
  assert.deepEqual(valid[0].evidenceRefs, [segRef]); // the governed segment ref survives
});

test("N/O/P. an audience avenue can join a theme (server-computed evidence union includes the segment ref)", () => {
  const props = [
    { type: "observation", displayType: "observation", priority: "key", headline: "Fit leads overall", explanation: "x", evidenceRefs: [segPayload.evidence[0].ref] },
    { type: "observation", displayType: "observation", priority: "supporting", headline: "Recognition weakest among German respondents", explanation: "y", evidenceRefs: [segRef] },
  ] as StudyAnalysisProposal[];
  const { themes } = validateThemes({ themes: [
    { title: "Credible fit, but recognition is uneven by market", interpretation: "Fit is real overall yet recognition lags among some markets.", proposals: [1, 2], importance: "primary", relationToObjective: "perception half" },
  ] }, props, segPayload.evidence, allDerived);
  assert.equal(themes.length, 1);
  assert.ok(themes[0].evidenceRefs.includes(segRef)); // audience evidence flows into the theme union
});

test("J. audience prose stays descriptive — a causal PARTNER claim is not introduced by our labels", () => {
  // Our derived labels never say "caused/made"; they say "respondents in/among <group>".
  assert.ok(segDerived.every((d) => !/caused|makes respondents|because of the partner|due to the partner/i.test(d.label)));
  assert.ok(segDerived.every((d) => /respondents/i.test(d.label)));
});

test("story-test + semantic care are in the analyst prompt; headline-precision + segment-aware in synthesis", () => {
  const a = buildStage1Prompt(segPayload, [q1], STUDY.objective);
  assert.match(a, /JOB C — TEST THE STORY BY AUDIENCE/);
  assert.match(a, /respondents in\/among/);
  assert.match(a, /never a national-character claim/i);
  assert.match(a, /AUDIENCE FACTS/);
  const s = buildStage2Prompt(segPayload, [{ displayType: "observation", headline: "h", explanation: "e", evidenceRefs: [segPayload.evidence[0].ref] }], STUDY.objective);
  assert.match(s, /SEGMENT-AWARE/);
  assert.match(s, /HEADLINE PRECISION/);
  assert.match(s, /does NOT license "fit is strong"/);
});
