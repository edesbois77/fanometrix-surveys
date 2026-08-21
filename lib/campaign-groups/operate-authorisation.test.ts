// ── The Studio group routes must enforce the SAME "who may operate campaigns"
//    policy as their legacy equivalents ────────────────────────────────────────
//
// Found by the pre-merge permission walk: an agency-role user in the OWNING
// organisation was refused `/api/surveys/<id>` and every legacy campaign surface
// (middleware ADMIN_AND_PUBLISHER_PREFIXES) yet still received 200 from
// `/api/studio/surveys/<id>/group-candidates` and 201 from
// `POST /api/studio/campaign-groups/<id>/revisions`, because `/api/studio/...`
// matched no prefix in that list and the routes stated no role policy of their own.
//
// Each assertion below fails if either half of the fix is reverted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OPERATE_CAMPAIGNS } from "./authorisation";
import { legacyProductAreaAllows } from "@/lib/authz/product-access";
import type { UserRole } from "@/lib/auth";

const ROUTES = [
  "app/api/studio/campaign-groups/route.ts",
  "app/api/studio/campaign-groups/[id]/route.ts",
  "app/api/studio/campaign-groups/[id]/revisions/route.ts",
  "app/api/studio/campaign-groups/[id]/revisions/[revisionId]/route.ts",
  "app/api/studio/surveys/[id]/group-candidates/route.ts",
];

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the policy is exactly the platform's admin-and-publisher tier", () => {
  const ALL: UserRole[] = ["admin", "publisher", "agency", "brand"];
  for (const role of ALL) {
    assert.equal(
      OPERATE_CAMPAIGNS.includes(role),
      legacyProductAreaAllows(role, "admin-and-publisher"),
      `${role} must resolve the same way as the legacy campaign gate`,
    );
  }
});

test("agency and brand are excluded; admin and publisher are not", () => {
  assert.ok(!OPERATE_CAMPAIGNS.includes("agency" as UserRole), "agency must not operate campaign groups");
  assert.ok(!OPERATE_CAMPAIGNS.includes("brand" as UserRole), "brand must not operate campaign groups");
  assert.ok(OPERATE_CAMPAIGNS.includes("admin" as UserRole));
  assert.ok(OPERATE_CAMPAIGNS.includes("publisher" as UserRole));
});

test("every Studio campaign-group handler passes the role list to requireUser", () => {
  for (const path of ROUTES) {
    const src = read(path);
    const bare = src.match(/requireUser\(\s*req\s*\)/g) ?? [];
    assert.equal(bare.length, 0,
      `${path}: requireUser(req) with no role list leaves the handler open to agency/brand`);
    const handlers = (src.match(/^export async function (GET|POST|PATCH|DELETE|PUT)/gm) ?? []).length;
    const gated = (src.match(/requireUser\(\s*req\s*,\s*OPERATE_CAMPAIGNS\s*\)/g) ?? []).length;
    assert.equal(gated, handlers,
      `${path}: ${handlers} handler(s) but ${gated} role-gated requireUser call(s)`);
  }
});

test("the organisation gate is still present and independent of the role gate", () => {
  // The role gate must ADD to org scoping, never replace it — an admin from
  // another organisation must still be refused a group they do not own.
  for (const path of ROUTES.filter(p => p.includes("campaign-groups/[id]"))) {
    const src = read(path);
    assert.match(src, /session\.role !== "admin" && group\.organisationId !== session\.organisationId/,
      `${path}: lost its cross-organisation guard`);
  }
});

test("middleware gates the Studio group API with the same prefix list as the legacy one", () => {
  const mw = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
  const block = mw.slice(
    mw.indexOf("const ADMIN_AND_PUBLISHER_PREFIXES"),
    mw.indexOf("const ADMIN_ONLY_PREFIXES"),
  );
  assert.ok(block.includes('"/api/campaign-groups"'), "legacy prefix disappeared — read this test again");
  assert.ok(block.includes('"/api/studio/campaign-groups"'),
    "the Studio group API must sit behind the same campaign-operation gate as the legacy one");
});

test("the gate does NOT swallow whole /api/studio — only the group routes", () => {
  // Adding "/api/studio" or "/api/studio/surveys" here would silently revoke
  // agency/brand access to unrelated Studio surfaces (Discover, Results, …).
  const mw = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
  const block = mw.slice(
    mw.indexOf("const ADMIN_AND_PUBLISHER_PREFIXES"),
    mw.indexOf("const ADMIN_ONLY_PREFIXES"),
  );
  for (const tooBroad of ['"/api/studio"', '"/api/studio/"', '"/api/studio/surveys"']) {
    assert.ok(!block.includes(tooBroad), `${tooBroad} is too broad for this gate`);
  }
});
