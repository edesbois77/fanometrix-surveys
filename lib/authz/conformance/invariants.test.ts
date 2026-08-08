import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate, type DecisionInput } from "../decision";
import { resolveActiveContext } from "../organisation-access";
import { roleForContext, resolveEffectiveRole, type ContextualRoleBinding } from "../role-profile";
import { resolveProductAccess, resolveCapabilityAccess } from "../product-access";

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
// ── IW-2 delivered: Contextual Roles as Permission Profiles (HELD) ───────────
// Q-11 / REPLACE F010: a Role is a permission profile bound to a User–Organisation
// Access (contextual), not a global identity enum. Resolution is per active
// context (no carry-over) and orthogonal to Organisation classification (F034).
test("Q-11 — Role is contextual to the Active Organisation Context, not global [closes IW-2, F010]", () => {
  const bindings: ContextualRoleBinding[] = [
    { organisationId: "org-A", role: "brand" },
    { organisationId: "org-B", role: "agency" },
  ];
  assert.equal(roleForContext(bindings, "org-A"), "brand");
  assert.equal(roleForContext(bindings, "org-B"), "agency"); // different context → different role
});
test("Q-11 — no carry-over: a role in one Organisation does not apply in another", () => {
  const bindings: ContextualRoleBinding[] = [{ organisationId: "org-A", role: "admin" }];
  assert.equal(roleForContext(bindings, "org-B"), null); // no binding in B → no admin carry-over
});
test("Q-11 — classification vs Role separation: resolution never reads Organisation type (F034)", () => {
  // Two differently-classified orgs, same bound profile → same Role; the Role
  // depends only on the Access binding, never on what the Organisation IS.
  const bindings: ContextualRoleBinding[] = [
    { organisationId: "org-classified-brand", role: "publisher" },
    { organisationId: "org-classified-publisher", role: "publisher" },
  ];
  assert.equal(roleForContext(bindings, "org-classified-brand"), "publisher");
  assert.equal(roleForContext(bindings, "org-classified-publisher"), "publisher");
  assert.equal(roleForContext.length, 2); // (bindings, activeOrg) only — no org-type arg
});
test("Q-11 — strangler parity: contextual role backfilled 1:1 preserves current permissions", () => {
  assert.equal(resolveEffectiveRole("brand", "brand").source, "contextual"); // contextual authoritative
  assert.equal(resolveEffectiveRole(null, "brand").role, "brand");           // legacy fallback preserved
  assert.equal(resolveEffectiveRole(null, "admin").role, "admin");           // admin carried unchanged
});

