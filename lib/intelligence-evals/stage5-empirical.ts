// ── Stage 5 empirical validation runner (MANUAL / LIVE — not CI) ──────────────
// Runs Gate A (real current Survey Studio pipeline) and Gate B (Analytical Core
// with the REAL bounded semantic model) against the FedEx governed evidence, N
// times, and scores both against Benchmark 001. Loads .env.local. Prints JSON
// blocks for capture. NOT a *.test.ts.
//   npx tsx lib/intelligence-evals/stage5-empirical.ts <gateA_runs> <gateB_runs>
import { readFileSync } from "node:fs";
import path from "node:path";

try { for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim(); } } catch { /* env may be present */ }

import { completeJSON } from "@/lib/intelligence/openai";
import { buildFedexStudy, buildFedexSegments, FEDEX_OBJECTIVE } from "@/lib/studio/qa/fedex-fixture";
import { buildStudyAnalysisEvidence, validateProposals, validateNarrative, validateThemes, dedupeProposals } from "@/lib/studio/study-analysis";
import { buildSegmentDerived } from "@/lib/studio/study-segments";
import { batchResultGroups } from "@/lib/studio/study-analysis-stage";
import { buildStage1Prompt, buildStage2Prompt } from "@/lib/studio/study-analysis-prompt";

import { generateCandidates } from "@/lib/core/candidates/generate";
import { validateGroupingStructure, FixtureGroupingProposer, verdictToProposal, FixtureSynthesisProposer, synthesisVerdictToSignal } from "@/lib/core/semantic";
import { assessEntailment } from "@/lib/core/semantic/entailment";
import { disconfirmationEffect } from "@/lib/core/disconfirmation/assess";
import { resolveGroupingVerdicts, resolveSynthesisVerdicts, resolveSemanticDisconfirmation } from "@/lib/core/semantic/model/judges";
import { runAnalysis } from "@/lib/core/pipeline/analyse";
import { fedexDiscoveryInput, invalidExternalCandidates } from "@/lib/core/pipeline/fedex-discovery";
import { applyFedexSemanticOverlay } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/semantic-overlay";
import { loadFedexBenchmark, fedexSourceModel } from "@/lib/intelligence-evals/benchmarks/fedex-ucl-001/benchmark";
import { scoreBenchmark, numbersIn } from "@/lib/intelligence-evals/scoring";
import type { AnalysisUnderTest } from "@/lib/intelligence-evals/capture-contract";

const benchmark = loadFedexBenchmark();
const source = fedexSourceModel();
const gateARuns = Math.max(0, Number(process.argv[2] ?? 2));
const gateBRuns = Math.max(0, Number(process.argv[3] ?? 5));

// ── Gate A — real Survey Studio pipeline (no DB) ─────────────────────────────
async function studioRun() {
  const { study, resultGroups } = buildFedexStudy();
  const segmentDerived = buildSegmentDerived(study.id, buildFedexSegments());
  const payload = buildStudyAnalysisEvidence(study, resultGroups, segmentDerived);
  const allDerived = [...payload.derived, ...payload.segmentDerived];
  const batched = batchResultGroups(resultGroups);
  if (!batched.ok) throw new Error(batched.error);
  const passes = batched.batches.length <= 2 ? 2 : 1;
  const collected: Awaited<ReturnType<typeof validateProposals>>["valid"] = [];
  let rejected = 0;
  for (const batch of batched.batches) for (let p = 1; p <= passes; p++) {
    const raw = await completeJSON<unknown>({ prompt: buildStage1Prompt(payload, batch, FEDEX_OBJECTIVE), model: "gpt-4o", temperature: 0.45, maxTokens: 4000 });
    const v = validateProposals(raw, payload.evidence, allDerived); rejected += v.rejected.length; collected.push(...v.valid);
  }
  const valid = dedupeProposals(collected).kept;
  let themes: Awaited<ReturnType<typeof validateThemes>>["themes"] = []; let narrative: { headline: string; summary: string } | null = null;
  try { const sraw = await completeJSON<unknown>({ prompt: buildStage2Prompt(payload, valid, FEDEX_OBJECTIVE), model: "gpt-4o", temperature: 0.35, maxTokens: 2200 }); themes = validateThemes(sraw, valid, payload.evidence, allDerived).themes; narrative = validateNarrative(sraw, payload.evidence, allDerived).narrative; } catch { /* optional */ }
  return { valid, themes, narrative, rejected, payload };
}

