import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

// ── Login admission by account status ─────────────────────────────────────────
// Regression cover for the invited-account lockout: the login lookup filtered on
// `status = 'active'`, which made the "first successful login promotes an invited
// account to active" branch further down the same route unreachable. Every user
// created through the invite flow (status `pending_invitation`) was therefore
// rejected with the generic "Invalid email or password" while holding a correct
// temporary password. These tests pin the admission rule for all three statuses:
//   pending_invitation → admitted, and promoted to active
//   active             → admitted, status untouched
//   disabled           → rejected, indistinguishably from a bad password
//
// Unlike the sibling login-role-projection suite, the supabase fake here APPLIES
// the query filters against an in-memory table, so a regression in the filter is
// actually observable rather than mocked away.

process.env.JWT_SECRET = "test-login-status-secret";

type Row = Record<string, unknown> & { id: string; status: string };

const db: { rows: Row[]; updates: { payload: Record<string, unknown>; ids: string[] }[] } = {
  rows: [],
  updates: [],
};

function chain() {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" = "select";
  let payload: Record<string, unknown> = {};
  const matches = () => db.rows.filter((r) => filters.every((f) => f(r)));

  const c: Record<string, unknown> = {
    select() { return c },
    update(p: Record<string, unknown>) { op = "update"; payload = p; return c },
    ilike(col: string, val: string) {
      filters.push((r) => String(r[col]).toLowerCase() === val.toLowerCase());
      return c;
    },
    eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return c },
    neq(col: string, val: unknown) { filters.push((r) => r[col] !== val); return c },
    single() {
      const m = matches();
      // Mirrors PostgREST .single(): anything other than exactly one row errors.
      return Promise.resolve(
        m.length === 1 ? { data: { ...m[0] }, error: null } : { data: null, error: { message: "no rows" } },
      );
    },
    // Terminal await on the update chain (route does `await ...update(...).eq(...)`).
    then(res: (x: { data: null; error: null }) => unknown) {
      if (op === "update") {
        const m = matches();
        db.updates.push({ payload, ids: m.map((r) => r.id) });
        m.forEach((r) => Object.assign(r, payload));
      }
      return Promise.resolve({ data: null, error: null }).then(res);
    },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: () => chain() } } });

mock.module("@/lib/authz/organisation-access", { namedExports: {
  fetchActiveOrganisationAccess: async () => ["orgA"],
  resolveActiveContext: (access: string[] | null) => ({
    activeOrganisationId: access && access.length ? access[0] : null, status: "resolved", reason: "test",
  }),
}});
mock.module("@/lib/authz/role-profile", { namedExports: {
  fetchContextualRole: async () => "admin",
}});

let POST: (req: NextRequest) => Promise<Response>;
let hash: string;
const PW = "correct-horse";

before(async () => {
  const bcrypt = (await import("bcryptjs")).default;
  hash = await bcrypt.hash(PW, 10);
  ({ POST } = await import("@/app/api/auth/login/route"));
});

function seed(status: string): Row {
  const row: Row = {
    id: "u1", work_email: "invitee@example.com", hashed_password: hash, status,
    force_password_change: false, token_version: 0, remembered_organisation_id: "orgA",
  };
  db.rows = [row];
  db.updates = [];
  return row;
}

beforeEach(() => { db.rows = []; db.updates = []; });

function loginReq(email = "invitee@example.com", password = PW): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

// ── The reported defect ──────────────────────────────────────────────────────
test("pending_invitation + correct password → admitted (was: rejected as bad credentials)", async () => {
  seed("pending_invitation");
  const res = await POST(loginReq());
  assert.equal(res.status, 200, "an invited user holding the correct temporary password must be let in");
  assert.match(res.headers.get("set-cookie") ?? "", /fanometrix_session=/);
});

test("pending_invitation: first successful login promotes the account to active", async () => {
  const row = seed("pending_invitation");
  await POST(loginReq());
  assert.equal(db.updates.length, 1);
  assert.deepEqual(db.updates[0].ids, ["u1"], "only the logging-in user's row is written");
  assert.equal(db.updates[0].payload.status, "active");
  assert.equal(row.status, "active", "promotion is persisted, so requireUser admits the next request");
});

// ── Unchanged behaviour ──────────────────────────────────────────────────────
test("active + correct password → admitted, status left alone", async () => {
  const row = seed("active");
  const res = await POST(loginReq());
  assert.equal(res.status, 200);
  assert.equal(row.status, "active");
  assert.equal(db.updates[0].payload.status, "active", "an active account is not re-labelled");
});

test("disabled → rejected even with the correct password", async () => {
  const row = seed("disabled");
  const res = await POST(loginReq());
  assert.equal(res.status, 401);
  assert.equal(row.status, "disabled", "a disabled account is never promoted");
  assert.equal(db.updates.length, 0, "no login side effects for a rejected account");
});

test("disabled is indistinguishable from a wrong password (no account-state disclosure)", async () => {
  seed("disabled");
  const disabledBody = await (await POST(loginReq())).json();
  seed("active");
  const wrongPwRes = await POST(loginReq("invitee@example.com", "not-the-password"));
  const wrongPwBody = await wrongPwRes.json();
  assert.equal(wrongPwRes.status, 401);
  assert.deepEqual(disabledBody, wrongPwBody);
});

test("wrong password is still rejected for a pending_invitation account", async () => {
  const row = seed("pending_invitation");
  const res = await POST(loginReq("invitee@example.com", "not-the-password"));
  assert.equal(res.status, 401);
  assert.equal(row.status, "pending_invitation", "a failed login never promotes");
  assert.equal(db.updates.length, 0);
});

test("unknown email → 401, no rows written", async () => {
  seed("active");
  const res = await POST(loginReq("nobody@example.com"));
  assert.equal(res.status, 401);
  assert.equal(db.updates.length, 0);
});

// ── Source guard ─────────────────────────────────────────────────────────────
// The defect was a single filter clause; pin its shape so it cannot silently return.
test("login admits by excluding disabled, never by requiring active", () => {
  const src = readFileSync(resolve(__dirname, "login", "route.ts"), "utf8");
  assert.match(src, /\.neq\("status",\s*"disabled"\)/);
  assert.doesNotMatch(src, /\.eq\("status",\s*"active"\)/);
});
