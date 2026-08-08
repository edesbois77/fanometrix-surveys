import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessInsight } from "./insights-access";
import type { Insight } from "@/lib/types";
import type { AuthedUser } from "@/lib/auth-server";

// ORG-005 · IW-11 / DEC-2 — Insight folded into the governed model: restricted
// access is governed SOLELY by the organisation-ID association; operator access
// derives from the governed standing entitlement (a boolean resolved by the
// caller); F033 name-match and per-user Insight Selected Access are RETIRED.

const insight = (over: Partial<Insight>): Insight => ({
  id: "ins-1", title: "", subtitle: null, slug: "", content_type: "article" as Insight["content_type"],
  status: "published", published_at: null, summary: null, content_blocks: [], download_url: null,
  featured_image_url: null, tags: [], visibility: "restricted", created_by: null, created_at: "", updated_at: "",
  ...over,
});
const user = (over: Partial<AuthedUser>): AuthedUser => ({
  id: "u1", workEmail: "", firstName: null, lastName: null, role: "brand",
  organisationId: "org-A", organisationName: "Acme", organisationType: "brand",
  accessScope: "organisation_wide", status: "active", canPresentSimulations: false, ...over,
} as AuthedUser);

// ── restricted access is governed ONLY by the org-ID association ─────────────

test("restricted: governed allowed_organisation_ids matches by immutable org id", () => {
  const i = insight({ allowed_organisation_ids: ["org-A"] });
  assert.equal(canAccessInsight(i, user({ organisationId: "org-A" }), false), true);
  assert.equal(canAccessInsight(i, user({ organisationId: "org-B" }), false), false);
});

test("F033 RETIRED: name tags never confer access (governed id association only)", () => {
  // A matching name tag but a non-matching id list → NO access (name is irrelevant).
  const i = insight({ allowed_organisation_ids: ["org-Z"], tags: ["acme"] });
  assert.equal(canAccessInsight(i, user({ organisationId: "org-A", organisationName: "Acme" }), false), false);
  // No governed association at all (null) → default refuse (no name-match fallback).
  const none = insight({ allowed_organisation_ids: null, tags: ["acme"] });
  assert.equal(canAccessInsight(none, user({ organisationId: "org-A", organisationName: "Acme" }), false), false);
});

// ── operator access via the governed standing entitlement (not role) ─────────

test("operator standing entitlement grants access to any insight (incl. admin_only/unpublished)", () => {
  assert.equal(canAccessInsight(insight({ visibility: "admin_only" }), user({ role: "admin" }), true), true);
  assert.equal(canAccessInsight(insight({ status: "draft" }), user({ role: "admin" }), true), true);
  // Without the entitlement flag, an admin gets NO bypass — governed rules apply.
  assert.equal(canAccessInsight(insight({ visibility: "admin_only" }), user({ role: "admin" }), false), false);
});

// ── non-restricted paths + Selected-Access retirement ────────────────────────

test("public is visible; admin_only hidden from non-operators; selected-scope gets no per-user grant path", () => {
  assert.equal(canAccessInsight(insight({ visibility: "public" }), user({}), false), true);
  assert.equal(canAccessInsight(insight({ visibility: "admin_only" }), user({}), false), false);
  // A selected-scope user now falls under the governed org-id association (no grants mechanism).
  const restricted = insight({ allowed_organisation_ids: ["org-A"] });
  assert.equal(canAccessInsight(restricted, user({ accessScope: "selected", organisationId: "org-A" }), false), true);
  assert.equal(canAccessInsight(restricted, user({ accessScope: "selected", organisationId: "org-B" }), false), false);
});
