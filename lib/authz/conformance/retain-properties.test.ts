import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate, type DecisionInput } from "../decision";

// ORG-005 conformance harness — UD-01 RETAIN properties that must NEVER regress.
// Where a property is a decision-core behaviour it is asserted directly; where
// it is an architectural invariant of an existing module it is asserted against
// that module's source (a lightweight guard that the property remains true).

const root = resolve(__dirname, "..", "..", "..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");

const base: DecisionInput = {
  session: "present", principalStatus: "active", role: "publisher", isAdmin: false,
  orgStatus: "active", allowedRoles: undefined, resourceVisibility: "not_applicable", explicitDeny: null,
};

// F063 — fail-closed everywhere; no fail-open / last-known-good.
test("F063 — INDETERMINATE and absent-session never ALLOW", () => {
  assert.notEqual(evaluate({ ...base, session: "absent" }).decision, "ALLOW");
  assert.notEqual(evaluate({ ...base, principalStatus: "indeterminate" }).decision, "ALLOW");
});

test("F063 — lib/access.ts no fail-open; admin super-ALLOW REMOVED at G-2 (operator governed by standing entitlement)", () => {
  const access = src("lib/access.ts");
  // ORG-005 G-2: the unconditional `role === "admin" → null` super-ALLOW is GONE.
  assert.doesNotMatch(access, /if \(user\.role === "admin"\) return null;/);
  // Admin/operator resource visibility now flows through the governed, entitlement-
  // based resolver (revocable, DENY-subordinate) — never an unconditional role bypass.
  assert.match(access, /if \(user\.role === "admin"\) return operatorVisibleResourceIds\(user, resourceType\);/);
  assert.match(access, /if \(user\.role === "admin"\) return operatorVisibleDataCampaignIds\(user\);/);
});

// F065 — failures manufacture no state; the seam is pure/deterministic.
test("F065 — evaluate is deterministic and returns without side effects", () => {
  const i = { ...base, resourceVisibility: "not_visible" as const };
  assert.deepEqual(evaluate(i), evaluate(i));
});

// F003 — live authority: requireUser re-fetches the live users row each request.
test("F003 — requireUser re-selects live user/org state (no token trust)", () => {
  const authServer = src("lib/auth-server.ts");
  assert.match(authServer, /\.from\("users"\)/);
  assert.match(authServer, /status !== "active"/);
});

// F001 — identity-only token: role/forcePasswordChange are non-authoritative hints.
test("F001 — JWT is identity-only (non-authoritative role hint documented)", () => {
  const auth = src("lib/auth.ts");
  assert.match(auth, /non-authoritative/i);
});

// F017 — app-layer authoritative; service role bypasses RLS by design.
test("F017 — service-role client documented as the app-layer enforcement path", () => {
  const admin = src("lib/supabase-admin.ts");
  assert.match(admin, /service role/i);
});

// F057 — revocation immediate: the seam consumes freshly-resolved inputs (no cache field).
test("F057 — decision seam holds no cached authority (stateless module)", () => {
  const decision = src("lib/authz/decision.ts");
  // No module-level mutable authority cache.
  assert.doesNotMatch(decision, /let\s+_?cache/i);
});

// F034 — Organisation Relationship never an access source.
test("F034 — relationships module states it grants no platform permission", () => {
  const rel = src("lib/organisations/relationships.ts");
  assert.match(rel, /grant[s]? NO platform permission/i);
});

// F048 — permission never reconstructed from audit; access path reads live tables only.
test("F048 — lib/access.ts reads no audit/history/activity table", () => {
  const access = src("lib/access.ts");
  assert.doesNotMatch(access, /audit|_history|activity|revision|survey_events/i);
});

// F049 — minimisation: the seam introduces no domain-data duplication (references only).
test("F049 — decision seam stores no organisation/user domain data (inputs only)", () => {
  const decision = src("lib/authz/decision.ts");
  assert.doesNotMatch(decision, /organisation_name|first_name|last_name|work_email/);
});

// F069 — diagnostic access protected: no unauthenticated permission-explain surface introduced.
test("F069 — seam exposes no route/endpoint (library-only, not wired to handlers at IW-0)", () => {
  const decision = src("lib/authz/decision.ts");
  assert.doesNotMatch(decision, /NextResponse|export async function (GET|POST|PUT|PATCH|DELETE)/);
});
