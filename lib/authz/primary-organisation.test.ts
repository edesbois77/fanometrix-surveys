import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── ORG-006 — Primary Organisation stability ──────────────────────────────────
// The Primary Organisation must be a STABLE, explicitly-settable member of the
// access set: adding/removing Additional access must not change it, switching
// Current Organisation (users.remembered_organisation_id — a different field) must
// not change it, and an explicit Primary change must take effect. Runs the real
// provisioning/display logic against a recording fake for @/lib/supabase-admin.

type Op = { table: string; op: string | null; payload: unknown; filters: [string, string, unknown][] };
const state: { rows: Record<string, unknown>[]; ops: Op[] } = { rows: [], ops: [] };

function chain(table: string) {
  const ctx: Op = { table, op: null, payload: null, filters: [] };
  const c: Record<string, unknown> = {
    select() { if (!ctx.op) ctx.op = "select"; return c; },
    update(p: unknown) { ctx.op = "update"; ctx.payload = p; return c; },
    eq(k: string, v: unknown) { ctx.filters.push(["eq", k, v]); return c; },
    in(k: string, v: unknown) { ctx.filters.push(["in", k, v]); return c; },
    order() { return c; },
    then(res: (x: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) {
      state.ops.push({ ...ctx, filters: [...ctx.filters] });
      return Promise.resolve({ data: state.rows, error: null }).then(res, rej);
    },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: string) => chain(t) } } });

let P: typeof import("@/lib/authz/provision-access");
before(async () => { P = await import("@/lib/authz/provision-access"); });
beforeEach(() => { state.rows = []; state.ops = []; });

// Active associations in created_at order (the DB returns them ordered; the fake
// returns them as provided). TFC established first, Two Circles added later.
const TFC = { user_id: "u", organisation_id: "TFC", role: "admin", created_at: "2024-01-01T00:00:00.000Z", organisations: { name: "The Football Collective", type: "brand" } };
const TC  = { user_id: "u", organisation_id: "TC",  role: "brand", created_at: "2024-06-01T00:00:00.000Z", organisations: { name: "Two Circles", type: "agency" } };

// Case 1 — adding Additional access does not change the Primary (earliest wins).
test("Primary is the earliest-established association; adding Two Circles keeps TFC primary", async () => {
  state.rows = [TFC, TC]; // ordered by created_at ASC
  const ctxs = await P.governedUserContexts(["u"]);
  assert.equal(ctxs.get("u")?.organisation_id, "TFC");
  assert.equal(ctxs.get("u")?.organisations?.name, "The Football Collective");
});

test("governedUserContext (single) returns the same deterministic Primary", async () => {
  state.rows = [TFC, TC];
  assert.equal((await P.governedUserContext("u")).organisation_id, "TFC");
});

// Case 4 — an explicit Primary change is persisted (re-anchored so it is earliest).
test("setPrimaryOrganisation('TC') when TFC is primary re-anchors TC to be earliest", async () => {
  state.rows = [TFC, TC];
  await P.setPrimaryOrganisation("u", "TC");
  const upd = state.ops.find((o) => o.op === "update");
  assert.ok(upd, "an update was issued to re-anchor the new primary");
  assert.equal(upd!.table, "user_organisation_access");
  // targets exactly the new primary association
  assert.ok(upd!.filters.some((f) => f[0] === "eq" && f[1] === "organisation_id" && f[2] === "TC"));
  assert.ok(upd!.filters.some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "active"));
  // sets created_at earlier than the current earliest (2024-01-01) → becomes primary
  const anchored = (upd!.payload as { created_at: string }).created_at;
  assert.ok(new Date(anchored) < new Date("2024-01-01T00:00:00.000Z"));
  // …and touches ONLY the two technical columns (no remembered/current, no role/status change)
  assert.deepEqual(Object.keys(upd!.payload as object), ["created_at"]);
});

test("setPrimaryOrganisation is a no-op when the organisation is already the Primary", async () => {
  state.rows = [TFC, TC];
  await P.setPrimaryOrganisation("u", "TFC"); // already earliest
  assert.equal(state.ops.find((o) => o.op === "update"), undefined, "no write when already primary");
});

// Cases 2/3/5 — Primary/display logic never reads or writes the Current Organisation
// (users.remembered_organisation_id) or the access-set membership; switching Current
// therefore cannot change the Primary, and Additional access is untouched.
test("Primary logic is independent of Current Organisation (remembered) and never mutates the access set", () => {
  const src = readFileSync(resolve(__dirname, "provision-access.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function setPrimaryOrganisation"), src.indexOf("export async function selectedStudyGrantsForDisplay"));
  assert.doesNotMatch(fn, /remembered_organisation_id/); // never touches Current Organisation
  assert.doesNotMatch(fn, /from\("users"\)/);            // never touches the users row
  assert.doesNotMatch(fn, /\.(insert|upsert|delete)\(/); // never changes access-set membership
  assert.match(fn, /from\("user_organisation_access"\)/);
});
