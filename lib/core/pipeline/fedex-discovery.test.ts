// Stage 4 — the critical exam: discover the FedEx stories from SOURCE (no Gold
// candidates supplied), and refuse the invalid constructions. Deterministic +
// fixture semantic judges; no live AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runAnalysis } from "./analyse";
import { fedexDiscoveryInput, fedexPipelineOptions } from "./fedex-discovery";

const { outcomes } = runAnalysis(fedexDiscoveryInput(), fedexPipelineOptions());
const byId = new Map(outcomes.map((o) => [o.candidate.id, o]));

test("MUST-FIND recall: the five Gold concepts are discovered from source", () => {
  // mf-1 relevance foundation = the approved q_fit grouping; mf-2 = q_offer lead;
  // mf-3 = q_help distribution; mf-4 = the value/access synthesis; mf-5 = the
  // q_fit distribution (states of recognition).
  for (const id of ["q_fit#grouping", "q_offer#lead", "q_help#dist", "synthesis:value-access", "q_fit#dist"]) {
    const o = byId.get(id);
    assert.ok(o, `missing candidate ${id}`);
    assert.notEqual(o!.finalState, "rejected", `${id} should not be rejected`);
  }
});

test("the 64.6 grouping is proposed from the data, model-approved, but held at Contextual by the provisional-authority ceiling (Stage 5R.1)", () => {
  const o = byId.get("q_fit#grouping")!;
  // Model approval ALONE = PROVISIONAL Construct Authority (Standard v1.2 §44):
  // a legitimate-looking grouping cannot become a headline on model judgement
  // alone. It is retained (not rejected/suppressed) and capped at Contextual
  // until an independent-validation route (DERIVED, later 5R batches) exists.
  assert.equal(o.finalState, "promoted");
  // Authority lives on the Result's interpretation (Stage 5R.2): decision approved,
  // authority provisional, provenance model_proposed → ranking caps at Contextual.
  const interp = o.candidate.results!.find((r) => r.interpretation)!.interpretation!;
  assert.equal(interp.decision, "approved");
  assert.equal(interp.authority, "provisional");
  assert.equal(interp.provenance, "model_proposed");
  assert.equal(o.priority, "contextual");
  assert.ok(o.candidate.construct && /relevance/i.test(o.candidate.construct));
  // It was PROPOSED by the generator (deterministic), not supplied as an answer.
  assert.equal(o.candidate.provenance.generator, "top2-grouping-proposal");
});

test("the invalid 55.8 relabel never surfaces (model abstains → held; no governed metadata to derive it)", () => {
  const o = byId.get("ext-55")!;
  // With no governed semantics, entailment is unable_to_establish; the model
  // abstains on the 'visibility problem' relabel → held, never a Finding. (A
  // wrong model proposal would instead be PROVISIONAL/Contextual — also not surfaced.)
  assert.ok(["held_for_semantic_review", "rejected"].includes(o.finalState));
  assert.ok(!["primary", "secondary"].includes(o.priority ?? ""));
});

test("the invalid 69.3 cross-question sum never survives", () => {
  const o = byId.get("ext-69")!;
  assert.equal(o.finalState, "rejected");
});

test("no PROMOTED candidate combines percentages across questions", () => {
  for (const o of outcomes) {
    if (o.finalState !== "promoted") continue;
    for (const r of o.candidate.results ?? []) {
      if (!r.grouping) continue;
      const qs = new Set(o.candidate.evidence.map((e) => e.question?.canonicalKey));
      assert.ok(qs.size <= 1, `${o.candidate.id} promoted a cross-question grouping`);
    }
  }
});

test("final hierarchy under the Stage 5R.1 authority ceiling", () => {
  const prio = (id: string) => byId.get(id)!.priority;
  // mf-1's grouping is model-approved only → PROVISIONAL → Contextual (5R.1). The
  // simple descriptive leader (mf-2) is unaffected and remains the headline; the
  // synthesis is unchanged (5R.1 touches groupings only).
  assert.equal(prio("q_fit#grouping"), "contextual");        // mf-1 grouping — provisional-capped
  assert.equal(prio("q_offer#lead"), "primary");             // mf-2 — no novel construct, unaffected
  assert.equal(prio("q_help#dist"), "secondary");            // mf-3
  assert.equal(prio("synthesis:value-access"), "secondary"); // mf-4 (synthesis constraint, unchanged)
  assert.equal(prio("q_fit#dist"), "contextual");            // mf-5
});

// ── Benchmark leakage proof ──────────────────────────────────────────────────
test("candidate-generation modules have NO benchmark / FedEx dependency", () => {
  const files = [
    "lib/core/candidates/generate.ts", "lib/core/candidates/types.ts",
    "lib/core/semantic/grouping.ts", "lib/core/semantic/synthesis.ts",
    "lib/core/disconfirmation/assess.ts", "lib/core/pipeline/analyse.ts",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/intelligence-evals|benchmarks\/fedex|FEDEX_SOURCE|fedex/i.test(src), `${f} must not depend on the benchmark`);
  }
});
