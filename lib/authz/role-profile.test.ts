import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roleForContext,
  resolveEffectiveRole,
  roleParity,
  isKnownProfile,
  KNOWN_PROFILES,
  type ContextualRoleBinding,
} from "./role-profile";

// ORG-005 · IW-2 — Contextual Roles as Permission Profiles (Q-11; REPLACE F010).

// ── Contextual resolution: role bound to the Active Organisation Context ──────

test("resolves the Role bound to the active context", () => {
  const bindings: ContextualRoleBinding[] = [
    { organisationId: "org-A", role: "brand" },
    { organisationId: "org-B", role: "agency" },
  ];
  assert.equal(roleForContext(bindings, "org-A"), "brand");
  assert.equal(roleForContext(bindings, "org-B"), "agency");
});

test("no carry-over: a role in one org NEVER applies in another (Q-11/Q-06)", () => {
  const bindings: ContextualRoleBinding[] = [{ organisationId: "org-A", role: "admin" }];
  // Active context is org-B, where the user has NO binding → null (not org-A's admin).
  assert.equal(roleForContext(bindings, "org-B"), null);
});

test("null active context yields no contextual role", () => {
  const bindings: ContextualRoleBinding[] = [{ organisationId: "org-A", role: "brand" }];
  assert.equal(roleForContext(bindings, null), null);
});

test("empty bindings yield no contextual role", () => {
  assert.equal(roleForContext([], "org-A"), null);
});

test("resolution never unions roles across contexts (returns one role or null)", () => {
  const bindings: ContextualRoleBinding[] = [
    { organisationId: "org-A", role: "brand" },
    { organisationId: "org-B", role: "publisher" },
  ];
  for (const ctx of ["org-A", "org-B", "org-X", null] as (string | null)[]) {
    const r = roleForContext(bindings, ctx);
    assert.ok(r === null || KNOWN_PROFILES.includes(r));
  }
});

// ── Classification vs Role separation (Q-11 / F034 must never regress) ────────
// The Role axis is orthogonal to Organisation classification/type. Resolution
// takes Access bindings and NEVER reads organisation type, so a role is never
// derived from what the Organisation IS.

test("Role is independent of Organisation classification — same role token across differently-classified orgs", () => {
  // Two orgs with (hypothetically) different classifications, same profile bound.
  const bindings: ContextualRoleBinding[] = [
    { organisationId: "org-classified-as-brand", role: "publisher" },
    { organisationId: "org-classified-as-publisher", role: "publisher" },
  ];
  // The resolved Role depends ONLY on the binding, not on any classification.
  assert.equal(roleForContext(bindings, "org-classified-as-brand"), "publisher");
  assert.equal(roleForContext(bindings, "org-classified-as-publisher"), "publisher");
});

test("Role is independent of Organisation classification — different roles within same classification", () => {
  const bindings: ContextualRoleBinding[] = [
    { organisationId: "org-1", role: "brand" },
    { organisationId: "org-2", role: "agency" },
  ];
  assert.notEqual(roleForContext(bindings, "org-1"), roleForContext(bindings, "org-2"));
});

test("roleForContext signature carries no organisation classification/type input", () => {
  // Guard: the resolver takes (bindings, activeOrganisationId) — exactly 2 args,
  // neither an organisation classification. A future edit that threads org type
  // in would change arity and trip this.
  assert.equal(roleForContext.length, 2);
});

// ── Effective role during the strangler migration (contextual, else legacy) ───

test("prefers the contextual role when present", () => {
  const r = resolveEffectiveRole("agency", "brand");
  assert.equal(r.role, "agency");
  assert.equal(r.source, "contextual");
});

test("falls back to the legacy role when no contextual role (deploy-before-migration safe)", () => {
  const r = resolveEffectiveRole(null, "brand");
  assert.equal(r.role, "brand");
  assert.equal(r.source, "legacy_fallback");
});

test("admin profile carried through unchanged (no new admin semantics in IW-2)", () => {
  assert.equal(resolveEffectiveRole("admin", "admin").role, "admin");
  assert.equal(resolveEffectiveRole(null, "admin").role, "admin"); // legacy admin preserved
});

// ── Shadow parity (strangler evidence) ───────────────────────────────────────

test("contextual role matching legacy is parity", () => {
  assert.equal(roleParity("brand", "brand").parity, true);
});

test("null contextual role is NOT a divergence (it is the safe fallback path)", () => {
  const r = roleParity(null, "brand");
  assert.equal(r.parity, true);
  assert.equal(r.detail, "no_contextual_role_fallback_to_legacy");
});

test("a present-but-different contextual role is a divergence to record", () => {
  const r = roleParity("agency", "brand");
  assert.equal(r.parity, false);
  assert.equal(r.detail, "contextual_vs_legacy_mismatch");
});

// ── Profile catalogue guards ─────────────────────────────────────────────────

test("known profiles mirror the legacy role tokens 1:1 (identity-preserving backfill)", () => {
  assert.deepEqual([...KNOWN_PROFILES].sort(), ["admin", "agency", "brand", "publisher"]);
});

test("isKnownProfile rejects unknown / null values (fail-closed on read)", () => {
  assert.equal(isKnownProfile("brand"), true);
  assert.equal(isKnownProfile("superuser"), false);
  assert.equal(isKnownProfile(null), false);
  assert.equal(isKnownProfile(undefined), false);
  assert.equal(isKnownProfile(""), false);
});

// ── Purity ───────────────────────────────────────────────────────────────────

test("resolution is a pure function of its inputs", () => {
  const bindings: ContextualRoleBinding[] = [{ organisationId: "org-A", role: "brand" }];
  assert.deepEqual(roleForContext(bindings, "org-A"), roleForContext(bindings, "org-A"));
  assert.deepEqual(resolveEffectiveRole("brand", "agency"), resolveEffectiveRole("brand", "agency"));
});
