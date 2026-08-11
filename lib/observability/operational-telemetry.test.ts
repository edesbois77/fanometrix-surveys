import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  organisationContextSignal,
  primaryDesignationSignal,
  recordOperationalEvent,
  redactDetail,
  setOperationalTelemetrySink,
  type OperationalEvent,
} from "./operational-telemetry";

// ── ORG-007 CF-003 (NFR-005) — operational detection & diagnosis ──────────────
// Verifies the QUALITY OUTCOME: material Organisation/Context failures (the two
// known ORG-006 incident classes) produce a diagnosable operational signal that
// identifies the affected capability/context, carries enough to distinguish the
// failure class, and NEVER leaks secrets/credentials/PII/role values. The signal
// is separate from security audit and from the authorisation response.

const captured: OperationalEvent[] = [];
beforeEach(() => { captured.length = 0; setOperationalTelemetrySink((r) => captured.push(r)); });
afterEach(() => { setOperationalTelemetrySink(null); });

const root = resolve(__dirname, "..", "..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");

// ── The login-role projection failure class ───────────────────────────────────
test("CF-03 — a resolved Current Organisation with NO contextual role is signalled (login-role projection failure)", () => {
  const sig = organisationContextSignal({
    phase: "request", userId: "u1", accessIndeterminate: false, accessSetSize: 1,
    activeOrganisationId: "org1", contextualRole: null,
  });
  assert.ok(sig, "a signal is produced");
  assert.equal(sig!.event, "organisation_context.contextual_role_missing");
  assert.equal(sig!.capability, "contextual_role_projection");
  assert.equal(sig!.reason, "no_role_binding_for_active_context");
  assert.equal(sig!.severity, "error");
  // Diagnosable: identifies the affected user and organisation/context.
  assert.equal(sig!.userId, "u1");
  assert.equal(sig!.organisationId, "org1");
});

test("CF-03 — indeterminate access source and empty access set are distinct diagnosable classes", () => {
  const indeterminate = organisationContextSignal({
    phase: "request", userId: "u1", accessIndeterminate: true, accessSetSize: 0,
    activeOrganisationId: null, contextualRole: null,
  });
  assert.equal(indeterminate!.event, "organisation_context.access_indeterminate");
  assert.equal(indeterminate!.reason, "access_source_unavailable");

  const noAccess = organisationContextSignal({
    phase: "request", userId: "u1", accessIndeterminate: false, accessSetSize: 0,
    activeOrganisationId: null, contextualRole: null,
  });
  assert.equal(noAccess!.event, "organisation_context.no_access");
  assert.equal(noAccess!.reason, "empty_access_set");
  assert.notEqual(indeterminate!.event, noAccess!.event, "the two failure classes are distinguishable");
});

test("CF-03 — the GOVERNED selection_required state is NOT signalled as a failure", () => {
  const sig = organisationContextSignal({
    phase: "request", userId: "u1", accessIndeterminate: false, accessSetSize: 2,
    activeOrganisationId: null, contextualRole: null,
  });
  assert.equal(sig, null, "multiple authorised orgs with no resolved context is normal, not a failure");
});

test("CF-03 — a healthy resolution produces no signal (hot path stays quiet)", () => {
  const sig = organisationContextSignal({
    phase: "request", userId: "u1", accessIndeterminate: false, accessSetSize: 1,
    activeOrganisationId: "org1", contextualRole: "admin",
  });
  assert.equal(sig, null);
});

// ── The Primary Organisation inconsistency class ──────────────────────────────
test("CF-03 — a Primary designation to a non-member org is signalled (Primary inconsistency)", () => {
  const sig = primaryDesignationSignal({ userId: "u1", targetOrganisationId: "orgX", activeAccessOrganisationIds: ["orgA", "orgB"] });
  assert.ok(sig);
  assert.equal(sig!.event, "primary_organisation.target_not_in_access_set");
  assert.equal(sig!.capability, "primary_organisation_designation");
  assert.equal(sig!.organisationId, "orgX");
});

test("CF-03 — a Primary designation with no active access is signalled", () => {
  const sig = primaryDesignationSignal({ userId: "u1", targetOrganisationId: "orgX", activeAccessOrganisationIds: [] });
  assert.equal(sig!.event, "primary_organisation.no_active_access");
});

test("CF-03 — a coherent Primary designation produces no signal", () => {
  const sig = primaryDesignationSignal({ userId: "u1", targetOrganisationId: "orgA", activeAccessOrganisationIds: ["orgA", "orgB"] });
  assert.equal(sig, null);
});

// ── ORG-005 least-disclosure: no secrets / PII / role values ───────────────────
test("CF-03 — redactDetail strips any sensitive-looking field and keeps safe coded facts", () => {
  const red = redactDetail({ phase: "login", accessSetSize: 2, token: "abc", email: "a@b.c", role: "admin", passwordHash: "x", authorization: "Bearer y" })!;
  assert.deepEqual(Object.keys(red).sort(), ["accessSetSize", "phase"], "only non-sensitive coded facts remain");
});

test("CF-03 — an emitted record carries capability+reason+ids and NO secret/PII/role, separate from audit/response", () => {
  const rec = recordOperationalEvent({
    event: "organisation_context.contextual_role_missing",
    capability: "contextual_role_projection",
    reason: "no_role_binding_for_active_context",
    severity: "error", userId: "u1", organisationId: "org1",
    detail: { phase: "request", token: "SECRET", email: "a@b.c", role: "admin" },
  });
  assert.equal(captured.length, 1, "emitted to the operational sink");
  const blob = JSON.stringify(rec);
  for (const forbidden of ["SECRET", "a@b.c", "\"role\"", "password", "token"]) {
    assert.ok(!blob.includes(forbidden), `record must not contain ${forbidden}`);
  }
  // Diagnostic essentials ARE present.
  assert.match(blob, /contextual_role_missing/);
  assert.match(blob, /contextual_role_projection/);
  assert.match(blob, /"userId":"u1"/);
  assert.match(blob, /"organisationId":"org1"/);
  assert.match(blob, /"domain":"organisation_context"/);
});

test("CF-03 — a throwing sink never disrupts the caller (telemetry is best-effort)", () => {
  setOperationalTelemetrySink(() => { throw new Error("sink down"); });
  assert.doesNotThrow(() => recordOperationalEvent({
    event: "e", capability: "c", reason: "r", severity: "warn",
  }));
});

// ── Call-site source-guards: the reporters are actually invoked ────────────────
test("CF-03 — requireUser emits on the indeterminate / no_access / contextual-role-missing branches", () => {
  const s = src("lib/auth-server.ts");
  assert.match(s, /import \{ reportOrganisationContext \} from "@\/lib\/observability\/operational-telemetry"/);
  // three failure branches each report before throwing
  const reports = s.match(/reportOrganisationContext\(/g) ?? [];
  assert.ok(reports.length >= 3, `expected >=3 context reports in requireUser, found ${reports.length}`);
  assert.match(s, /accessIndeterminate: true/);
  assert.match(s, /contextualRole: null[\s\S]*throw unauthorised\("No role for the active organisation context"/);
});

test("CF-03 — login route emits a role-projection signal", () => {
  const s = src("app/api/auth/login/route.ts");
  assert.match(s, /reportOrganisationContext\(\{[\s\S]*phase: "login"/);
});

test("CF-03 — setPrimaryOrganisation emits the Primary inconsistency signal", () => {
  const s = src("lib/authz/provision-access.ts");
  assert.match(s, /import \{ reportPrimaryDesignation \}/);
  assert.match(s, /reportPrimaryDesignation\(\{ userId, targetOrganisationId: organisationId/);
});
