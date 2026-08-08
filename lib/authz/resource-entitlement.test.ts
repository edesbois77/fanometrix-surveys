import { test } from "node:test";
import assert from "node:assert/strict";
import {
  organisationEntitled,
  userAuthorisedForResource,
  resolveResourceAccess,
  ownershipIsEntitlement,
  type OrgEntitlement,
  type UserAuthorisation,
  type ResourceRef,
} from "./resource-entitlement";

// ORG-005 · IW-6 — Resource Authorisation & Entitlement (Q-13–Q-19).

const report: ResourceRef = { resourceClass: "report", resourceId: "R1" };
const data: ResourceRef = { resourceClass: "data", resourceId: "R1" };

// ── Q-14 — Organisation Resource Entitlement is required ─────────────────────

test("org entitled directly to a resource of the same class", () => {
  const e: OrgEntitlement[] = [{ organisationId: "O", resourceClass: "report", resourceId: "R1" }];
  assert.equal(organisationEntitled(e, report), true);
  assert.equal(organisationEntitled([], report), false);
});

// ── Q-17 — asset independence: NO implicit inheritance across classes ────────

test("Report entitlement does NOT imply Data (Q-17 — independently protected)", () => {
  const e: OrgEntitlement[] = [{ organisationId: "O", resourceClass: "report", resourceId: "R1" }];
  assert.equal(organisationEntitled(e, report), true);
  assert.equal(organisationEntitled(e, data), false); // same id, different class → not entitled
});

// ── Q-18 — coverage-not-inheritance: a scope covers only its governed members ─

test("a Resource Scope entitlement covers exactly its members, not by containment", () => {
  const e: OrgEntitlement[] = [{ organisationId: "O", resourceClass: "report", scopeId: "project-P" }];
  const covers = (scopeId: string, ref: ResourceRef) => scopeId === "project-P" && ref.resourceId === "R1"; // R1 is a member; R2 is not
  assert.equal(organisationEntitled(e, report, covers), true);
  assert.equal(organisationEntitled(e, { resourceClass: "report", resourceId: "R2" }, covers), false);
  // with no membership decision, a scope covers nothing (never inherits)
  assert.equal(organisationEntitled(e, report), false);
});

// ── Q-15 — User Resource Authorisation NARROWS, never EXPANDS ─────────────────

test("a user is NEVER authorised beyond the organisation's entitlement (directional invariant)", () => {
  // not org-entitled: even an explicit user allow cannot grant
  const ua: UserAuthorisation[] = [{ userId: "U", resourceClass: "report", resourceId: "R1", effect: "allow" }];
  assert.equal(userAuthorisedForResource(false, report, { accessScope: "selected", userAuthorisations: ua }), false);
  assert.equal(userAuthorisedForResource(false, report, { accessScope: "organisation_wide", userAuthorisations: [] }), false);
});

test("org-wide user inherits the org entitlement; a user RESTRICT narrows it", () => {
  assert.equal(userAuthorisedForResource(true, report, { accessScope: "organisation_wide", userAuthorisations: [] }), true);
  const restrict: UserAuthorisation[] = [{ userId: "U", resourceClass: "report", resourceId: "R1", effect: "restrict" }];
  assert.equal(userAuthorisedForResource(true, report, { accessScope: "organisation_wide", userAuthorisations: restrict }), false);
});

test("selected-access user needs an explicit allow within the org entitlement", () => {
  assert.equal(userAuthorisedForResource(true, report, { accessScope: "selected", userAuthorisations: [] }), false);
  const allow: UserAuthorisation[] = [{ userId: "U", resourceClass: "report", resourceId: "R1", effect: "allow" }];
  assert.equal(userAuthorisedForResource(true, report, { accessScope: "selected", userAuthorisations: allow }), true);
});

// ── Q-13 — full resolution: org entitlement then user authorisation ──────────

test("resolveResourceAccess requires org entitlement AND user authorisation", () => {
  const e: OrgEntitlement[] = [{ organisationId: "O", resourceClass: "report", resourceId: "R1" }];
  assert.equal(resolveResourceAccess(report, { orgEntitlements: e, accessScope: "organisation_wide", userAuthorisations: [] }), true);
  assert.equal(resolveResourceAccess(data, { orgEntitlements: e, accessScope: "organisation_wide", userAuthorisations: [] }), false); // no Data entitlement
  assert.equal(resolveResourceAccess(report, { orgEntitlements: [], accessScope: "organisation_wide", userAuthorisations: [] }), false); // no org entitlement
});

// ── Q-14 / Q-19 / F027 — ownership/participation is NOT entitlement ──────────

test("ownership / operational involvement is not Organisation Resource Entitlement (policy input only)", () => {
  assert.equal(ownershipIsEntitlement(), false);
});
