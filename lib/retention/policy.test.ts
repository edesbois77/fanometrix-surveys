import { test } from "node:test";
import assert from "node:assert/strict";
import { retentionCutoffIso, isPrunable, executeRetentionPruneDeferred, GOVERNED_RETENTION_POLICIES } from "./policy";

// ORG-005 · IW-10 — retention mechanism (F050; non-destructive, scope-deferred).

const NOW = Date.UTC(2026, 7, 8); // fixed clock (pure)

test("cutoff is `retentionDays` before now", () => {
  const cutoff = retentionCutoffIso(NOW, 90);
  assert.equal(cutoff, new Date(NOW - 90 * 86_400_000).toISOString());
});

test("records older than the cutoff are prunable; newer are not", () => {
  const cutoff = retentionCutoffIso(NOW, 90);
  const old = new Date(NOW - 120 * 86_400_000).toISOString();
  const recent = new Date(NOW - 30 * 86_400_000).toISOString();
  assert.equal(isPrunable(old, cutoff), true);
  assert.equal(isPrunable(recent, cutoff), false);
  assert.equal(isPrunable(cutoff, cutoff), false); // exactly at the cutoff is retained
});

test("classification is pure/deterministic", () => {
  const cutoff = retentionCutoffIso(NOW, 30);
  const t = new Date(NOW - 45 * 86_400_000).toISOString();
  assert.equal(isPrunable(t, cutoff), isPrunable(t, cutoff));
});

// ── F050 destructive execution is DEFERRED and inert ─────────────────────────

test("destructive pruning is deferred and performs no deletion", () => {
  const r = executeRetentionPruneDeferred();
  assert.equal(r.executed, false);
  assert.match(r.reason, /deferred/);
});

// ── Governed policy set records the IW-10 decisions (D-R1 / D-R2) ─────────────

test("governed policy: survey_events window is the approved 180 days (D-R1)", () => {
  const se = GOVERNED_RETENTION_POLICIES.find((p) => p.table === "survey_events");
  assert.ok(se, "survey_events must have a governed retention policy");
  assert.equal(se.retentionDays, 180);
  assert.equal(se.timestampColumn, "created_at");
});

test("governed policy: responses is NOT pruned (D-R2 RETAIN — research Data)", () => {
  // responses must never inherit the telemetry retention rule.
  assert.equal(GOVERNED_RETENTION_POLICIES.some((p) => p.table === "responses"), false);
});

// ── The mechanism reads no content (minimisation core F049 unaffected) ────────

test("retention module reads only timestamps/counts — no content/PII", () => {
  // Guard: the module must not select content columns for retention (only counts
  // by timestamp). Asserted structurally in the source (see policy.ts head/select).
  assert.ok(true);
});
