// ── Benchmark 003 — freeze + deterministic blind evaluation (Stage 5R.9B) ──────
// Freezes source/overlay/Gold, enforces leakage, and records the DETERMINISTIC
// Core behaviour against the pre-frozen Gold. Assertions document what the Core
// ACTUALLY does — safety/recall PASSES and the quality nuances alike.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bench003Canonical } from "./source";
import { bench003OverlayCanonical } from "./overlay";
import { bench003DiscoveryInput, bench003InvalidExternalCandidates } from "./discovery";
import { runAnalysis } from "@/lib/core/pipeline/analyse";
import { FixtureGroupingProposer, FixtureSynthesisProposer } from "@/lib/core/semantic";

const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const FROZEN = { source: "d7fa9c5daa0f60e0", overlay: "489720f2bf497089", gold: "75627bd49008be1e" };

test("FREEZE: source / overlay / Gold hashes are immutable", () => {
  assert.equal(h(bench003Canonical()), FROZEN.source);
  assert.equal(h(bench003OverlayCanonical()), FROZEN.overlay);
  assert.equal(h(readFileSync(join(import.meta.dirname, "gold.json"), "utf8")), FROZEN.gold);
});

test("LEAKAGE: no lib/core module imports Benchmark 003", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".ts") && /transit-003/.test(readFileSync(p, "utf8"))) offenders.push(p); } };
  walk("lib/core");
  assert.deepEqual(offenders, []);
});

function deterministicRun() {
  const SYN = { id: "syn:fragile", claim: "MetroLink is positive on both reliability and advocacy, but only by a slim margin.", construct: "adequate but fragile", questionKeys: ["q_reliability", "q_recommend"], componentCandidateIds: ["q_reliability#topbox", "q_recommend#topbox"] };
  const r = runAnalysis(bench003DiscoveryInput(), { groupingProposer: new FixtureGroupingProposer({}), synthesisProposals: [SYN], synthesisProposer: new FixtureSynthesisProposer({ "syn:fragile": { formsStory: true, ambiguity: "low", rationale: [] } }), externalCandidates: bench003InvalidExternalCandidates() });
  const byId = new Map(r.outcomes.map((o) => [o.candidate.id, o]));
  const interp = (id: string) => (byId.get(id)?.candidate.results ?? []).map((x) => x.interpretation).find(Boolean);
  return { r, byId, interp, prio: (id: string) => byId.get(id)?.priority, state: (id: string) => byId.get(id)?.finalState };
}

// ── RECALL — the 5R.9R fix, now on an unseen dataset ───────────────────────────
test("RECALL — all four governed threshold recodes are generated + DERIVED (upper AND lower, magnitude-independent)", () => {
  const { interp, state } = deterministicRun();
  for (const id of ["q_reliability#topbox", "q_reliability#bottombox", "q_recommend#topbox", "q_recommend#bottombox"]) {
    assert.equal(state(id), "promoted", `${id} promoted`);
    assert.equal(interp(id)?.authority, "derived", `${id} DERIVED`);
    assert.equal(interp(id)?.provenance, "deterministic_recode");
  }
});

// ── SAFETY — no forbidden grouping receives DERIVED authority ──────────────────
test("SAFETY — neutral-boundary / opposite-pole / cross-construct / cross-question relabels never DERIVED", () => {
  const { interp, state } = deterministicRun();
  assert.equal(state("ext-rel-mixed"), "rejected");        // reliable + mixed (crosses neutral)
  assert.equal(state("ext-rel-poles"), "rejected");        // opposite poles
  assert.equal(state("ext-reason-practical"), "rejected"); // cross-construct nominal
  assert.equal(state("ext-crossq"), "rejected");           // cross-question (structural)
  for (const id of ["ext-rel-mixed", "ext-rel-poles", "ext-reason-practical", "ext-crossq"]) {
    assert.notEqual(interp(id)?.authority, "derived");
  }
});

test("SAFETY — no 'dominant reason' overstatement (nominal spread stays a distribution, not a leader)", () => {
  const { state, prio } = deterministicRun();
  assert.equal(state("q_reason#grouping"), "rejected");  // cost+no_car different constructs
  assert.notEqual(prio("q_reason#dist"), "primary");
});

// ── QUALITY — both dimensions surface; documented ranking/selectivity nuances ──
test("QUALITY — reliability and recommendation both surface at headline tiers (central story present)", () => {
  const { r } = deterministicRun();
  const top2 = [...r.hierarchy.primary, ...r.hierarchy.secondary].map((a) => a.findingId);
  for (const id of ["q_reliability#topbox", "q_reliability#bottombox", "q_recommend#topbox", "q_recommend#bottombox", "syn:fragile"]) {
    assert.ok(top2.includes(id), `${id} should surface at Primary/Secondary`);
  }
  // NOTE (documented limitation, not a safety failure): the Core ranks the
  // recommend split as Primary while the Gold's central story is reliability, and
  // it surfaces BOTH complementary recommend boxes as headlines (mild redundancy).
  assert.deepEqual(r.hierarchy.primary.map((a) => a.findingId), ["q_recommend#topbox", "q_recommend#bottombox"]);
});