function projectStudio(r: Awaited<ReturnType<typeof studioRun>>): AnalysisUnderTest {
  const refToQ = new Map(r.payload.evidence.map((e) => [e.ref, e.canonicalQuestionKey]));
  const findings = r.valid.map((p, i) => {
    const text = `${p.headline} ${p.explanation ?? ""}`.trim();
    return { id: `p${i}`, rank: i + 1, text, statedNumbers: numbersIn(text), citedQuestions: [...new Set((p.evidenceRefs ?? []).map((rf) => refToQ.get(rf)).filter((x): x is string => !!x))], kind: p.displayType as never };
  });
  return { benchmarkId: "fedex-ucl-001", producedBy: "survey-studio", findings, narrative: r.narrative ? { headline: r.narrative.headline, summary: r.narrative.summary } : undefined };
}

// ── Gate B — Analytical Core with the REAL semantic model ────────────────────
const SYNTH = { id: "synthesis:value-access", claim: "Across both activation questions, fans consistently favour forms of sponsorship offering tangible value or access.", construct: "value and access", questionKeys: ["q_offer", "q_help"], componentCandidateIds: ["q_offer#lead", "q_help#dist"] };

async function coreRun() {
  // Stage 5R.8: FedEx governed input + the EVAL-ONLY semantic overlay (governed
  // metadata that would exist upstream in production). No Gold answers injected.
  const di = applyFedexSemanticOverlay(fedexDiscoveryInput());
  const semanticsFor = (qk: string) => di.questions.find((q) => q.questionKey === qk)?.semantics;
  const cands = generateCandidates(di);
  const ext = invalidExternalCandidates();
  const groupingCands = [...cands, ...ext].filter((c) => c.kind === "semantic_grouping" && validateGroupingStructure(c).ok);
  const t0 = Date.now();

  // Deterministic entailment FIRST — the model is called ONLY for groupings the
  // governed metadata cannot decide (Stage 5R.5 precedence). With the overlay every
  // FedEx grouping resolves deterministically, so grouping model-calls → 0.
  const entailByCand = new Map(groupingCands.map((c) => [c.id, assessEntailment(c.evidence.map((e) => ({ questionKey: e.question?.canonicalKey ?? "", optionId: e.option?.id ?? e.id })), semanticsFor)]));
  const needModel = groupingCands.filter((c) => entailByCand.get(c.id)!.decision === "unable_to_establish");
  const { verdicts: gv, provenance: gp } = await resolveGroupingVerdicts(needModel, di.objective, completeJSON);
  const { verdicts: sv, provenance: sp } = await resolveSynthesisVerdicts([SYNTH], (p) => p.componentCandidateIds.map((id) => ({ label: cands.find((c) => c.id === id)?.claim ?? id })), completeJSON);

  const groupingProposals = Object.fromEntries(Object.entries(gv).map(([k, v]) => [k, verdictToProposal(v)]));
  const synthesisSignals = Object.fromEntries(Object.entries(sv).map(([k, v]) => [k, synthesisVerdictToSignal(v)]));
  const result = runAnalysis(di, { groupingProposer: new FixtureGroupingProposer(groupingProposals), synthesisProposals: [SYNTH], synthesisProposer: new FixtureSynthesisProposer(synthesisSignals), externalCandidates: ext });
  const durationMs = Date.now() - t0;
  const byId = new Map(result.outcomes.map((o) => [o.candidate.id, o]));
  const interp = (id: string) => (byId.get(id)?.candidate.results ?? []).map((r) => r.interpretation).find(Boolean);

  // Real semantic disconfirmation probe on the rewards lead (the mf-2 Stage 5
  // over-weakened it). Map the model's challenge through the CLAIM-LEVEL effect.
  const lead = result.outcomes.find((o) => o.candidate.id === "q_offer#lead")?.candidate;
  let disc: { status?: string; kinds?: string[]; effect?: { suppress: boolean; demoteTo: string | null } } = {};
  if (lead) {
    const dv = (await resolveSemanticDisconfirmation({ claim: lead.claim, supportingEvidence: lead.evidence.map((e) => ({ id: e.id, label: e.option?.label })), objective: di.objective }, lead.evidence.map((e) => e.id), completeJSON)).value;
    if (dv) { const eff = disconfirmationEffect({ status: dv.status, kinds: dv.kinds, evidenceIds: [], reasons: dv.reasons, reviewRequired: false, assessor: "model-assisted" }); disc = { status: dv.status, kinds: dv.kinds, effect: { suppress: eff.suppress, demoteTo: eff.demoteTo } }; }
  }

  return {
    grouping_64_6: { entailment: entailByCand.get("q_fit#grouping")?.decision, authority: interp("q_fit#grouping")?.authority, provenance: interp("q_fit#grouping")?.provenance, priority: byId.get("q_fit#grouping")?.priority, modelCalled: needModel.some((c) => c.id === "q_fit#grouping") },
    grouping_55_8: { entailment: entailByCand.get("ext-55")?.decision, finalState: byId.get("ext-55")?.finalState, interpDecision: interp("ext-55")?.decision, method: interp("ext-55")?.derivation?.method, priority: byId.get("ext-55")?.priority, modelCalled: needModel.some((c) => c.id === "ext-55") },
    cross_q_69_3: { state: byId.get("ext-69")?.finalState, sentToEntailment: entailByCand.has("ext-69"), sentToModel: !!gv["ext-69"] },
    synthesis: { modelFormsStory: synthesisSignals["synthesis:value-access"]?.formsStory, authority: interp("synthesis:value-access")?.authority ?? "—", state: byId.get("synthesis:value-access")?.finalState, priority: byId.get("synthesis:value-access")?.priority },
    disconfirmation: disc,
    groupingModelCalls: needModel.length,
    hierarchy: { primary: result.hierarchy.primary.map((a) => a.findingId), secondary: result.hierarchy.secondary.map((a) => a.findingId), contextual: result.hierarchy.contextual.map((a) => a.findingId), suppressed: result.hierarchy.suppressed.map((a) => a.findingId) },
    provenance: [...gp, ...sp], durationMs,
  };
}

