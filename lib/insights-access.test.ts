import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessInsight } from "./insights-access";
import type { Insight } from "@/lib/types";
import type { AuthedUser } from "@/lib/auth-server";

// ORG-005 · IW-4 (F033/G5) — governed org-id policy input for restricted insights.

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

const NO_GRANTS = new Set<string>();

// ── Governed id-anchored policy input is authoritative when present ──────────

test("governed allowed_organisation_ids matches by immutable org id (F033 target)", () => {
  const i = insight({ allowed_organisation_ids: ["org-A"], tags: [] });
  assert.equal(canAccessInsight(i, user({ organisationId: "org-A" }), NO_GRANTS), true);
  assert.equal(canAccessInsight(i, user({ organisationId: "org-B" }), NO_GRANTS), false);
});

test("governed id path does NOT fall back to name tags (name is irrelevant once id-anchored)", () => {
  // id list excludes org-A even though the name tag would have matched — the
  // governed input is authoritative and closes the name-match path.
  const i = insight({ allowed_organisation_ids: ["org-Z"], tags: ["acme"] });
  assert.equal(canAccessInsight(i, user({ organisationId: "org-A", organisationName: "Acme" }), NO_GRANTS), false);
});

// ── G5 collision: two different orgs sharing a display name ──────────────────

test("G5 — name-string match cross-grants two orgs with the same name; id-anchoring does not", () => {
  const legacy = insight({ allowed_organisation_ids: null, tags: ["acme"] });
  // Two DIFFERENT organisations both named "Acme" — the legacy name match grants BOTH (the collision).
  assert.equal(canAccessInsight(legacy, user({ organisationId: "org-A", organisationName: "Acme" }), NO_GRANTS), true);
  assert.equal(canAccessInsight(legacy, user({ organisationId: "org-B", organisationName: "Acme" }), NO_GRANTS), true);
  // The governed id path grants only the intended org — collision eliminated.
  const governed = insight({ allowed_organisation_ids: ["org-A"], tags: ["acme"] });
  assert.equal(canAccessInsight(governed, user({ organisationId: "org-A", organisationName: "Acme" }), NO_GRANTS), true);
  assert.equal(canAccessInsight(governed, user({ organisationId: "org-B", organisationName: "Acme" }), NO_GRANTS), false);
});

// ── Legacy fallback retained until the migration backfills (parity) ──────────

test("legacy name-match fallback applies only while allowed_organisation_ids is absent", () => {
  const i = insight({ allowed_organisation_ids: null, tags: ["acme"] });
  assert.equal(canAccessInsight(i, user({ organisationName: "Acme" }), NO_GRANTS), true);
  assert.equal(canAccessInsight(i, user({ organisationName: "Other" }), NO_GRANTS), false);
});

// ── Admin + non-restricted paths unchanged ───────────────────────────────────

test("admin sees all; public visible; selected-access uses explicit grants (unchanged)", () => {
  assert.equal(canAccessInsight(insight({ visibility: "admin_only" }), user({ role: "admin" }), NO_GRANTS), true);
  assert.equal(canAccessInsight(insight({ visibility: "public" }), user({}), NO_GRANTS), true);
  const sel = insight({ id: "ins-9", allowed_organisation_ids: null });
  assert.equal(canAccessInsight(sel, user({ accessScope: "selected" }), new Set(["ins-9"])), true);
  assert.equal(canAccessInsight(sel, user({ accessScope: "selected" }), NO_GRANTS), false);
});
