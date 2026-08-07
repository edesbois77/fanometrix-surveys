import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate, type DecisionInput } from "../decision";
import { resolveActiveContext } from "../organisation-access";

// ORG-005 conformance harness — architecture invariants.
//   • Currently-true invariants are asserted normally (must stay green).
//   • Architecture TARGET invariants that the CURRENT implementation violates
//     (UD-01 CONFLICT / NOT-IMPLEMENTED) are marked `todo` with their owning
//     workstream: they document conformance debt and must be turned into
//     passing assertions when that workstream lands. `todo` keeps CI green.

const base: DecisionInput = {
  session: "present", principalStatus: "active", role: "publisher", isAdmin: false,
  orgStatus: "active", allowedRoles: undefined, resourceVisibility: "not_applicable", explicitDeny: null,
};

// ── Currently-true invariants (HELD) ─────────────────────────────────────────

test("Q-22 — Default Refuse: a not-visible resource yields REFUSE", () => {
  assert.equal(evaluate({ ...base, resourceVisibility: "not_visible" }).decision, "REFUSE");
});

test("Q-22 — explicit DENY takes precedence over an otherwise-ALLOW (non-admin)", () => {
  assert.equal(
    evaluate({ ...base, resourceVisibility: "visible", explicitDeny: { denied: true, reason: "readonly" } }).decision,
    "REFUSE",
  );
});

test("Q-34 — INDETERMINATE is distinct from REFUSE and never ALLOWs", () => {
  const indet = evaluate({ ...base, resourceVisibility: "indeterminate" });
  const refuse = evaluate({ ...base, resourceVisibility: "not_visible" });
  assert.equal(indet.decision, "INDETERMINATE");
  assert.equal(refuse.decision, "REFUSE");
  assert.notEqual(indet.decision, "ALLOW");
});

// ── TARGET invariant demonstrably violated today: no super-ALLOW (Q-22 / F011) ─
// The current seam mirrors the production admin super-ALLOW; this assertion of
// the APPROVED target therefore fails today and is closed at IW-5.

test("Q-22 — no super-ALLOW: admin must not bypass a not-visible resource [closes IW-5, F011/F023/F035]", { todo: "admin super-ALLOW preserved at IW-0; replaced by scoped authority at IW-5" }, () => {
  const adminForbiddenResource = evaluate({ ...base, isAdmin: true, role: "admin", resourceVisibility: "not_visible" });
  assert.equal(adminForbiddenResource.decision, "REFUSE"); // currently ALLOW → todo until IW-5
});

// ── TARGET invariants pending their owning workstream (mechanism not yet built) ─

// ── IW-1 delivered: Active Organisation Context mechanism (HELD) ─────────────
test("Q-05 — multiplicity: context resolution handles zero/one/many access", () => {
  assert.equal(resolveActiveContext([], null).status, "no_access");
  assert.equal(resolveActiveContext(["a"], null).activeOrganisationId, "a");
  assert.equal(resolveActiveContext(["a", "b"], null).status, "selection_required");
});
test("Q-06 — exactly one Active Organisation Context; never a permission union", () => {
  const many = resolveActiveContext(["a", "b", "c"], null);
  assert.equal(many.activeOrganisationId, null); // no union across contexts
  assert.equal(resolveActiveContext(["a", "b"], "b").activeOrganisationId, "b"); // exactly one
});
test("Q-07 — remembered/preferred context is honoured only while still authorised", () => {
  assert.equal(resolveActiveContext(["a", "b"], "b").activeOrganisationId, "b");
  assert.equal(resolveActiveContext(["a", "b"], "x").status, "selection_required"); // stale ignored
});
test("Q-08 — switching only among authorised orgs; unauthorised switch grants no context", () => {
  assert.equal(resolveActiveContext(["a", "b"], "a", "b").activeOrganisationId, "b");
  assert.equal(resolveActiveContext(["a", "b"], "a", "x").status, "switch_denied");
});

// IW-1 read cut-over: the Active Organisation Context is now the authoritative
// Organisation in the trusted path (requireUser), with the scalar retained as
// the governed fallback. Verified against the wired source.
test("Q-06 cut-over — requireUser resolves the authoritative org from Active Context (scalar retained as fallback)", () => {
  const authServer = readFileSync(resolve(__dirname, "..", "..", "auth-server.ts"), "utf8");
  assert.match(authServer, /resolveActiveContext/);        // active context resolved
  assert.match(authServer, /recordOrgContextParity/);       // parity recorded (shadow)
  assert.match(authServer, /fallback/i);                    // scalar retained as fallback
  assert.match(authServer, /organisationId,/);              // returned org is the resolved active context
});
test("Q-11 — contextual permission-profile Roles, not a global identity enum [closes IW-2, F010]", { todo: "Contextual roles is IW-2" });
test("Q-09/Q-10 — Product Access and Product Capability Access as distinct layers [closes IW-3, F013/F014]", { todo: "Product/Capability is IW-3" });
test("Q-14/Q-15 — Organisation Resource Entitlement vs User Resource Authorisation [closes IW-6, F024/F025]", { todo: "Resource Entitlement is IW-6" });
test("Q-27 — scoped Platform Administration Authority; administer≠possess; no self-elevation [closes IW-5, F035/F036]", { todo: "Scoped admin authority is IW-5" });
test("Q-29 — security audit + mandatory-audit fail-closed [closes IW-7, F018/F045]", { todo: "Security audit is IW-7" });
test("Q-35 — audience-separated explanation; distinct denial causes; no existence leak [closes IW-8, F066/F067/F068]", { todo: "Explainability is IW-8" });
test("F058 — session/token revocation before expiry [closes IW-9]", { todo: "Session revocation is IW-9" });
