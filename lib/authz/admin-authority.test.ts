import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasAdminAuthority,
  isSelfElevation,
  adminAuthorityGrantsResourceAccess,
  type AdminAuthorityGrant,
} from "./admin-authority";

// ORG-005 · IW-5 — scoped Platform Administration Authority (Q-27/Q-23/Q-25).

// ── Scoped: authority is bounded, never global-by-default ─────────────────────

test("authority permits only its own operation, in scope", () => {
  const grants: AdminAuthorityGrant[] = [{ operation: "user.manage", scope: { organisationId: "org-A" } }];
  assert.equal(hasAdminAuthority(grants, { operation: "user.manage", organisationId: "org-A" }), true);
  assert.equal(hasAdminAuthority(grants, { operation: "user.manage", organisationId: "org-B" }), false); // out of scope
  assert.equal(hasAdminAuthority(grants, { operation: "org.delete", organisationId: "org-A" }), false);   // other operation
});

test("an unscoped grant applies within the operation (still not global resource access)", () => {
  const grants: AdminAuthorityGrant[] = [{ operation: "user.manage" }];
  assert.equal(hasAdminAuthority(grants, { operation: "user.manage", organisationId: "org-A" }), true);
  assert.equal(hasAdminAuthority(grants, { operation: "user.manage", organisationId: "org-B" }), true);
});

test("a revoked/inactive authority does not apply (Q-33 currency)", () => {
  const grants: AdminAuthorityGrant[] = [{ operation: "user.manage", active: false }];
  assert.equal(hasAdminAuthority(grants, { operation: "user.manage" }), false);
});

test("no authority → refused (no super-admin; internal status confers nothing)", () => {
  assert.equal(hasAdminAuthority([], { operation: "user.manage" }), false);
});

// ── administer ≠ possess (Q-27) ──────────────────────────────────────────────

test("administration authority NEVER grants resource content access", () => {
  assert.equal(adminAuthorityGrantsResourceAccess(), false);
});

// ── No self-elevation (Q-25) ─────────────────────────────────────────────────

test("an admin cannot use authority to elevate their OWN authority/role", () => {
  assert.equal(isSelfElevation("u1", { userId: "u1", elevatesAuthorityOrRole: true }), true);   // self-elevation → blocked
  assert.equal(isSelfElevation("u1", { userId: "u2", elevatesAuthorityOrRole: true }), false);  // administering another is fine
  assert.equal(isSelfElevation("u1", { userId: "u1", elevatesAuthorityOrRole: false }), false); // self non-elevating change ok
});
