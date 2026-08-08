import { test } from "node:test";
import assert from "node:assert/strict";
import { composeOrdinary, type PermissionContribution } from "./decision";

// ORG-005 · IW-4 — ordinary permission composition engine (Q-20/Q-21/Q-22).

const A = (source: PermissionContribution["source"], reason = "r"): PermissionContribution => ({ source, effect: "ALLOW", reason });
const D = (source: PermissionContribution["source"], reason = "deny"): PermissionContribution => ({ source, effect: "DENY", reason });

// ── Default Refuse (Q-22 rule 4) ─────────────────────────────────────────────

test("no contributions → Default Refuse", () => {
  const r = composeOrdinary([]);
  assert.equal(r.decision, "REFUSE");
  assert.equal(r.provenance.reason, "default_refuse");
});

test("only NO_EFFECT contributions → Default Refuse", () => {
  const r = composeOrdinary([{ source: "resource", effect: "NO_EFFECT", reason: "resource_default_refuse" }]);
  assert.equal(r.decision, "REFUSE");
  assert.equal(r.provenance.decidedBy, "resource");
  assert.equal(r.provenance.reason, "resource_default_refuse");
});

// ── At least one sufficient ALLOW, NO inherent source priority (Q-22 rule 3) ──

test("a single ALLOW from any source suffices", () => {
  for (const s of ["direct" as const, "role" as const, "policy" as const, "resource" as const]) {
    // direct is not a declared Source; use the declared ones.
    if (s === "direct") continue;
    assert.equal(composeOrdinary([A(s)]).decision, "ALLOW");
  }
});

test("no source outranks another — role and policy ALLOW are equally sufficient", () => {
  assert.equal(composeOrdinary([A("role")]).decision, "ALLOW");
  assert.equal(composeOrdinary([A("policy")]).decision, "ALLOW");
  // order does not matter (no first-match beyond DENY precedence)
  assert.equal(composeOrdinary([A("policy"), A("role")]).decision, "ALLOW");
  assert.equal(composeOrdinary([A("role"), A("policy")]).decision, "ALLOW");
});

// ── Explicit DENY precedence (Q-22 rule 2) ───────────────────────────────────

test("explicit DENY overrides ordinary ALLOW regardless of order", () => {
  assert.equal(composeOrdinary([A("role"), D("explicit_deny")]).decision, "REFUSE");
  assert.equal(composeOrdinary([D("explicit_deny"), A("policy")]).decision, "REFUSE");
});

test("DENY reason + source are preserved in provenance", () => {
  const r = composeOrdinary([A("role"), D("explicit_deny", "readonly")]);
  assert.equal(r.provenance.decidedBy, "explicit_deny");
  assert.equal(r.provenance.reason, "readonly");
  assert.deepEqual(r.provenance.denySources, ["explicit_deny"]);
  assert.deepEqual(r.provenance.allowSources, []); // a refused decision establishes no ALLOW
});

// ── Multiple-source ALLOW provenance (Q-35-D06/D07) ──────────────────────────

test("provenance preserves EVERY independently-applicable ALLOW source", () => {
  const r = composeOrdinary([A("role"), A("policy"), A("resource")]);
  assert.equal(r.decision, "ALLOW");
  assert.deepEqual([...(r.provenance.allowSources ?? [])].sort(), ["policy", "resource", "role"]);
  // Removing one ALLOW source would still leave the others — the explainability
  // property that a first-match model cannot provide (Q-35-D07).
});

// ── IW-5: NO super-ALLOW — DENY precedence applies to every source ────────────

test("no super-ALLOW: a former admin_override ALLOW no longer outranks DENY", () => {
  const r = composeOrdinary([{ source: "admin_override", effect: "ALLOW", reason: "x" }, D("explicit_deny")]);
  assert.equal(r.decision, "REFUSE"); // DENY precedence applies to all
});

test("scoped admin authority + exceptional access are ordinary ALLOWs subject to DENY", () => {
  assert.equal(composeOrdinary([A("admin_authority")]).decision, "ALLOW");
  assert.equal(composeOrdinary([A("exceptional_access")]).decision, "ALLOW");
  assert.equal(composeOrdinary([A("admin_authority"), D("explicit_deny")]).decision, "REFUSE");
  assert.equal(composeOrdinary([A("exceptional_access"), D("explicit_deny")]).decision, "REFUSE");
});

// ── Purity ───────────────────────────────────────────────────────────────────

test("composition is pure and deterministic", () => {
  const c: PermissionContribution[] = [A("role"), D("explicit_deny")];
  assert.equal(JSON.stringify(composeOrdinary(c)), JSON.stringify(composeOrdinary(c)));
});
