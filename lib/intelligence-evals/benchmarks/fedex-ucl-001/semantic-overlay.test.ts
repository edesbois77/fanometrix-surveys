// ── Stage 5R.8 — deterministic overlay verification + leakage guard ────────────
// The authoritative FedEx grouping outcomes are DETERMINISTIC under the governed
// overlay: they do not depend on the (unstable) semantic model. Proven here with a
// model that ABSTAINS on everything — if the outcomes are correct with no useful
// model, model instability cannot change them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runAnalysis } from "@/lib/core/pipeline/analyse";
import { FixtureGroupingProposer, FixtureSynthesisProposer } from "@/lib/core/semantic";
import { fedexDiscoveryInput, invalidExternalCandidates } from "@/lib/core/pipeline/fedex-discovery";
import { applyFedexSemanticOverlay } from "./semantic-overlay";

const SYNTH = { id: "synthesis:value-access", claim: "Across both activation questions fans favour value or access.", construct: "value and access", questionKeys: ["q_offer", "q_help"], componentCandidateIds: ["q_offer#lead", "q_help#dist"] };

function runWithAbstainingModel() {
  const di = applyFedexSemanticOverlay(fedexDiscoveryInput());
  // Model abstains on ALL groupings/syntheses → any authoritative outcome is
  // purely from deterministic governed entailment.
  const result = runAnalysis(di, { groupingProposer: new FixtureGroupingProposer({}), synthesisProposals: [SYNTH], synthesisProposer: new FixtureSynthesisProposer({}), externalCandidates: invalidExternalCandidates() });
  const byId = new Map(result.outcomes.map((o) => [o.candidate.id, o]));
  const interp = (id: string) => (byId.get(id)?.candidate.results ?? []).map((r) => r.interpretation).find(Boolean);
  return { byId, interp, result };
}

test("overlay: the relevance recode (64.6) is DERIVED deterministically — with NO model", () => {
  const { byId, interp } = runWithAbstainingModel();
  const i = interp("q_fit#grouping");
  assert.equal(i?.authority, "derived");                 // governed same-construct union
  assert.equal(i?.provenance, "deterministic_recode");
  assert.equal(byId.get("q_fit#grouping")?.finalState, "promoted");
  assert.notEqual(byId.get("q_fit#grouping")?.priority, "suppressed");
});

test("overlay: the invalid 55.8 relabel is deterministically REJECTED (cross-construct) — model irrelevant", () => {
  const { byId, interp } = runWithAbstainingModel();
  assert.equal(byId.get("ext-55")?.finalState, "rejected");
  assert.equal(interp("ext-55")?.decision, "rejected");
  assert.equal(interp("ext-55")?.derivation?.method, "entailment_rejected");
});

test("overlay: the invalid 69.3 cross-question sum is rejected structurally (never reaches semantics)", () => {
  const { byId } = runWithAbstainingModel();
  assert.equal(byId.get("ext-69")?.finalState, "rejected");
});

test("overlay: q_offer / q_help top-2 groupings are cross-construct → not surfaced", () => {
  const { byId } = runWithAbstainingModel();
  for (const id of ["q_offer#grouping", "q_help#grouping"]) {
    const st = byId.get(id)?.finalState;
    if (st) assert.ok(["rejected", "held_for_semantic_review"].includes(st), `${id} must not surface (${st})`);
  }
});

// ── Overlay must contain source semantics only — NO Gold conclusions ────────────
test("the overlay encodes no Gold answers (no MUST-FIND/MUST-NOT-SAY/valid-invalid flags/percentages)", () => {
  const src = readFileSync(join(import.meta.dirname, "semantic-overlay.ts"), "utf8");
  const codeOnly = src.replace(/\/\/[^\n]*/g, ""); // strip comments (justification prose may mention 64.6/55.8)
  for (const re of [/\b64\.6\b/, /\b55\.8\b/, /\b69\.3\b/, /must_find/i, /must_not_say/i, /forbidden/i, /\bis[_ ]?valid\b/i, /\bis[_ ]?invalid\b/i, /hierarchy/i, /primary|secondary/i]) {
    assert.equal(re.test(codeOnly), false, `overlay code must not encode a conclusion (${re})`);
  }
});

// ── Leakage: no production Core module imports the eval overlay ─────────────────
test("no lib/core module imports the FedEx semantic overlay (the eval-only overlay stays eval-only)", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && /semantic-overlay/.test(readFileSync(p, "utf8"))) offenders.push(p);
    }
  };
  walk("lib/core");
  assert.deepEqual(offenders, [], `lib/core must not reference the FedEx semantic overlay: ${offenders.join(", ")}`);
});
