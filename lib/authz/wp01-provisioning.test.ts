import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── ORG-006 WP-01 (IS-01) — VO-01-H Multi-grant provisioning ──────────────────
// Proves that provisioning can retain MORE THAN ONE active Organisation
// association without automatically collapsing the set to one, that the inherited
// single-Organisation path still collapses (compatibility), and that specific
// associations can be granted/revoked without disturbing the rest. Uses a
// recording fake for @/lib/supabase-admin so the real provisioning code runs
// without a database.

type Op = { table: string; op: string | null; payload: unknown; opts?: unknown; filters: [string, string, unknown][] };
const state: { activeOrgs: { organisation_id: string }[]; ops: Op[] } = { activeOrgs: [], ops: [] };

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

const supabaseAdmin = { from: (table: string) => makeChain(table) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

let P: typeof import("@/lib/authz/provision-access");
before(async () => { P = await import("@/lib/authz/provision-access"); });
beforeEach(() => { state.ops = []; state.activeOrgs = []; });

const upsertOp = () => state.ops.find((o) => o.op === "upsert");
const revokeOp = () => state.ops.find((o) => o.op === "update" && (o.payload as { status?: string })?.status === "revoked");

// VO-01-H — a multi-Organisation set is provisioned WITHOUT collapsing to one.
test("VO-01-H — setOrganisationAccessSet grants many, collapses none", async () => {
  // Simulate the DB state after the upsert: A,B (desired) plus a stale C.
  state.activeOrgs = [{ organisation_id: "A" }, { organisation_id: "B" }, { organisation_id: "C" }];
  await P.setOrganisationAccessSet("u1", [
    { organisationId: "A", role: "admin" },
    { organisationId: "B", role: "brand" },
  ]);

  const up = upsertOp();
  assert.ok(up, "expected an upsert");
  const rows = up!.payload as { organisation_id: string; status: string }[];
  assert.equal(rows.length, 2, "both desired associations upserted (no collapse to one)");
  assert.deepEqual(rows.map((r) => r.organisation_id).sort(), ["A", "B"]);
  assert.ok(rows.every((r) => r.status === "active"));

  // Only the stale association (C) is revoked — A and B are retained.
  const rev = revokeOp();
  assert.ok(rev, "expected a revoke of removed associations");
  const inF = rev!.filters.find((f) => f[0] === "in");
  assert.ok(inF, "revoke targets a specific id set, not all-others");
  assert.deepEqual(inF![2], ["C"]);

  // No `.neq`-style blanket "revoke every other active row" (the old collapse).
  assert.ok(!state.ops.some((o) => o.filters.some((f) => f[0] === "neq")), "no blanket single-collapse");
});

// VO-01-H (retention) — re-provisioning the same set revokes nothing.
test("VO-01-H — reconciling to the SAME multi set retains all, revokes none", async () => {
  state.activeOrgs = [{ organisation_id: "A" }, { organisation_id: "B" }];
  await P.setOrganisationAccessSet("u1", [
    { organisationId: "A", role: "admin" },
    { organisationId: "B", role: "brand" },
  ]);
  assert.equal(revokeOp(), undefined, "nothing to revoke when the set is unchanged");
});

// Compatibility — the inherited SINGLE-Organisation path still collapses to one.
test("VO-01-J — syncGovernedOrganisationAccess (single) still yields exactly one active org", async () => {
  state.activeOrgs = [{ organisation_id: "A" }, { organisation_id: "C" }]; // had C; setting A
  await P.syncGovernedOrganisationAccess("u1", "A", "admin");

  const up = upsertOp();
  const rows = up!.payload as { organisation_id: string }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organisation_id, "A");
  const rev = revokeOp();
  const inF = rev!.filters.find((f) => f[0] === "in");
  assert.deepEqual(inF![2], ["C"], "the prior association is revoked (single-org parity)");
});

// No org/role → revoke all active (governed "no organisation" state).
test("no organisation → revoke all active access (no upsert)", async () => {
  state.activeOrgs = [{ organisation_id: "A" }];
  await P.syncGovernedOrganisationAccess("u1", null, null);
  assert.equal(upsertOp(), undefined, "no grant when there is no organisation");
  const rev = revokeOp();
  assert.ok(rev, "revokes active access");
  assert.ok(rev!.filters.some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "active"));
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
