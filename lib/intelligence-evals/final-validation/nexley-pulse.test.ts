// ── FINAL STAGE-5 VALIDATION — independent dataset "Nexley employee pulse" ────
// Materially different domain (workplace pulse), authored BLIND and FROZEN before
// running the Core. It exercises the REAL Stage-5D product path end-to-end:
//   stored Studio questions → governSurveyQuestions (server governance from template
//   ALONE) → resolveInstrumentSemantics → buildSurveyAnalysisEvidence (immutable
//   snapshot) → studioEvidenceToGovernedInput → studioToDiscoveryInput → runAnalysis.
// No eval-only semantic overlay is injected for the governed ordinal questions.
//
// Product constraints respected: one localised choice question shape, 2–4 answers,
// numeric 1-based option ids. Do NOT modify expectations after seeing Core output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { governSurveyQuestions, resolveInstrumentSemantics } from "@/lib/studio/scale-templates";
import { buildSurveyAnalysisEvidence, type SurveyAnalysisScope } from "@/lib/studio/survey-analysis-evidence";
import type { QuestionResultView } from "@/lib/studio/dashboard-results";
import { studioEvidenceToGovernedInput, type StudioEvidenceSnapshot } from "@/lib/core/studio/studio-evidence-adapter";
import { studioToDiscoveryInput } from "@/lib/core/studio/adapter";
import { runAnalysis } from "@/lib/core/pipeline/analyse";
import type { SemanticGroupingProposer, GroupingProposal } from "@/lib/core/semantic/grouping";
import type { Candidate } from "@/lib/core/candidates/types";

// ── SOURCE (base 260) — stored Studio questions + their numeric distributions ──
const BASE = 260;
const STORED_QUESTIONS = [
  { id: "qrely", canonical_question_key: "qrely", text: { en: "I can rely on our core systems" }, scale_template: "agreement_4",
    options: [{ id: 1, text: { en: "Strongly agree" } }, { id: 2, text: { en: "Agree" } }, { id: 3, text: { en: "Disagree" } }, { id: 4, text: { en: "Strongly disagree" } }] },
  { id: "qtools", canonical_question_key: "qtools", text: { en: "Satisfaction with collaboration tools" }, scale_template: "satisfaction_4",
    options: [{ id: 1, text: { en: "Very satisfied" } }, { id: 2, text: { en: "Satisfied" } }, { id: 3, text: { en: "Dissatisfied" } }, { id: 4, text: { en: "Very dissatisfied" } }] },
  { id: "qimprove", canonical_question_key: "qimprove", text: { en: "What would most improve your workday?" }, // CUSTOM — no template
    options: [{ id: 1, text: { en: "Faster systems" } }, { id: 2, text: { en: "More flexibility" } }, { id: 3, text: { en: "Better manager support" } }, { id: 4, text: { en: "Clearer priorities" } }] },
];
const COUNTS: Record<string, number[]> = {
  qrely:    [30, 60, 90, 80],   // top-box 1+2 = 90 (34.6%), bottom-box 3+4 = 170 (65.4%)  ← the central weakness
  qtools:   [90, 110, 40, 20],  // top-box 1+2 = 200 (76.9%) ← a strength
  qimprove: [78, 70, 62, 50],   // spread, weak lead (+3.1pp), no governed grouping
};

// ── FROZEN expectations (authored BEFORE running the Core) ─────────────────────
const FROZEN = {
  governedSemantics: {
    qrely:  { scaleType: "ordinal", constructKey: "agreement",   bottomBox: ["3", "4"], topBox: ["1", "2"] },
    qtools: { scaleType: "ordinal", constructKey: "satisfaction", topBox: ["1", "2"], bottomBox: ["3", "4"] },
    qimprove: null, // custom — NO governed semantics
  },
  mustFind: [
    "qrely bottom-box governed recode DERIVED (~65.4% cannot rely) — the central weakness",
    "qtools top-box governed recode DERIVED (~76.9% satisfied with tools) — a strength",
    "qimprove surfaced as a spread / no-clear-leader distribution (no governed grouping)",
  ],
  mustNotSay: [
    "no DERIVED authority on any qimprove grouping (custom, cross-construct)",
    "the single largest qrely answer (Disagree 34.6%) is NOT the headline over the majority-negative recode",
    "no invented statistic in synthesis; synthesis never Primary",
    "no cross-question DERIVED grouping",
  ],
  broadHierarchy: "Top: reliability distrust (qrely bottom-box) + tools satisfaction (qtools top-box). Synthesis (systems-not-collaboration) at most Secondary. qimprove spread Contextual. Single-answer 'Disagree leads' not the headline.",
};
// Integrity hash of the Core-INDEPENDENT source+expectations (freeze proof).
const FROZEN_HASH = "7e5023b0298193265d7a3a88d66ee85482f2f7e6482abcf0f3a4da8e2e24bfda";

function freezeHash(): string {
  return createHash("sha256").update(JSON.stringify({ BASE, STORED_QUESTIONS, COUNTS, FROZEN })).digest("hex");
}