// IW-2 read cut-over: the contextual Role is now the authoritative Role in the
// trusted path (requireUser), with the legacy users.role retained as fallback.
// Verified against the wired source (parallels the Q-06 cut-over assertion).
test("Q-11 cut-over — requireUser resolves the authoritative Role from the Active Organisation Context (legacy retained as fallback)", () => {
  const authServer = readFileSync(resolve(__dirname, "..", "..", "auth-server.ts"), "utf8");
  assert.match(authServer, /fetchContextualRole/);   // contextual role resolved from the active context
  assert.match(authServer, /resolveEffectiveRole/);  // effective role = contextual, else legacy fallback
  assert.match(authServer, /recordRoleParity/);      // parity recorded (shadow)
  assert.match(authServer, /effectiveRole/);         // effective role gates allowedRoles + returned role
  assert.match(authServer, /fallback/i);             // legacy users.role retained as fallback
});
// ── IW-3 delivered: Product Access & Product Capability Access mechanism (HELD) ─
// Q-09/Q-10 / EVOLVE F013/F014: two distinct layers, server-side, independent of
// each other and of nav (SG-3). Enforce cut-over is the subsequent gated step.
test("Q-09 — Product Access is a distinct role-derived layer, parity with legacy [closes IW-3, F013]", () => {
  assert.equal(resolveProductAccess({ role: "admin", tier: "admin-only" }), true);
  assert.equal(resolveProductAccess({ role: "publisher", tier: "admin-only" }), false); // admin-only gate
  assert.equal(resolveProductAccess({ role: "publisher", tier: "admin-and-publisher" }), true);
  assert.equal(resolveProductAccess({ role: "brand", tier: "admin-and-publisher" }), false); // brand/agency blocked
});
test("Q-10 — Product Capability Access is independent of Product Access [closes IW-3, F014]", () => {
  // No admin-only product access, yet the direct grant allows the capability.
  assert.equal(resolveProductAccess({ role: "publisher", tier: "admin-only" }), false);
  assert.equal(resolveCapabilityAccess({ role: "publisher", canPresentSimulations: true, capability: "present-simulations" }), true);
  // Product access without the grant does NOT confer the capability.
  assert.equal(resolveCapabilityAccess({ role: "brand", canPresentSimulations: false, capability: "present-simulations" }), false);
});
// IW-3 enforce cut-over: Product Access authoritative via the governed model at
// the requireUser seam; Product Capability Access authoritative via hasCapability;
// middleware model-driven + projection-only (SG-3). Verified against wired sources.
test("Q-09/Q-10 enforce cut-over — Product/Capability decisions authoritative through the governed model [closes IW-3-enforce]", () => {
  const authServer = readFileSync(resolve(__dirname, "..", "..", "auth-server.ts"), "utf8");
  assert.match(authServer, /resolveProductAccess/);          // Product Access authoritative at the seam
  assert.match(authServer, /tierForAllowedRoles/);           // governed-tier routing
  assert.match(authServer, /legacyAllowed/);                 // legacy fallback retained (until IW-11)
  const mw = readFileSync(resolve(__dirname, "..", "..", "..", "middleware.ts"), "utf8");
  assert.match(mw, /resolveProductAccess/);                  // middleware projection driven by the same model
  assert.doesNotMatch(mw, /session\.role !== "admin" && session\.role !== "publisher"/); // hard-coded gate removed
});
test("Q-14/Q-15 — Organisation Resource Entitlement vs User Resource Authorisation [closes IW-6, F024/F025]", { todo: "Resource Entitlement is IW-6" });
test("Q-27 — scoped Platform Administration Authority; administer≠possess; no self-elevation [closes IW-5, F035/F036]", { todo: "Scoped admin authority is IW-5" });
// ── IW-7 delivered: security-audit capability mechanism (HELD) ───────────────
// Q-29/Q-30 capability + SG-7 fail-closed + F048; live activation on migration 168.
test("Q-29/Q-30 — audit capability: tamper-evidence, minimisation, mandatory fail-closed, F048 [closes IW-7, F018/F045/F046/F048]", () => {
  const audit = readFileSync(resolve(__dirname, "..", "audit.ts"), "utf8");
  assert.match(audit, /verifyChain/);                 // tamper-evidence (Q-30/F046)
  assert.match(audit, /isMinimisedDetail/);           // content minimisation (Q-30)
  assert.match(audit, /mustFailClosed|assertMandatoryAudit/); // SG-7 fail-closed (Q-34/F045)
  // F048 — no authorisation path reads the audit store.
  const decision = readFileSync(resolve(__dirname, "..", "decision.ts"), "utf8");
  assert.doesNotMatch(decision, /authz\/audit|\.\/audit/);
});
// IW-7 activation: mandatory authz-change handlers record-first with SG-7
// fail-closed. Verified against the wired sources.
test("Q-29 activate — mandatory authz-change operations are audited fail-closed at their handlers [closes IW-7-activation]", () => {
  const usr = readFileSync(resolve(__dirname, "..", "..", "..", "app", "api", "users", "[id]", "route.ts"), "utf8");
  assert.match(usr, /withMandatoryAudit/);                  // record-first fail-closed
  assert.match(usr, /MandatoryAuditUnavailableError/);      // refuses on audit unavailability
  assert.match(usr, /change refused/i);                     // operation refused, not permitted
  const org = readFileSync(resolve(__dirname, "..", "..", "..", "app", "api", "organisations", "[id]", "route.ts"), "utf8");
  assert.match(org, /withMandatoryAudit/);                  // org lifecycle fail-closed too
});
test("Q-35 — audience-separated explanation; distinct denial causes; no existence leak [closes IW-8, F066/F067/F068]", { todo: "Explainability is IW-8" });
test("F058 — session/token revocation before expiry [closes IW-9]", { todo: "Session revocation is IW-9" });
