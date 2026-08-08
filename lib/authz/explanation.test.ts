import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate, type DecisionInput } from "./decision";
import { explainForAudience, classifyReason, refuseCause } from "./explanation";

// ORG-005 · IW-8 — audience-separated explanation & operational diagnosis (Q-35).

const base: DecisionInput = {
  session: "present", principalStatus: "active", role: "publisher", isAdmin: false,
  orgStatus: "active", allowedRoles: undefined, resourceVisibility: "not_applicable", explicitDeny: null,
};

// ── D04/D05 — outcome + reason classification ────────────────────────────────

test("reason class distinguishes explicit DENY, Default Refuse, principal/context, indeterminate", () => {
  assert.equal(classifyReason(evaluate({ ...base, resourceVisibility: "visible", explicitDeny: { denied: true, reason: "ro" } })), "explicit_restriction");
  assert.equal(classifyReason(evaluate({ ...base, resourceVisibility: "not_visible" })), "resource_not_available");
  assert.equal(classifyReason(evaluate({ ...base, session: "absent" })), "principal_or_context");
  assert.equal(classifyReason(evaluate({ ...base, resourceVisibility: "indeterminate" })), "indeterminate");
  assert.equal(classifyReason(evaluate({ ...base, resourceVisibility: "visible" })), "allowed");
});

// ── D08 — explicit DENY vs Default Refuse are distinguished ──────────────────

test("DENY-caused REFUSE is distinguished from Default-Refuse REFUSE", () => {
  const deny = evaluate({ ...base, resourceVisibility: "visible", explicitDeny: { denied: true, reason: "ro" } });
  const dflt = evaluate({ ...base, resourceVisibility: "not_visible" });
  assert.equal(refuseCause(deny), "explicit_deny");
  assert.equal(refuseCause(dflt), "default_refuse");
  assert.equal(refuseCause(evaluate({ ...base, resourceVisibility: "visible" })), undefined); // ALLOW
});

// ── D02/D23/D24 — audience separation + least-disclosure ─────────────────────

test("User audience gets a coarse, existence-safe outcome with NO provenance (D10/D24)", () => {
  const refuse = evaluate({ ...base, resourceVisibility: "not_visible" });
  const u = explainForAudience(refuse, "user");
  assert.equal(u.outcome, "not_available");
  assert.equal(u.sources, undefined);          // no source provenance to the User
  assert.equal(u.reasonClass, undefined);      // no reason detail
  assert.equal(u.refuseCause, undefined);      // no DENY/Default distinction
  // ALLOW → allowed; INDETERMINATE → cannot_verify (never leaks the cause)
  assert.equal(explainForAudience(evaluate({ ...base, resourceVisibility: "visible" }), "user").outcome, "allowed");
  assert.equal(explainForAudience(evaluate({ ...base, resourceVisibility: "indeterminate" }), "user").outcome, "cannot_verify");
});

test("administrator audience gets reason class, DENY/Default distinction, and sources", () => {
  const deny = evaluate({ ...base, resourceVisibility: "visible", explicitDeny: { denied: true, reason: "ro" } });
  const a = explainForAudience(deny, "administrator");
  assert.equal(a.outcome, "REFUSE");
  assert.equal(a.reasonClass, "explicit_restriction");
  assert.equal(a.refuseCause, "explicit_deny");
  assert.ok(a.sources && a.sources.includes("explicit_deny"));
});

// ── D14 — INDETERMINATE material condition for security/operator only ────────

test("INDETERMINATE condition is exposed to security/operator, not to User", () => {
  const indet = evaluate({ ...base, principalStatus: "indeterminate" });
  assert.equal(explainForAudience(indet, "operator").indeterminateCondition, "dependency_unevaluable");
  assert.equal(explainForAudience(indet, "security").indeterminateCondition, "dependency_unevaluable");
  assert.equal(explainForAudience(indet, "administrator").indeterminateCondition, undefined);
  assert.equal(explainForAudience(indet, "user").outcome, "cannot_verify");
});

// ── D22 — fidelity: explanation derived from the actual result (no reconstruction) ─

test("explanation is a pure function of the result (fidelity, deterministic)", () => {
  const r = evaluate({ ...base, resourceVisibility: "visible" });
  assert.deepEqual(explainForAudience(r, "administrator"), explainForAudience(r, "administrator"));
});

// ── D01 — explanation is NOT an authority source ─────────────────────────────

test("no authorisation path imports the explanation module (D01)", () => {
  for (const f of ["decision.ts", "organisation-access.ts", "role-profile.ts", "product-access.ts", "admin-authority.ts", "exceptional-access.ts"]) {
    const src = readFileSync(resolve(__dirname, f), "utf8");
    assert.doesNotMatch(src, /\.\/explanation|authz\/explanation/, `${f} must not consume explanation`);
  }
  const access = readFileSync(resolve(__dirname, "..", "access.ts"), "utf8");
  assert.doesNotMatch(access, /authz\/explanation/);
  // the explanation module itself reads no live state / does no I/O
  const expl = readFileSync(resolve(__dirname, "explanation.ts"), "utf8");
  assert.doesNotMatch(expl, /supabaseAdmin|from\("|await /);
});