// ── Real Stage-5D path → Core DiscoveryInput ──────────────────────────────────
function buildDiscovery() {
  const governed = governSurveyQuestions(STORED_QUESTIONS) as typeof STORED_QUESTIONS;
  const semantics = resolveInstrumentSemantics(governed);
  const views: QuestionResultView[] = STORED_QUESTIONS.map((q, qi) => ({
    questionIndex: qi, questionId: q.id, text: q.text.en, shown: BASE, answered: BASE, base: BASE, completion: null, marginOfError: 6.1,
    options: q.options.map((o, oi) => ({ optionId: String(o.id), label: o.text.en, count: COUNTS[q.id][oi], percentage: (COUNTS[q.id][oi] / BASE) * 100 })),
  } as unknown as QuestionResultView));
  const scope: SurveyAnalysisScope = { surveyId: "NEXLEY", surveyName: "Nexley pulse", objective: "Understand employee confidence in core systems and tools", completedResponses: BASE, mode: "studio_native" };
  const payload = buildSurveyAnalysisEvidence(scope, views, [], semantics);
  const input = studioEvidenceToGovernedInput(payload as unknown as StudioEvidenceSnapshot, { kind: "survey", id: "NEXLEY" });
  return { governed, semantics, payload, discovery: studioToDiscoveryInput(input) };
}

// A stochastic grouping proposer: proposes a DIFFERENT construct per run for the
// UNABLE (custom) groupings — to prove model variation cannot lift them past PROVISIONAL.
function varyingProposer(run: number): SemanticGroupingProposer & { calls: number } {
  const p = {
    calls: 0,
    propose(): GroupingProposal { p.calls++; return { proposedConstruct: `run${run}-construct-${p.calls}`, ambiguity: "low", competingInterpretations: run % 2 === 0, rationale: [`run ${run} rationale`] }; },
  };
  return p as never;
}
const outcomeById = (r: ReturnType<typeof runAnalysis>, suffix: string) => r.outcomes.find((o) => o.candidate.id.endsWith(suffix));
const interpOf = (o?: { candidate: { results?: Array<{ interpretation?: { authority?: string; decision?: string } }> } }) =>
  (o?.candidate.results ?? []).map((x) => x.interpretation).find(Boolean);

// ── §3 FREEZE integrity ───────────────────────────────────────────────────────
test("freeze: source+expectations hash is stable and recorded before Core output", () => {
  const h = freezeHash();
  console.log("NEXLEY freeze sha256:", h);
  assert.equal(h, FROZEN_HASH, "frozen source/expectations changed — freeze violated");
});

// ── §4 real Stage-5D governance establishes the frozen semantics ──────────────
test("§4 the PRODUCTION governance path establishes exactly the frozen governed semantics", () => {
  const { semantics } = buildDiscovery();
  assert.equal(semantics["qrely"].scaleType, "ordinal");
  assert.equal(semantics["qrely"].constructKey, "agreement");
  assert.deepEqual(semantics["qrely"].options["3"], { ordinalPosition: 2, polarity: "negative" });
  assert.deepEqual(semantics["qrely"].options["4"], { ordinalPosition: 1, polarity: "negative" });
  assert.equal(semantics["qtools"].constructKey, "satisfaction");
  assert.equal(semantics["qimprove"], undefined, "custom question stays without governed semantics");
});

// ── §5E/§5F deterministic DERIVED recodes need NO model (run with no proposer) ─
// Running with NO grouping proposer proves the governed recodes reach DERIVED purely
// by deterministic entailment. (The custom qimprove grouping DOES legitimately
// consult the model when a proposer is supplied — see §5C run below — so a whole-run
// call count would not isolate the recode path; absence of a proposer does.)
test("§5E/§5F legitimate governed recodes are DERIVED with NO model available", () => {
  const { discovery } = buildDiscovery();
  const r = runAnalysis(discovery); // no groupingProposer at all

  assert.equal(interpOf(outcomeById(r, "qrely#bottombox"))?.authority, "derived", "reliability bottom-box (distrust) is DERIVED");
  assert.equal(interpOf(outcomeById(r, "qtools#topbox"))?.authority, "derived", "tools top-box (satisfaction) is DERIVED");
  // With no model, the custom grouping cannot be derived — it is held, never DERIVED.
  assert.notEqual(interpOf(outcomeById(r, "qimprove#grouping"))?.authority, "derived", "custom grouping is not DERIVED without (or with) a model");
});

