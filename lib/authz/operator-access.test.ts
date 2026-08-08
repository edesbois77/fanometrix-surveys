import { test } from "node:test";
import assert from "node:assert/strict";
import { operatorGrantsDomain, adminResourceVisibility, type OperatorEntitlement } from "./operator-access";
import { hasAdminAuthority, adminAuthorityGrantsResourceAccess } from "./admin-authority";
import { evaluateExceptionalAccess } from "./exceptional-access";
import type { OperatorResourceDomain } from "./admin-operations";

// ORG-005 · G-2 — the replacement authority model: three independent axes,
// no super-ALLOW. These lock the governing distinctions BEFORE any cut-over.

const ent = (d: OperatorResourceDomain): OperatorEntitlement => ({ subjectUserId: "op", resourceDomain: d, active: true });

test("standing entitlement grants routine resource access for its domain only", () => {
  const domains = new Set<OperatorResourceDomain>(["study", "data"]);
  assert.equal(adminResourceVisibility(domains, "study"), "all");
  assert.equal(adminResourceVisibility(domains, "data"), "all");
  assert.equal(adminResourceVisibility(domains, "report"), "none"); // not granted → Default Refuse
});

test("resource visibility is NOT role-inferred — no entitlement ⇒ none (not a super-ALLOW)", () => {
  assert.equal(adminResourceVisibility(new Set(), "study"), "none");
  assert.equal(operatorGrantsDomain([], "study"), false);
  assert.equal(operatorGrantsDomain([{ ...ent("study"), active: false }], "study"), false); // revoked ⇒ gone
});

test("administer ≠ possess — holding admin authority grants NO resource access", () => {
  // An operator with a manage authority but NO standing entitlement sees nothing.
  const authorities = [{ operation: "research_project.manage", scope: { organisationId: null } }];
  assert.equal(hasAdminAuthority(authorities, { operation: "research_project.manage" }), true); // may administer
  assert.equal(adminResourceVisibility(new Set(), "study"), "none");                             // but not possess
  assert.equal(adminAuthorityGrantsResourceAccess(), false);
});

test("independence (reverse) — a standing entitlement confers NO administrative-operation authority", () => {
  assert.equal(adminResourceVisibility(new Set<OperatorResourceDomain>(["study"]), "study"), "all"); // may access
  assert.equal(hasAdminAuthority([], { operation: "research_project.manage" }), false);              // may NOT administer
});

test("Exceptional Resource Access stays bounded/invoked/time-boxed break-glass — never routine", () => {
  const base = { principalUserId: "op", eligible: true, invoked: true, purpose: "incident-123", resourceType: "study", resourceId: "S1", operation: "read", expiresAt: 1000 } as const;
  const req = { principalUserId: "op", resourceType: "study", resourceId: "S1", operation: "read", now: 500 };
  assert.equal(evaluateExceptionalAccess({ ...base }, req).granted, true);                    // valid break-glass
  assert.equal(evaluateExceptionalAccess({ ...base, invoked: false }, req).granted, false);   // must be invoked
  assert.equal(evaluateExceptionalAccess({ ...base }, { ...req, now: 2000 }).granted, false); // time-boxed (expired)
  assert.equal(evaluateExceptionalAccess({ ...base, resourceId: "S2" }, req).granted, false); // bounded
});
