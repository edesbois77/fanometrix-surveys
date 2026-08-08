import { test } from "node:test";
import assert from "node:assert/strict";
import { organisationEntitled, resolveResourceAccess, type ResourceRef } from "./resource-entitlement";

// ORG-005 · §38 — Resource Scope semantics (coverage-not-inheritance, Q-18) and
// asset independence (Q-17) exercised through the accepted pure resolver with an
// EXPLICIT membership fact (the shape the W6 DB resolver supplies via scopeCovers).

// An explicit membership set — the ONLY things a scope covers. No hierarchy.
const MEMBERS = new Set(["study-A", "study-B"]);
const scopeCovers = (scopeId: string, ref: ResourceRef) =>
  scopeId === "scope-1" && ref.resourceClass === "study" && MEMBERS.has(ref.resourceId);

const scopeEnt = [{ organisationId: "O", resourceClass: "study" as const, scopeId: "scope-1" }];

test("Q-18 — a scope covers exactly its explicit members, nothing else", () => {
  assert.equal(organisationEntitled(scopeEnt, { resourceClass: "study", resourceId: "study-A" }, scopeCovers), true);
  assert.equal(organisationEntitled(scopeEnt, { resourceClass: "study", resourceId: "study-B" }, scopeCovers), true);
  // a non-member of the same class is NOT covered (no "everything contained")
  assert.equal(organisationEntitled(scopeEnt, { resourceClass: "study", resourceId: "study-Z" }, scopeCovers), false);
});

test("Q-17 — asset independence: a study-class scope never covers another class", () => {
  // same id, different class → not covered (Report/Data/Finding are independent)
  assert.equal(organisationEntitled(scopeEnt, { resourceClass: "data", resourceId: "study-A" }, scopeCovers), false);
  assert.equal(organisationEntitled(scopeEnt, { resourceClass: "finding", resourceId: "study-A" }, scopeCovers), false);
});

test("Q-16/Q-36-D06 — no implicit propagation: a direct Study entitlement grants none of its other-class resources", () => {
  const direct = [{ organisationId: "O", resourceClass: "study" as const, resourceId: "study-A" }];
  assert.equal(organisationEntitled(direct, { resourceClass: "study", resourceId: "study-A" }), true);
  assert.equal(organisationEntitled(direct, { resourceClass: "data", resourceId: "study-A" }), false);   // Data is separate (§9-B)
  assert.equal(organisationEntitled(direct, { resourceClass: "report", resourceId: "study-A" }), false);
  assert.equal(organisationEntitled(direct, { resourceClass: "finding", resourceId: "study-A" }), false);
});

test("Option 1 — per-participant Data scope: a publisher covers only its OWN campaigns, never a co-publisher's", () => {
  // Data is per-Campaign (resource_id = campaign PK). A publisher's Data scope
  // holds only its own campaigns within a shared multi-publisher Study.
  const fotmobOwn = new Set(["camp-fotmob-cocacola"]); // NOT the LiveScore/Flashscore campaigns
  const dataScopeCovers = (scopeId: string, ref: ResourceRef) =>
    scopeId === "data-fotmob" && ref.resourceClass === "data" && fotmobOwn.has(ref.resourceId);
  const fotmobDataEnt = [{ organisationId: "FotMob", resourceClass: "data" as const, scopeId: "data-fotmob" }];

  // own campaign in the shared Study → covered (preserved)
  assert.equal(organisationEntitled(fotmobDataEnt, { resourceClass: "data", resourceId: "camp-fotmob-cocacola" }, dataScopeCovers), true);
  // co-publishers' campaigns in the SAME Study → NOT covered (no cross-publisher exposure)
  assert.equal(organisationEntitled(fotmobDataEnt, { resourceClass: "data", resourceId: "camp-livescore-cocacola" }, dataScopeCovers), false);
  assert.equal(organisationEntitled(fotmobDataEnt, { resourceClass: "data", resourceId: "camp-flashscore-cocacola" }, dataScopeCovers), false);
});

test("Q-15 — over a scope, User Authorisation narrows but never expands", () => {
  // org entitled to the scope; a user RESTRICT on a member narrows it away
  assert.equal(resolveResourceAccess({ resourceClass: "study", resourceId: "study-A" }, {
    orgEntitlements: scopeEnt, accessScope: "organisation_wide",
    userAuthorisations: [{ userId: "U", resourceClass: "study", scopeId: "scope-1", effect: "restrict" }],
    scopeCovers,
  }), false);
  // a user ALLOW cannot reach a resource outside the org's scope entitlement
  assert.equal(resolveResourceAccess({ resourceClass: "study", resourceId: "study-Z" }, {
    orgEntitlements: scopeEnt, accessScope: "selected",
    userAuthorisations: [{ userId: "U", resourceClass: "study", resourceId: "study-Z", effect: "allow" }],
    scopeCovers,
  }), false);
});