async function main() {
  console.log("MODEL: gpt-4o · rubrics: grouping_semantic_v1/synthesis_semantic_v1/disconfirmation_semantic_v1");
  for (let i = 1; i <= gateARuns; i++) {
    try { const r = await studioRun(); const score = scoreBenchmark(projectStudio(r), benchmark, source);
      const gate = score.dimensions.find((d) => d.dimension === "arithmetic_validity"); const grnd = score.dimensions.find((d) => d.dimension === "evidence_grounding_numeric");
      console.log(`GATE_A_RUN ${i}: ${JSON.stringify({ proposals: r.valid.length, rejected: r.rejected, themes: r.themes.length, hasNarrative: !!r.narrative, arithViolations: score.gate.arithmeticViolations, ungrounded: score.gate.ungroundedNumbers, headlines: r.valid.slice(0, 8).map((p) => p.headline) })}`);
      void gate; void grnd;
    } catch (e) { console.log(`GATE_A_RUN ${i}: ERROR ${String(e).slice(0, 160)}`); }
  }
  for (let i = 1; i <= gateBRuns; i++) {
    try { console.log(`GATE_B_RUN ${i}: ${JSON.stringify(await coreRun())}`); }
    catch (e) { console.log(`GATE_B_RUN ${i}: ERROR ${String(e).slice(0, 160)}`); }
  }
  console.log("DONE");
}
main().catch((e) => { console.error(e); process.exit(1); });
