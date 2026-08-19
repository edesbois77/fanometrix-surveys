// ── Stage 6 — Core product read: flag gating + failure isolation (mock.module) ─
// Run with the repo flag: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mutable supabaseAdmin stub returning the survey's latest completed run snapshot.
type Row = Record<string, unknown>;
let latestRun: Row | null = null;
let throwOnQuery = false;
function makeChain() {
  const chain: Record<string, unknown> = {
    select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
    async maybeSingle() { if (throwOnQuery) throw new Error("db down"); return { data: latestRun, error: null }; },
  };
  return chain;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: () => makeChain() } } });

let mod: typeof import("./core-intelligence");
before(async () => { mod = await import("./core-intelligence"); });
beforeEach(() => { latestRun = null; throwOnQuery = false; });


// A governed-ordinal snapshot in the persisted evidence_snapshot shape.
const GOVERNED_SNAPSHOT = {
  study: { id: "S", objective: "o" },
  evidence: [
    { canonicalQuestionKey: "q1", question: "How satisfied?", scope: "combined", optionId: "1", optionLabel: "Very satisfied", count: 90, base: 200, scaleType: "ordinal", constructKey: "satisfaction", ordinalPosition: 4, polarity: "positive" },
    { canonicalQuestionKey: "q1", question: "How satisfied?", scope: "combined", optionId: "2", optionLabel: "Satisfied", count: 70, base: 200, scaleType: "ordinal", constructKey: "satisfaction", ordinalPosition: 3, polarity: "positive" },
    { canonicalQuestionKey: "q1", question: "How satisfied?", scope: "combined", optionId: "3", optionLabel: "Dissatisfied", count: 25, base: 200, scaleType: "ordinal", constructKey: "satisfaction", ordinalPosition: 2, polarity: "negative" },
    { canonicalQuestionKey: "q1", question: "How satisfied?", scope: "combined", optionId: "4", optionLabel: "Very dissatisfied", count: 15, base: 200, scaleType: "ordinal", constructKey: "satisfaction", ordinalPosition: 1, polarity: "negative" },
  ],
};

test("§E coreProductReadEnabled: OFF by default; only 'true'/'1' enable", () => {
  assert.equal(mod.coreProductReadEnabled({}), false);
  assert.equal(mod.coreProductReadEnabled({ ANALYTICAL_CORE_PRODUCT_READ_ENABLED: "false" }), false);
  assert.equal(mod.coreProductReadEnabled({ ANALYTICAL_CORE_PRODUCT_READ_ENABLED: "true" }), true);
  assert.equal(mod.coreProductReadEnabled({ ANALYTICAL_CORE_PRODUCT_READ_ENABLED: "1" }), true);
});

test("§A/§B coreReadVisibleFor: internal admins always see it; others gated by the flag", () => {
  assert.equal(mod.coreReadVisibleFor({ role: "admin" }, {}), true, "admin always (internal rollout), flag off");
  assert.equal(mod.coreReadVisibleFor({ role: "publisher" }, {}), false, "ordinary user OFF by default");
  assert.equal(mod.coreReadVisibleFor({ role: "publisher" }, { ANALYTICAL_CORE_PRODUCT_READ_ENABLED: "true" }), true, "flag ON → ordinary user sees it");
});

test("§E not-enabled → getSurveyCoreIntelligence is a no-op (null), Core never consulted", async () => {
  latestRun = { id: "R1", evidence_snapshot: GOVERNED_SNAPSHOT };
  assert.equal(await mod.getSurveyCoreIntelligence("SV", false), null);
});

test("§F flag ON + governed run → projected Core findings (with a governed key finding)", async () => {
  latestRun = { id: "R1", evidence_snapshot: GOVERNED_SNAPSHOT };
  const p = await mod.getSurveyCoreIntelligence("SV", true);
  assert.ok(p, "projection returned");
  assert.ok(p!.findings.some((f) => f.basis === "governed"), "a governed finding present");
});

test("§D/§F Core failure (DB throws) → null (product falls back), never throws", async () => {
  throwOnQuery = true;
  await assert.doesNotReject(async () => {
    assert.equal(await mod.getSurveyCoreIntelligence("SV", true), null);
  });
});

test("§C no completed run / empty snapshot → null (safe)", async () => {
  latestRun = null;
  assert.equal(await mod.getSurveyCoreIntelligence("SV", true), null);
  latestRun = { id: "R1", evidence_snapshot: { study: {}, evidence: [] } };
  assert.equal(await mod.getSurveyCoreIntelligence("SV", true), null);
});
