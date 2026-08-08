import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLifecycleActions, type GovernedResourceRow } from "./resource-lifecycle";
import { organisationEntitled } from "./resource-entitlement";

// ORG-005 · G-3 (W7 / §9-D) — stale/orphaned resource identity is retired so it
// cannot remain authoritatively effective after the underlying resource is gone.

const rows: GovernedResourceRow[] = [
  { id: "gr-data-live",    resource_class: "data",   natural_key: "study-live",    status: "active" },
  { id: "gr-data-orphan",  resource_class: "data",   natural_key: "study-deleted", status: "active" },
  { id: "gr-report-live",  resource_class: "report", natural_key: "fedex-ucl-sponsorship", status: "active" },
  { id: "gr-report-gone",  resource_class: "report", natural_key: "retired-report", status: "active" },
  { id: "gr-already",      resource_class: "data",   natural_key: "study-deleted", status: "retired" },
];

test("orphaned data/report identities are retired; live ones and already-retired are left", () => {
  const { retireGovernedIds } = computeLifecycleActions(
    rows,
    new Set(["study-live"]),                 // study-deleted is absent → orphaned
    new Set(["fedex-ucl-sponsorship"]),      // retired-report absent → orphaned
  );
  assert.deepEqual(retireGovernedIds.sort(), ["gr-data-orphan", "gr-report-gone"].sort());
  assert.ok(!retireGovernedIds.includes("gr-data-live"));
  assert.ok(!retireGovernedIds.includes("gr-report-live"));
  assert.ok(!retireGovernedIds.includes("gr-already")); // status !== active → skipped
});

test("§9-D — a retired/revoked entitlement is not authoritative (organisationEntitled ignores inactive)", () => {
  const ref = { resourceClass: "data" as const, resourceId: "gr-data-orphan" };
  // active entitlement → entitled…
  assert.equal(organisationEntitled([{ organisationId: "O", resourceClass: "data", resourceId: "gr-data-orphan", active: true }], ref), true);
  // …but once revoked (active:false, mirroring status='revoked'), authority is gone.
  assert.equal(organisationEntitled([{ organisationId: "O", resourceClass: "data", resourceId: "gr-data-orphan", active: false }], ref), false);
});
