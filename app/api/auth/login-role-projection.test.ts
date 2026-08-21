import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

// ── ORG-005 IW-11 corrective — Login role projection ──────────────────────────
// Proves the coarse JWT `role` hint is minted from the GOVERNED contextual role
// (user_organisation_access.role for the resolved Active Organisation Context) via
// the existing governed readers — NOT from the removed users.role scalar — and that
// the minted hint drives correct middleware admission. requireUser remains the
// authoritative gate (unchanged). Uses module mocks so no DB is required.

process.env.JWT_SECRET = "test-login-role-secret";

const state: {
  user: Record<string, unknown> | null;
  accessSet: string[] | null;
  contextualRole: "admin" | "brand" | "agency" | "publisher" | null;
} = { user: null, accessSet: null, contextualRole: null };

// Minimal supabase-admin fake: users lookup (.single) + last_login update (awaited).
function chain() {
  const ctx: { op: string | null } = { op: null };
  const c: Record<string, unknown> = {
    select() { return c }, ilike() { return c }, eq() { return c }, neq() { return c },
    update() { ctx.op = "update"; return c },
    single() { return Promise.resolve({ data: state.user, error: state.user ? null : { message: "not found" } }); },
    then(res: (x: { data: null; error: null }) => unknown) { return Promise.resolve({ data: null, error: null }).then(res); },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: () => chain() } } });

// Governed readers — the SAME ones requireUser uses — replaced with controllable stubs.
mock.module("@/lib/authz/organisation-access", { namedExports: {
  fetchActiveOrganisationAccess: async () => state.accessSet,
  resolveActiveContext: (access: string[] | null) => ({
    activeOrganisationId: access && access.length ? access[0] : null, status: "resolved", reason: "test",
  }),
}});
mock.module("@/lib/authz/role-profile", { namedExports: {
  fetchContextualRole: async () => state.contextualRole,
}});

let POST: (req: NextRequest) => Promise<Response>;
let hash: string;
const PW = "correct-horse";

before(async () => {
  const bcrypt = (await import("bcryptjs")).default;
  hash = await bcrypt.hash(PW, 10);
  ({ POST } = await import("@/app/api/auth/login/route"));
});
beforeEach(() => {
  state.user = { id: "u1", work_email: "admin@example.com", hashed_password: hash, status: "active", force_password_change: false, token_version: 0, remembered_organisation_id: "orgA" };
  state.accessSet = ["orgA"];
  state.contextualRole = null;
});

function loginReq(email = "admin@example.com", password = PW): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

/** Decode (no verify) the role claim from the Set-Cookie session JWT. */
function jwtRoleFrom(res: Response): unknown {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/fanometrix_session=([^;]+)/);
  assert.ok(m, "session cookie present");
  const payload = JSON.parse(Buffer.from(m![1].split(".")[1], "base64").toString("utf8"));
  return payload.role;
}

// The reported defect scenario: governed contextual role = admin → JWT role = admin.
test("authorised admin: login mints role:'admin' from the governed contextual role", async () => {
  state.contextualRole = "admin";
  const res = await POST(loginReq());
  assert.equal(res.status, 200);
  assert.equal(jwtRoleFrom(res), "admin");
});

// Non-admin governed role projects through unchanged.
test("publisher: JWT role hint = 'publisher' (governed)", async () => {
  state.contextualRole = "publisher";
  assert.equal(jwtRoleFrom(await POST(loginReq())), "publisher");
});

// No single resolved context (indeterminate/absent access) → no role hint (admin-only
// routes will deny until a Current Organisation is selected). Never fabricated.
test("no resolved context → role hint absent (null), not fabricated", async () => {
  state.accessSet = null;      // fetchActiveOrganisationAccess indeterminate
  state.contextualRole = null;
  assert.equal(jwtRoleFrom(await POST(loginReq())), null);
});

// The minted admin hint is admitted by the SAME governed projection middleware uses.
test("middleware admits the minted admin hint; denies non-admin/absent", async () => {
  const { resolveProductAccess } = await import("@/lib/authz/product-access");
  assert.equal(resolveProductAccess({ role: "admin", tier: "admin-only" }), true);
  assert.equal(resolveProductAccess({ role: "publisher", tier: "admin-only" }), false);
  // Absent hint (undefined/null) is not admin → admin-only denies (fail-closed).
  assert.equal(resolveProductAccess({ role: undefined as unknown as "admin", tier: "admin-only" }), false);
});

// Source-guard: no users.role dependency remains; governed readers are used.
test("login flow has no users.role dependency and uses the governed readers", () => {
  const src = readFileSync(resolve(__dirname, "login", "route.ts"), "utf8");
  assert.doesNotMatch(src, /user\.role/);                    // removed scalar not read
  assert.match(src, /fetchContextualRole\(user\.id, activeOrganisationId\)/);
  assert.match(src, /fetchActiveOrganisationAccess\(user\.id\)/);
  assert.match(src, /role: contextualRole/);                 // JWT hint from governed role
});
