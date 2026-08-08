import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLifecycleActions, computeStaleDataMembers, type GovernedResourceRow } from "./resource-lifecycle";
import { organisationEntitled } from "./resource-entitlement";

// ORG-005 · G-3 (W7 / §9-D) — stale/orphaned resource identity/membership is
// retired/pruned so it cannot remain authoritatively effective once the underlying
// resource is gone. Report is registry-addressed; Study/Finding/Data are PK-addressed.

const rows: GovernedResourceRow[] = [
  { id: "gr-report-live",  resource_class: "report", natural_key: "fedex-ucl-sponsorship", status: "active" },
  { id: "gr-report-gone",  resource_class: "report", natural_key: "retired-report", status: "active" },
  { id: "gr-report-old",   resource_class: "report", natural_key: "retired-report", status: "retired" },
];

test("orphaned Report identities are retired; live and already-retired are left", () => {
  const { retireGovernedIds } = computeLifecycleActions(rows, new Set(["fedex-ucl-sponsorship"]));
  assert.deepEqual(retireGovernedIds, ["gr-report-gone"]);
  assert.ok(!retireGovernedIds.includes("gr-report-live"));
  assert.ok(!retireGovernedIds.includes("gr-report-old")); // status !== active → skipped
});

test("§9-D — per-Campaign Data scope members whose campaign is deleted are pruned", () => {
  const members = ["camp-live-1", "camp-deleted", "camp-live-2"];
  assert.deepEqual(computeStaleDataMembers(members, new Set(["camp-live-1", "camp-live-2"])), ["camp-deleted"]);
  assert.deepEqual(computeStaleDataMembers(members, new Set(["camp-live-1", "camp-deleted", "camp-live-2"])), []);
});

test("§9-D — a revoked entitlement is not authoritative (organisationEntitled ignores inactive)", () => {
  const ref = { resourceClass: "study" as const, resourceId: "study-X" };
  assert.equal(organisationEntitled([{ organisationId: "O", resourceClass: "study", resourceId: "study-X", active: true }], ref), true);
  // once revoked (active:false, mirroring status='revoked'), authority is gone.
  assert.equal(organisationEntitled([{ organisationId: "O", resourceClass: "study", resourceId: "study-X", active: false }], ref), false);
});