// ── §5B/§5D custom + invalid-ordinal cannot become DERIVED ────────────────────
test("§5B/§5D custom question + invalid cross-polarity grouping cannot gain DERIVED", () => {
  const { discovery } = buildDiscovery();
  // Inject a tempting-but-invalid grouping of qrely Agree(positive) + Disagree(negative) — crosses polarity.
  const invalid: Candidate = {
    id: "qrely#crosspolarity", kind: "semantic_grouping", claim: "Agree + Disagree combined",
    sourceQuestionKeys: ["qrely"],
    evidence: [
      { id: "qrely:2", kind: "base", sourceType: "survey", sourceId: "d", question: { canonicalKey: "qrely" }, option: { id: "2" }, numerator: 60, denominator: BASE, denominatorType: "respondents", quantity: { unit: "proportion", value: 60 / BASE } },
      { id: "qrely:3", kind: "base", sourceType: "survey", sourceId: "d", question: { canonicalKey: "qrely" }, option: { id: "3" }, numerator: 90, denominator: BASE, denominatorType: "respondents", quantity: { unit: "proportion", value: 90 / BASE } },
    ],
    results: [{ id: "qrely#cp", operation: "grouping", quantity: { unit: "proportion", value: 150 / BASE }, components: ["qrely:2", "qrely:3"], grouping: { kind: "governed_semantic", componentLabels: ["Agree", "Disagree"], parentConstruct: "(x)" } }],
    provenance: { generator: "test", deterministic: true, modelProposed: false }, reviewRequirements: [], state: "generated",
  } as unknown as Candidate;
  const r = runAnalysis(discovery, { groupingProposer: varyingProposer(0), externalCandidates: [invalid] });

  // custom qimprove: whatever the model proposes, it is NEVER derived.
  const improveGrp = interpOf(outcomeById(r, "qimprove#grouping"));
  assert.notEqual(improveGrp?.authority, "derived", "custom cross-construct grouping never DERIVED");
  // invalid cross-polarity grouping: rejected / not derived.
  const cp = outcomeById(r, "qrely#crosspolarity");
  assert.notEqual(interpOf(cp)?.authority, "derived", "cross-polarity ordinal grouping never DERIVED");
});

// ── §5C/§7 model variation cannot alter authoritative truth/hierarchy ──────────
test("§5C/§7 across 5 varying model runs, the DERIVED tier is identical; proposals stay PROVISIONAL", () => {
  const derivedFingerprints = new Set<string>();
  for (let run = 0; run < 5; run++) {
    const { discovery } = buildDiscovery();
    const r = runAnalysis(discovery, { groupingProposer: varyingProposer(run) });
    // The authoritative (DERIVED) set — ids of every derived interpretation.
    const derived = r.outcomes.filter((o) => interpOf(o)?.authority === "derived").map((o) => o.candidate.id).sort();
    derivedFingerprints.add(JSON.stringify(derived));
    // No model proposal ever reaches DERIVED authority.
    for (const o of r.outcomes) {
      const i = interpOf(o);
      if (i && i.authority === "derived") {
        // derived must be a governed threshold recode (topbox/bottombox), never a model construct.
        assert.ok(/#(top|bottom)box$/.test(o.candidate.id), `only governed recodes are DERIVED, got ${o.candidate.id}`);
      }
    }
    // The two central recodes are present every run.
    assert.equal(interpOf(outcomeById(r, "qrely#bottombox"))?.authority, "derived");
    assert.equal(interpOf(outcomeById(r, "qtools#topbox"))?.authority, "derived");
  }
  assert.equal(derivedFingerprints.size, 1, "the DERIVED tier is identical across all model variations");
});

// ── §6/§N usefulness + hierarchy: the central weakness surfaces; the single
//    largest answer is NOT the headline ────────────────────────────────────────
test("§6 the central story surfaces and naive 'largest answer' is not the headline", () => {
  const { discovery } = buildDiscovery();
  const r = runAnalysis(discovery, { groupingProposer: varyingProposer(0) });

  // The reliability bottom-box (65.4%) exists as a promoted DERIVED finding.
  const relyBottom = outcomeById(r, "qrely#bottombox");
  assert.equal(relyBottom?.finalState, "promoted", "reliability distrust majority is a promoted finding");
  // Its arithmetic is the honest 170/260 (no invented number).
  const gq = (relyBottom!.candidate.results ?? []).find((x) => x.grouping)?.quantity as { value: number };
  assert.ok(Math.abs(gq.value - 170 / 260) < 1e-9, "recode is exactly 170/260 = 65.4%");
  // qrely single-answer distribution is a weak-lead 'distribution_shape' (NOT a clear leader headline).
  const relyDist = outcomeById(r, "qrely#dist") ?? outcomeById(r, "qrely#lead");
  assert.ok(relyDist, "qrely distribution candidate exists");
  assert.equal(relyDist!.candidate.kind, "distribution_shape", "no clear single-answer leader (spread) — not a headline claim");
});

// ── §5J no invented refs/numbers: every evidence number traces to the source ──
test("§5J every base evidence figure in the snapshot matches the source distribution", () => {
  const { payload } = buildDiscovery();
  for (const e of (payload as { evidence: Array<{ canonicalQuestionKey: string; optionId: string; count: number; base: number }> }).evidence) {
    const idx = STORED_QUESTIONS.find((q) => q.id === e.canonicalQuestionKey)!.options.findIndex((o) => String(o.id) === e.optionId);
    assert.equal(e.count, COUNTS[e.canonicalQuestionKey][idx], `count matches source for ${e.canonicalQuestionKey}:${e.optionId}`);
    assert.equal(e.base, BASE);
  }
});
