import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── ORG-006 WP-04 (IS-04) — VO-04 Organisation Unit Technical-State Semantics ──
// Verifies that the exposed Organisation Unit "remove" operation is a technical
// repository-visibility soft-delete kept clearly separate — in wording and in
// operational consequence — from represented-world Unit existence/persistence.
// Persistence behaviour is asserted by running the real service against a
// recording fake for @/lib/supabase-admin; representation/boundary by source-guard.

type Op = { table: string; op: string | null; payload: unknown; filters: [string, string, unknown][] };
const state: { readRow: unknown; count: number; ops: Op[] } = { readRow: null, count: 0, ops: [] };

function makeChain(table: string) {
  const ctx: Op = { table, op: null, payload: null, filters: [] };
  const rec = () => state.ops.push({ ...ctx, filters: [...ctx.filters] });
  const chain: Record<string, unknown> = {
    select() { if (!ctx.op) ctx.op = "select"; return chain; },
    insert(p: unknown) { ctx.op = "insert"; ctx.payload = p; return chain; },
    update(p: unknown) { ctx.op = "update"; ctx.payload = p; return chain; },
    delete() { ctx.op = "delete"; return chain; },
    eq(c: string, v: unknown) { ctx.filters.push(["eq", c, v]); return chain; },
    is(c: string, v: unknown) { ctx.filters.push(["is", c, v]); return chain; },
    neq(c: string, v: unknown) { ctx.filters.push(["neq", c, v]); return chain; },
    order() { return chain; },
    single() { rec(); return Promise.resolve({ data: state.readRow, error: null }); },
    maybeSingle() { rec(); return Promise.resolve({ data: state.readRow, error: null }); },
    then(res: (x: { data: unknown; count: number; error: null }) => unknown, rej?: (e: unknown) => unknown) {
      rec();
      return Promise.resolve({ data: state.readRow, count: state.count, error: null }).then(res, rej);
    },
  };
  return chain;
}

const supabaseAdmin = { from: (t: string) => makeChain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

let U: typeof import("@/lib/organisations/units");
before(async () => { U = await import("@/lib/organisations/units"); });
beforeEach(() => { state.ops = []; state.readRow = null; state.count = 0; });

const root = resolve(__dirname, "..", "..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");
const updateOp = () => state.ops.find((o) => o.op === "update");

// VO-04-B/C/D/E — persistence effect is EXACTLY the two technical repository-state
// fields; no cascade to subject/canonical facts; no applicability/lifecycle write.
test("VO-04-B/C/D/E — soft-delete writes only deleted_at/deleted_by on organisation_units", async () => {
  state.count = 0; // no live children
  const r = await U.softDeleteUnit("unit1", "admin@example.com");
  assert.ok(!("error" in r), "soft-delete succeeds");

  const upd = updateOp();
  assert.ok(upd, "an update was issued");
  assert.equal(upd!.table, "organisation_units");
  assert.deepEqual(Object.keys(upd!.payload as object).sort(), ["deleted_at", "deleted_by"], "only the technical repository-state fields");
  const p = upd!.payload as { deleted_at: unknown; deleted_by: unknown };
  assert.ok(typeof p.deleted_at === "string" && p.deleted_at, "deleted_at set (visibility state)");
  assert.equal(p.deleted_by, "admin@example.com");

  // No cascade / no fabricated applicability / no lifecycle: nothing written to the
  // subject registration or any canonical-fact table, and no other write at all.
  const otherWrites = state.ops.filter((o) => o.op !== "select" && o.table !== "organisation_units");
  assert.equal(otherWrites.length, 0, "no writes to subject or canonical-fact tables");
});

// VO-04-G — child-hierarchy guard intact: cannot remove while live children exist.
test("VO-04-G — soft-delete is blocked while live child units remain (no write)", async () => {
  state.count = 2; // live children present
  const r = await U.softDeleteUnit("unit1", "admin@example.com");
  assert.ok("error" in r);
  assert.equal(r.status, 409);
  assert.equal(updateOp(), undefined, "no state written when the guard blocks");
});

// VO-04-F — reversibility remains a purely technical repository-state operation:
// restore clears exactly the same two fields (not a represented-world re-establishment).
test("VO-04-F — restore clears only deleted_at/deleted_by (technical reversal)", async () => {
  state.readRow = { id: "unit1" };
  await U.restoreUnit("unit1");
  const upd = updateOp();
  assert.ok(upd);
  assert.deepEqual(upd!.payload, { deleted_at: null, deleted_by: null });
});

// ── Source-guards: representation + unchanged boundary ────────────────────────

const page = src("app/organisations/[id]/page.tsx");
const rfvStart = page.indexOf("async function removeFromView");
const unitFn = page.slice(rfvStart, page.indexOf("return (", rfvStart));
const PROHIBITED = /\b(cease|ceased|cessation|dissolved|discontinued|discontinue|successor|predecessor|terminated|abolished|retire|retired)\b|former unit|historical unit|\breplaced\b|\bended\b/i;

// VO-04-A — the exposed operation no longer presents canonical deletion / cessation.
test("VO-04-A — Units UI presents technical removal, not deletion or cessation", () => {
  // Old deletion wording is gone.
  assert.doesNotMatch(page, /show\("Unit deleted\./);
  assert.doesNotMatch(page, /confirm\(`Delete unit "/);
  assert.doesNotMatch(page, />Delete<\/button>/);
  // New technical repository-state wording is present.
  assert.match(page, /Remove from list/);
  assert.match(page, /Unit removed from the active list\./);
  assert.match(unitFn, /hides the unit from ordinary views/i);
  assert.match(unitFn, /does not delete the unit/i); // explicitly disclaims deletion
  // No represented-world lifecycle vocabulary in the remove operation.
  assert.doesNotMatch(unitFn, PROHIBITED);
});

// VO-04-J — no unintended exposure: technical Restore was NOT surfaced in the UI.
test("VO-04-J — technical restore/other dormant capability is not newly exposed", () => {
  assert.doesNotMatch(page, /restore/i);
  assert.doesNotMatch(page, /Reinstate|Reactivate/i);
  assert.doesNotMatch(page, /restore:\s*true/);
});

// VO-04-B/E/I — the service/persistence is unchanged: only the two technical fields,
// the child-guard, no applicability/lifecycle concepts introduced.
test("VO-04-B/E/I — soft-delete service unchanged; no new lifecycle/applicability", () => {
  const units = src("lib/organisations/units.ts");
  assert.match(units, /update\(\{ deleted_at: new Date\(\)\.toISOString\(\), deleted_by: deletedBy \}\)/);
  assert.match(units, /still contains \$\{count\} sub-unit/); // child-guard intact
  assert.match(units, /update\(\{ deleted_at: null, deleted_by: null \}\)/); // restore unchanged
  // softDeleteUnit body introduces no applicability/lifecycle columns (the HTTP
  // `status: 409` on the guard return is not a Unit lifecycle status).
  const soft = units.slice(units.indexOf("export async function softDeleteUnit"), units.indexOf("export async function restoreUnit"));
  assert.doesNotMatch(soft, /effective_from|effective_to|cessation|successor|predecessor|lifecycle_status|ceased_at|retired_at/i);
});

// VO-04-H — Platform Authorisation boundary unchanged (admin-gated), no broadening.
test("VO-04-H — the Unit DELETE route remains admin-gated via requireUser", () => {
  const route = src("app/api/organisations/units/[unitId]/route.ts");
  assert.match(route, /requireUser\(req, \["admin"\]\)/);
  assert.match(route, /softDeleteUnit\(unitId, session\.workEmail\)/);
});
