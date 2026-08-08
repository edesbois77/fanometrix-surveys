import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExceptionalAccess,
  exceptionalAccessEstablishes,
  type ExceptionalAccessGrant,
} from "./exceptional-access";

// ORG-005 · IW-5 — Exceptional Resource Access (Q-19).

const T = 1_000_000;
const grant = (over: Partial<ExceptionalAccessGrant> = {}): ExceptionalAccessGrant => ({
  principalUserId: "u1", eligible: true, invoked: true, purpose: "support-case-123",
  resourceType: "report", resourceId: "r1", operation: "read", expiresAt: T + 1000, ...over,
});
const req = (over: Partial<Parameters<typeof evaluateExceptionalAccess>[1]> = {}) => ({
  principalUserId: "u1", resourceType: "report", resourceId: "r1", operation: "read", now: T, ...over,
});

// ── Grants only when EVERY governed requirement holds ────────────────────────

test("granted for the same principal, eligible, invoked, purposeful, bounded, unexpired", () => {
  const d = evaluateExceptionalAccess(grant(), req());
  assert.equal(d.granted, true);
  if (d.granted) assert.equal(d.purpose, "support-case-123");
});

test("refused when not explicitly invoked (no ambient exceptional access)", () => {
  assert.equal(evaluateExceptionalAccess(grant({ invoked: false }), req()).granted, false);
});

test("refused without explicit privileged eligibility", () => {
  assert.equal(evaluateExceptionalAccess(grant({ eligible: false }), req()).granted, false);
});

test("refused without an identifiable purpose", () => {
  assert.equal(evaluateExceptionalAccess(grant({ purpose: null }), req()).granted, false);
});

test("refused out of bounds (different resource / operation / type)", () => {
  assert.equal(evaluateExceptionalAccess(grant(), req({ resourceId: "r2" })).granted, false);
  assert.equal(evaluateExceptionalAccess(grant(), req({ operation: "write" })).granted, false);
  assert.equal(evaluateExceptionalAccess(grant(), req({ resourceType: "data" })).granted, false);
});

test("refused for a different principal (bound to the actual authenticated user)", () => {
  assert.equal(evaluateExceptionalAccess(grant(), req({ principalUserId: "u2" })).granted, false);
});

test("time-boxed — refused once expired", () => {
  assert.equal(evaluateExceptionalAccess(grant({ expiresAt: T }), req({ now: T })).granted, false);      // at expiry
  assert.equal(evaluateExceptionalAccess(grant({ expiresAt: T - 1 }), req({ now: T })).granted, false);  // past expiry
});

test("a bounded Resource Scope grant matches by scopeId", () => {
  const g = grant({ resourceId: null, scopeId: "project-9" });
  assert.equal(evaluateExceptionalAccess(g, req({ resourceId: null, scopeId: "project-9" })).granted, true);
  assert.equal(evaluateExceptionalAccess(g, req({ resourceId: null, scopeId: "project-8" })).granted, false);
});

// ── Establishes no durable context (§21) ─────────────────────────────────────

test("Exceptional Resource Access creates no durable access/context", () => {
  assert.equal(exceptionalAccessEstablishes.userOrganisationAccess(), false);
  assert.equal(exceptionalAccessEstablishes.productAccess(), false);
  assert.equal(exceptionalAccessEstablishes.organisationResourceEntitlement(), false);
  assert.equal(exceptionalAccessEstablishes.activeOrganisationContext(), false);
});
