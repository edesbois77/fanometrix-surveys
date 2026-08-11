import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveActiveContext, canSwitchTo } from "./organisation-access";

// ── ORG-006 WP-01 (IS-01) — VO-01 Multi-Organisation Organisation Context ──────
// Verifies the governed 0/1/many Organisation Context contract. The resolution
// core (resolveActiveContext / canSwitchTo) is asserted directly; the request- and
// route-level wiring is asserted against the source it lives in (a lightweight
// guard that the governed behaviour is present and not regressed). DB-touching
// provisioning behaviour (VO-01-H) is covered in wp01-provisioning.test.ts.

const root = resolve(__dirname, "..", "..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");

// VO-01-A — Zero Organisations → no valid context; nothing manufactured.
test("VO-01-A — zero accessible organisations → no_access, null Current Organisation", () => {
  const r = resolveActiveContext([], null);
  assert.equal(r.status, "no_access");
  assert.equal(r.activeOrganisationId, null);
  // requireUser fails CLOSED (403) on no_access — never manufactures a context.
  const auth = src("lib/auth-server.ts");
  assert.match(auth, /if \(!ctx\.activeOrganisationId\) throw unauthorised\("No active organisation context", 403\); \/\/ no_access/);
  // Indeterminate access source also fails closed (403), never fabricated.
  assert.match(auth, /if \(accessSet === null\) throw unauthorised\("No active organisation context", 403\);/);
});

// VO-01-B — Exactly one Organisation → auto-resolved, no selection required.
test("VO-01-B — single accessible organisation auto-resolves as Current, no selection", () => {
  const r = resolveActiveContext(["org-A"], null);
  assert.equal(r.status, "resolved");
  assert.equal(r.activeOrganisationId, "org-A");
  assert.equal(r.reason, "single_organisation");
});

// VO-01-C — Multiple + valid remembered → remembered restored as Current.
test("VO-01-C — multiple accessible with still-authorised remembered restores it", () => {
  const r = resolveActiveContext(["org-A", "org-B"], "org-B");
  assert.equal(r.status, "resolved");
  assert.equal(r.activeOrganisationId, "org-B");
});

// VO-01-D — Multiple + no valid remembered → governed selection_required (NOT a
// generic access failure), surfaced distinctly and exposed to the client.
test("VO-01-D — multiple accessible without valid remembered → selection_required (distinct)", () => {
  assert.equal(resolveActiveContext(["org-A", "org-B"], null).status, "selection_required");
  assert.equal(resolveActiveContext(["org-A", "org-B"], "org-X").status, "selection_required"); // stale remembered ignored
  assert.equal(resolveActiveContext(["org-A", "org-B"], null).activeOrganisationId, null); // never a union

  const auth = src("lib/auth-server.ts");
  // requireUser surfaces selection_required DISTINCTLY (not collapsed to 403)…
  assert.match(auth, /if \(ctx\.status === "selection_required"\) throw selectionRequired\(\);/);
  // …as a machine-readable 409 signal so the client can drive selection.
  assert.match(auth, /code: "organisation_selection_required"[\s\S]*status: 409/);
  // The authoritative Accessible Organisation Set is exposed to the client.
  assert.match(auth, /export async function resolveOrganisationContextView/);
  const me = src("app/api/auth/me/route.ts");
  assert.match(me, /organisationContext/);
  assert.match(me, /resolveOrganisationContextView/);
});

// VO-01-E — Authorised switching succeeds and changes Current Organisation.
test("VO-01-E — switch to an authorised organisation resolves to it", () => {
  const r = resolveActiveContext(["org-A", "org-B"], "org-A", "org-B");
  assert.equal(r.status, "resolved");
  assert.equal(r.activeOrganisationId, "org-B");
  assert.equal(canSwitchTo(["org-A", "org-B"], "org-B"), true);
});

// VO-01-F — Unauthorised switching fails closed (no carry-over).
test("VO-01-F — switch to an organisation outside the Accessible Set fails closed", () => {
  const r = resolveActiveContext(["org-A", "org-B"], "org-A", "org-X");
  assert.equal(r.status, "switch_denied");
  assert.equal(r.activeOrganisationId, null); // previous context does NOT carry
  assert.equal(canSwitchTo(["org-A", "org-B"], "org-X"), false);
  // The switch route rejects an unauthorised target (403) and fails closed (503)
  // when the access source is unavailable.
  const route = src("app/api/auth/active-organisation/route.ts");
  assert.match(route, /if \(!canSwitchTo\(access, target\)\)[\s\S]*status: 403/);
  assert.match(route, /if \(access === null\)[\s\S]*status: 503/);
});

// VO-01-G — Switching does NOT create/revoke/mutate user_organisation_access.
test("VO-01-G — switching changes only remembered/Current context, never access", () => {
  const route = src("app/api/auth/active-organisation/route.ts");
  // The ONLY mutation is to users.remembered_organisation_id …
  assert.match(route, /\.update\(\{ remembered_organisation_id: target \}\)/);
  // … it never writes/updates/deletes user_organisation_access.
  assert.doesNotMatch(route, /from\("user_organisation_access"\)[\s\S]*\.(update|upsert|insert|delete)\(/);
  // Authenticated by identity only (so a selection_required user can select).
  assert.match(route, /requireIdentity/);
});

// VO-01-I — Organisation-scoped operation uses exactly ONE Current Organisation;
// resolution is never a permission/data union across the Accessible Set.
test("VO-01-I — resolution is always exactly one organisation or none (no union)", () => {
  for (const input of [[], ["a"], ["a", "b"], ["a", "b", "c"]]) {
    const r = resolveActiveContext(input as string[], null);
    assert.ok(r.activeOrganisationId === null || typeof r.activeOrganisationId === "string");
  }
  // requireUser returns a single organisationId (AuthedUser is single-org).
  const auth = src("lib/auth-server.ts");
  assert.match(auth, /const organisationId = ctx\.activeOrganisationId;/);
  assert.match(auth, /organisationId,\n/); // returned as a single scalar
});

// VO-01-J — Existing single-Organisation behaviour remains operational.
test("VO-01-J — single-organisation path is unchanged (auto-select parity)", () => {
  const r = resolveActiveContext(["org-A"], null);
  assert.equal(r.activeOrganisationId, "org-A");
  // remembered that is still the only authorised org resolves to it.
  assert.equal(resolveActiveContext(["org-A"], "org-A").activeOrganisationId, "org-A");
  // A stale remembered with a single remaining org still falls back to that org.
  assert.equal(resolveActiveContext(["org-A"], "org-X").activeOrganisationId, "org-A");
});
