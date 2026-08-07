import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveActiveContext,
  canSwitchTo,
  compareAccessToScalar,
} from "./organisation-access";

// ── Multiplicity (Q-05): zero / one / many ───────────────────────────────────

test("zero access → no_access, null context", () => {
  const r = resolveActiveContext([], null);
  assert.equal(r.status, "no_access");
  assert.equal(r.activeOrganisationId, null);
});

test("single access → auto-resolved (single-org parity)", () => {
  const r = resolveActiveContext(["org-A"], null);
  assert.equal(r.status, "resolved");
  assert.equal(r.activeOrganisationId, "org-A");
  assert.equal(r.reason, "single_organisation");
});

test("multiple access, no remembered → selection_required, no union", () => {
  const r = resolveActiveContext(["org-A", "org-B"], null);
  assert.equal(r.status, "selection_required");
  assert.equal(r.activeOrganisationId, null); // never a union
});

// ── Remembered/preferred context must remain authorised (Q-07) ───────────────

test("remembered context is used only if still authorised", () => {
  assert.equal(resolveActiveContext(["org-A", "org-B"], "org-B").activeOrganisationId, "org-B");
});

test("remembered context that is no longer authorised is IGNORED", () => {
  const r = resolveActiveContext(["org-A", "org-B"], "org-X"); // X not authorised
  assert.equal(r.activeOrganisationId, null);
  assert.equal(r.status, "selection_required");
});

test("stale remembered with a single remaining org falls back to that org", () => {
  const r = resolveActiveContext(["org-A"], "org-X");
  assert.equal(r.activeOrganisationId, "org-A");
});

// ── Switching (Q-08): only among authorised; no carry-over ───────────────────

test("switch to an authorised org resolves to it", () => {
  const r = resolveActiveContext(["org-A", "org-B"], "org-A", "org-B");
  assert.equal(r.status, "resolved");
  assert.equal(r.activeOrganisationId, "org-B");
});

test("switch to an UNauthorised org is denied and grants NO context (no carry-over)", () => {
  const r = resolveActiveContext(["org-A", "org-B"], "org-A", "org-X");
  assert.equal(r.status, "switch_denied");
  assert.equal(r.activeOrganisationId, null);
});

test("canSwitchTo reflects the live access set", () => {
  assert.equal(canSwitchTo(["org-A", "org-B"], "org-B"), true);
  assert.equal(canSwitchTo(["org-A"], "org-B"), false);
});

// ── No permission union (Q-06) — the resolution is always one org or none ────

test("resolution is never more than one organisation", () => {
  for (const input of [[], ["a"], ["a", "b"], ["a", "b", "c"]]) {
    const r = resolveActiveContext(input as string[], null);
    assert.ok(r.activeOrganisationId === null || typeof r.activeOrganisationId === "string");
  }
});

// ── Shadow parity vs scalar organisation_id (strangler evidence) ─────────────

test("single-org access matches the scalar (parity)", () => {
  assert.equal(compareAccessToScalar("org-A", ["org-A"]).parity, true);
});

test("null scalar with empty access is parity", () => {
  assert.equal(compareAccessToScalar(null, []).parity, true);
});

test("divergence is detected (scalar vs different/absent access)", () => {
  assert.equal(compareAccessToScalar("org-A", []).parity, false);
  assert.equal(compareAccessToScalar("org-A", ["org-B"]).parity, false);
  assert.equal(compareAccessToScalar(null, ["org-A"]).parity, false);
  assert.equal(compareAccessToScalar("org-A", ["org-A", "org-B"]).parity, false);
});

// ── Identity independent of context — resolution takes no user identity ──────

test("context resolution is a pure function of access/remembered/requested (no identity)", () => {
  const a = resolveActiveContext(["org-A"], "org-A");
  const b = resolveActiveContext(["org-A"], "org-A");
  assert.deepEqual(a, b);
});
