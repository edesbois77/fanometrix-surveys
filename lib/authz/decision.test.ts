import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluate,
  compareToLegacy,
  effectiveAllow,
  type DecisionInput,
} from "./decision";

// Baseline: an authenticated, active, non-admin principal with no further gate.
const base: DecisionInput = {
  session: "present",
  principalStatus: "active",
  role: "publisher",
  isAdmin: false,
  orgStatus: "active",
  allowedRoles: undefined,
  resourceVisibility: "not_applicable",
  explicitDeny: null,
};

// ── Structural prerequisites (Default Refuse baseline) ───────────────────────

test("no session → REFUSE (no_session)", () => {
  const r = evaluate({ ...base, session: "absent" });
  assert.equal(r.decision, "REFUSE");
  assert.equal(r.provenance.reason, "no_session");
});

test("inactive principal → REFUSE, and it blocks even an admin (F011 limit / RETAIN)", () => {
  assert.equal(evaluate({ ...base, principalStatus: "inactive" }).decision, "REFUSE");
  assert.equal(evaluate({ ...base, principalStatus: "inactive", isAdmin: true, role: "admin" }).decision, "REFUSE");
});

test("organisation disabled → REFUSE for non-admin; admin exempt (mirrors current)", () => {
  assert.equal(evaluate({ ...base, orgStatus: "disabled" }).decision, "REFUSE");
  const adminOrgDisabled = evaluate({ ...base, orgStatus: "disabled", isAdmin: true, role: "admin" });
  assert.equal(adminOrgDisabled.decision, "ALLOW");
});

// ── Role allowlist ───────────────────────────────────────────────────────────

test("role not in allowlist → REFUSE (role_not_permitted); applies to admin too", () => {
  assert.equal(evaluate({ ...base, allowedRoles: ["admin"] }).decision, "REFUSE");
  // admin excluded by an allowlist that omits admin is still refused (mirrors requireUser)
  assert.equal(evaluate({ ...base, allowedRoles: ["publisher"], isAdmin: true, role: "admin" }).decision, "REFUSE");
});

test("role in allowlist proceeds", () => {
  assert.equal(evaluate({ ...base, allowedRoles: ["admin", "publisher"] }).decision, "ALLOW");
});

// ── IW-5: NO super-ALLOW (F011/F023 removed) — admin subject to DENY + resource ─

test("no super-ALLOW: admin is subject to explicit DENY (DENY precedence for all)", () => {
  const r = evaluate({ ...base, isAdmin: true, role: "admin", resourceVisibility: "visible", explicitDeny: { denied: true, reason: "readonly" } });
  assert.equal(r.decision, "REFUSE");
  assert.equal(r.provenance.decidedBy, "explicit_deny");
});

test("no super-ALLOW: admin does NOT bypass a not-visible resource", () => {
  assert.equal(evaluate({ ...base, isAdmin: true, role: "admin", resourceVisibility: "not_visible" }).decision, "REFUSE");
});

test("admin authorised for an operation via scoped admin authority (Q-27, administer≠possess)", () => {
  const r = evaluate({ ...base, isAdmin: true, role: "admin", resourceVisibility: "not_applicable", adminAuthority: { operation: "user.manage", granted: true } });
  assert.equal(r.decision, "ALLOW");
});

test("Exceptional Resource Access is a bounded ALLOW that does NOT override DENY (Q-19)", () => {
  const ok = evaluate({ ...base, isAdmin: true, role: "admin", resourceVisibility: "not_visible", exceptionalAccess: { granted: true, purpose: "support" } });
  assert.equal(ok.decision, "ALLOW");
  assert.equal(ok.provenance.decidedBy, "exceptional_access");
  const denied = evaluate({ ...base, isAdmin: true, role: "admin", resourceVisibility: "not_visible", exceptionalAccess: { granted: true }, explicitDeny: { denied: true, reason: "x" } });
  assert.equal(denied.decision, "REFUSE"); // DENY still precedes — not an override-DENY
});

// ── Explicit DENY precedence (Q-22) ──────────────────────────────────────────

test("explicit DENY overrides an otherwise-ALLOW for a non-admin", () => {
  const r = evaluate({ ...base, resourceVisibility: "visible", explicitDeny: { denied: true, reason: "created_by_admin_readonly" } });
  assert.equal(r.decision, "REFUSE");
  assert.equal(r.provenance.decidedBy, "explicit_deny");
  assert.equal(r.provenance.reason, "created_by_admin_readonly");
});

// ── Resource authorisation (Default Refuse) ──────────────────────────────────

test("resource not visible → REFUSE (resource_default_refuse)", () => {
  const r = evaluate({ ...base, resourceVisibility: "not_visible" });
  assert.equal(r.decision, "REFUSE");
  assert.equal(r.provenance.reason, "resource_default_refuse");
});

test("resource visible + prerequisites satisfied → ALLOW", () => {
  assert.equal(evaluate({ ...base, resourceVisibility: "visible" }).decision, "ALLOW");
});

// ── REFUSE vs INDETERMINATE distinction (F064 mechanism) ─────────────────────

test("an unevaluable dependency → INDETERMINATE, distinct from REFUSE", () => {
  assert.equal(evaluate({ ...base, principalStatus: "indeterminate" }).decision, "INDETERMINATE");
  assert.equal(evaluate({ ...base, orgStatus: "indeterminate" }).decision, "INDETERMINATE");
  assert.equal(evaluate({ ...base, resourceVisibility: "indeterminate" }).decision, "INDETERMINATE");
});

test("INDETERMINATE is never ALLOW (fail-closed direction preserved, F063)", () => {
  const r = evaluate({ ...base, resourceVisibility: "indeterminate", isAdmin: true, role: "admin" });
  assert.notEqual(r.decision, "ALLOW");
});

// ── Provenance recoverability (F022/F066 mechanism) ──────────────────────────

test("every decision carries recoverable provenance", () => {
  const r = evaluate({ ...base, resourceVisibility: "visible" });
  assert.ok(r.provenance.decidedBy);
  assert.ok(r.provenance.reason);
  assert.ok(Array.isArray(r.provenance.contributing) && r.provenance.contributing.length > 0);
});

// ── No manufactured state / determinism (F065) ───────────────────────────────

test("evaluate is deterministic and side-effect-free (same input → same output)", () => {
  const input = { ...base, resourceVisibility: "visible" as const };
  const a = JSON.stringify(evaluate(input));
  const b = JSON.stringify(evaluate(input));
  assert.equal(a, b);
});

// ── Shadow → enforce mechanism ───────────────────────────────────────────────

test("compareToLegacy flags divergence between seam and legacy outcome", () => {
  const allow = evaluate({ ...base, resourceVisibility: "visible" });
  assert.equal(compareToLegacy(allow, true).divergent, false);
  assert.equal(compareToLegacy(allow, false).divergent, true);
});

test("shadow mode keeps the legacy outcome authoritative; enforce uses the seam (fail-closed)", () => {
  const refuse = evaluate({ ...base, resourceVisibility: "not_visible" });
  // shadow: legacy governs
  assert.equal(effectiveAllow("shadow", refuse, true), true);
  // enforce: seam governs
  assert.equal(effectiveAllow("enforce", refuse, true), false);
  // enforce + INDETERMINATE → deny
  const indet = evaluate({ ...base, resourceVisibility: "indeterminate" });
  assert.equal(effectiveAllow("enforce", indet, true), false);
});
