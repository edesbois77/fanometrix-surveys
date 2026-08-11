import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── ORG-006 WP-01 (IS-01) — VO-01-H Multi-grant provisioning ──────────────────
// Proves that provisioning can retain MORE THAN ONE active Organisation
// association without automatically collapsing the set to one, that the inherited
// single-Organisation path still collapses (compatibility), and that specific
// associations can be granted/revoked without disturbing the rest. Uses a
// recording fake for @/lib/supabase-admin so the real provisioning code runs
// without a database.
//
// ORG-007 CF-001 — the SET reconcile now runs atomically in the
// set_organisation_access_set RPC (migration 177). These tests assert the app
// forwards the EXACT desired set to that atomic boundary (no collapse to one at the
// app layer); the retain-vs-revoke-not-in-set guarantee is proven at the DB boundary
// by cf01-atomic-mutations.test.ts + supabase-migration-177-verify.sql. The
// single-association grant/revoke paths are unchanged (direct writes).

type Op = { table: string; op: string | null; payload: unknown; opts?: unknown; filters: [string, string, unknown][] };
type Rpc = { fn: string; args: unknown };
const state: { activeOrgs: { organisation_id: string }[]; ops: Op[]; rpcs: Rpc[] } = { activeOrgs: [], ops: [], rpcs: [] };

function makeChain(table: string) {
  const ctx: Op = { table, op: null, payload: null, filters: [] };
  const chain: Record<string, unknown> = {
    upsert(p: unknown, opts: unknown) { ctx.op = "upsert"; ctx.payload = p; ctx.opts = opts; return chain; },
    insert(p: unknown) { ctx.op = "insert"; ctx.payload = p; return chain; },
    update(p: unknown) { ctx.op = "update"; ctx.payload = p; return chain; },
    delete() { ctx.op = "delete"; return chain; },
    select(c: unknown) { if (!ctx.op) ctx.op = "select"; void c; return chain; },
    eq(c: string, v: unknown) { ctx.filters.push(["eq", c, v]); return chain; },
    neq(c: string, v: unknown) { ctx.filters.push(["neq", c, v]); return chain; },
    in(c: string, v: unknown) { ctx.filters.push(["in", c, v]); return chain; },
    then(res: (x: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) {
      state.ops.push({ ...ctx, filters: [...ctx.filters] });
      const data = ctx.op === "select" ? state.activeOrgs : null;
      return Promise.resolve({ data, error: null }).then(res, rej);
    },
  };
  return chain;
}

const supabaseAdmin = {
  from: (table: string) => makeChain(table),
  rpc: (fn: string, args: unknown) => { state.rpcs.push({ fn, args }); return Promise.resolve({ data: null, error: null }); },
};
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

let P: typeof import("@/lib/authz/provision-access");
before(async () => { P = await import("@/lib/authz/provision-access"); });
beforeEach(() => { state.ops = []; state.activeOrgs = []; state.rpcs = []; });

const upsertOp = () => state.ops.find((o) => o.op === "upsert");
const revokeOp = () => state.ops.find((o) => o.op === "update" && (o.payload as { status?: string })?.status === "revoked");
const reconcileRpc = () => state.rpcs.find((r) => r.fn === "set_organisation_access_set");
const assignmentsOf = (r: Rpc | undefined) => (r?.args as { p_assignments: { organisationId: string; role: string }[] })?.p_assignments;

// VO-01-H — a multi-Organisation set is provisioned WITHOUT collapsing to one:
// the app forwards BOTH desired associations to the atomic reconcile.
test("VO-01-H — setOrganisationAccessSet forwards the whole desired set (grants many, collapses none)", async () => {
  await P.setOrganisationAccessSet("u1", [
    { organisationId: "A", role: "admin" },
    { organisationId: "B", role: "brand" },
  ]);
  const rpc = reconcileRpc();
  assert.ok(rpc, "the atomic reconcile RPC is invoked");
  const asg = assignmentsOf(rpc);
  assert.equal(asg.length, 2, "both desired associations forwarded (no collapse to one)");
  assert.deepEqual(asg.map((a) => a.organisationId).sort(), ["A", "B"]);
  // No app-layer multi-statement upsert/select/revoke (the old partial-state path).
  assert.equal(upsertOp(), undefined, "no app-layer upsert");
  assert.equal(revokeOp(), undefined, "no app-layer revoke");
  assert.ok(!state.ops.some((o) => o.filters.some((f) => f[0] === "neq")), "no blanket single-collapse");
});

// VO-01-H (retention) — the SAME multi set is forwarded intact (retain, no drop).
test("VO-01-H — reconciling to the SAME multi set forwards both (retains all)", async () => {
  await P.setOrganisationAccessSet("u1", [
    { organisationId: "A", role: "admin" },
    { organisationId: "B", role: "brand" },
  ]);
  assert.deepEqual(assignmentsOf(reconcileRpc()).map((a) => a.organisationId).sort(), ["A", "B"]);
});

// Compatibility — the inherited SINGLE-Organisation path forwards exactly one.
test("VO-01-J — syncGovernedOrganisationAccess (single) forwards exactly one association", async () => {
  await P.syncGovernedOrganisationAccess("u1", "A", "admin");
  const asg = assignmentsOf(reconcileRpc());
  assert.equal(asg.length, 1);
  assert.deepEqual(asg[0], { organisationId: "A", role: "admin" });
});

// No org/role → the atomic reconcile receives an EMPTY set (governed revoke-all).
test("no organisation → atomic reconcile with an empty set (no app-layer writes)", async () => {
  await P.syncGovernedOrganisationAccess("u1", null, null);
  const asg = assignmentsOf(reconcileRpc());
  assert.deepEqual(asg, [], "empty desired set → RPC revokes all active");
  assert.equal(upsertOp(), undefined);
  assert.equal(revokeOp(), undefined, "no app-layer statements");
});

// Specific-association grant/revoke leave the rest of the set intact.
test("grantOrganisationAccess adds one association without revoking others", async () => {
  await P.grantOrganisationAccess("u1", "B", "brand");
  assert.ok(upsertOp(), "grants B");
  assert.equal(revokeOp(), undefined, "no revoke of other associations");
});

test("revokeOrganisationAccess removes exactly one association", async () => {
  await P.revokeOrganisationAccess("u1", "B");
  assert.equal(upsertOp(), undefined);
  const rev = revokeOp();
  assert.ok(rev);
  assert.ok(rev!.filters.some((f) => f[0] === "eq" && f[1] === "organisation_id" && f[2] === "B"));
});
