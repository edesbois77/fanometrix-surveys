// ── Benchmark 002 — freeze + deterministic blind evaluation (Stage 5R.9) ───────
// Freezes the source/overlay/Gold (immutability), enforces overlay leakage, and
// records the DETERMINISTIC Core behaviour against the pre-frozen Gold — including
// the limitations the ordinal dataset exposed. These assertions document what the
// Core ACTUALLY does; they are not tuned to a desired pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bench002Canonical } from "./source";
import { bench002OverlayCanonical } from "./overlay";
import { bench002DiscoveryInput, bench002InvalidExternalCandidates } from "./discovery";
import { runAnalysis } from "@/lib/core/pipeline/analyse";
import { FixtureGroupingProposer, FixtureSynthesisProposer } from "@/lib/core/semantic";

const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ── FREEZE: hashes recorded at authoring time, BEFORE the Core was run ──────────
const FROZEN = { source: "5ddeafb476975ba6", overlay: "37a25858c3b0f80f", gold: "767166c034f14a24" };
test("FREEZE: source / overlay / Gold hashes are immutable", () => {
  assert.equal(h(bench002Canonical()), FROZEN.source, "source changed after freeze");
  assert.equal(h(bench002OverlayCanonical()), FROZEN.overlay, "overlay changed after freeze");
  assert.equal(h(readFileSync(join(import.meta.dirname, "gold.json"), "utf8")), FROZEN.gold, "Gold changed after freeze");
});

test("LEAKAGE: no lib/core module imports Benchmark 002", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".ts") && /product-feedback-002/.test(readFileSync(p, "utf8"))) offenders.push(p); } };
  walk("lib/core");
  assert.deepEqual(offenders, []);
});

// ── DETERMINISTIC blind evaluation (model abstains → authority is deterministic) ─
function deterministicRun() {
  const SYN = { id: "syn:positive", claim: "The product scores positively on satisfaction and recommendation.", construct: "positive sentiment", questionKeys: ["q_satisfaction", "q_recommend"], componentCandidateIds: ["q_satisfaction#grouping", "q_recommend#grouping"] };
  const r = runAnalysis(bench002DiscoveryInput(), { groupingProposer: new FixtureGroupingProposer({}), synthesisProposals: [SYN], synthesisProposer: new FixtureSynthesisProposer({ "syn:positive": { formsStory: true, ambiguity: "low", rationale: [] } }), externalCandidates: bench002InvalidExternalCandidates() });
  const byId = new Map(r.outcomes.map((o) => [o.candidate.id, o]));
  return { r, byId, prio: (id: string) => byId.get(id)?.priority, state: (id: string) => byId.get(id)?.finalState };
}

// ── Stage 5R.9R repaired behaviour on the UNCHANGED frozen overlay ──────────────
test("5R.9R SAFETY-FIX — no Gold-forbidden ordinal grouping receives DERIVED authority", () => {
  const { byId, state } = deterministicRun();
  const interp = (id: string) => (byId.get(id)?.candidate.results ?? []).map((x) => x.interpretation).find(Boolean);
  // satisfied+neutral: contiguous but the frozen overlay declares no polarity →
  // entailment ABSTAINS (unable) → model abstains → held. NOT derived (was the defect).
  assert.equal(state("ext-sat-neutral"), "held_for_semantic_review");
  assert.notEqual(interp("ext-sat-neutral")?.authority, "derived");
  // very_satisfied+very_dissatisfied: non-contiguous → not_entailed → REJECTED.
  assert.equal(state("ext-top-bottom"), "rejected");
  assert.notEqual(interp("ext-top-bottom")?.authority, "derived");
});

test("5R.9R — cross-CONSTRUCT and cross-QUESTION relabels still rejected; no 'dominant blocker'", () => {
  const { state, prio } = deterministicRun();
  assert.equal(state("ext-software"), "rejected");        // connectivity+app (mns-3)
  assert.equal(state("ext-crossq"), "rejected");          // cross-question (mns-6)
  assert.equal(state("q_blocker#grouping"), "rejected");  // battery+comfort different constructs
  assert.notEqual(prio("q_blocker#dist"), "primary");     // spread, not a dominant blocker (mns-4)
});

test("5R.9R METADATA-LIMIT — frozen overlay lacks polarity, so no governed ordinal recode is DERIVED (Core abstains, safe)", () => {
  const { r, byId } = deterministicRun();
  // Without governed threshold (polarity) metadata the Core generates NO ordinal
  // threshold recode and derives none — mf-1/mf-2 recall is not restorable on the
  // FROZEN overlay (adding polarity is forbidden by the §17 freeze). This is the
  // documented limitation; the recall FIX is proven on abstract ordinal fixtures.
  for (const id of ["q_satisfaction#grouping", "q_satisfaction#topbox", "q_satisfaction#bottombox", "q_recommend#grouping", "q_recommend#topbox"]) {
    assert.equal(byId.has(id), false, `${id} should not be generated without governed polarity`);
  }
  // No DERIVED grouping reaches a headline — Primary is empty (safe, not over-derived).
  assert.deepEqual(r.hierarchy.primary.map((a) => a.findingId), []);
});
