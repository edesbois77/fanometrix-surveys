import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── ORG-006 WP-03 (IS-03) — VO-03 Canonical Organisation Name Conformance ──────
// Verifies that administrative Organisation Name administration uses the governed
// canonical Name machinery (correction vs represented-world change, history,
// Effective Applicability) and cannot bypass it by writing the compatibility/core
// organisations.name projection directly. Behavioural checks run the real name
// service against a recording fake for @/lib/supabase-admin; route/projection
// checks are source-guards.

type Op = { table: string; op: string | null; payload: unknown; filters: [string, string, unknown][]; terminal?: string };
const state: { readRow: unknown; ops: Op[] } = { readRow: null, ops: [] };

function makeChain(table: string) {
  const ctx: Op = { table, op: null, payload: null, filters: [] };
  const rec = (terminal?: string) => { state.ops.push({ ...ctx, filters: [...ctx.filters], terminal }); };
  const chain: Record<string, unknown> = {
    select() { if (!ctx.op) ctx.op = "select"; return chain; },
    insert(p: unknown) { ctx.op = "insert"; ctx.payload = p; return chain; },
    update(p: unknown) { ctx.op = "update"; ctx.payload = p; return chain; },
    delete() { ctx.op = "delete"; return chain; },
    upsert(p: unknown) { ctx.op = "upsert"; ctx.payload = p; return chain; },
    eq(c: string, v: unknown) { ctx.filters.push(["eq", c, v]); return chain; },
    is(c: string, v: unknown) { ctx.filters.push(["is", c, v]); return chain; },
    neq(c: string, v: unknown) { ctx.filters.push(["neq", c, v]); return chain; },
    in(c: string, v: unknown) { ctx.filters.push(["in", c, v]); return chain; },
    order() { return chain; },
    single() { rec("single"); return Promise.resolve({ data: state.readRow, error: null }); },
    maybeSingle() { rec("maybeSingle"); return Promise.resolve({ data: state.readRow, error: null }); },
    then(res: (x: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) {
      rec("await");
      return Promise.resolve({ data: null, error: null }).then(res, rej);
    },
  };
  return chain;
}

const supabaseAdmin = { from: (t: string) => makeChain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

let N: typeof import("@/lib/organisations/names");
before(async () => { N = await import("@/lib/organisations/names"); });
beforeEach(() => { state.ops = []; state.readRow = null; });

const root = resolve(__dirname, "..", "..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");
const opsOn = (table: string) => state.ops.filter((o) => o.table === table);

// VO-03-A — canonical write path: correcting the name updates the CANONICAL
// organisation_names fact, never the organisations projection column directly.
test("VO-03-A — correctPrimaryName writes the canonical Name fact, not the projection", async () => {
  state.readRow = { id: "n1", value: "Old Name" };
  const r = await N.correctPrimaryName("org1", "New Name");
  assert.ok(!("error" in r), "correction succeeds");

  const nameOps = opsOn("organisation_names");
  const upd = nameOps.find((o) => o.op === "update");
  assert.ok(upd, "an update to the canonical organisation_names fact");
  assert.equal((upd!.payload as { value?: string }).value, "New Name");
  // The canonical/core projection is NEVER written directly as the admin path.
  assert.equal(opsOn("organisations").length, 0, "no direct write to organisations.name");
});

// VO-03-D — correction is DISTINCT from change: a correction is in-place with NO
// new row (no fabricated history), never a close+open.
test("VO-03-D — correction is in-place with no history fabrication (distinct from change)", async () => {
  state.readRow = { id: "n1", value: "Old" };
  await N.correctPrimaryName("org1", "Fixed");
  const nameOps = opsOn("organisation_names");
  assert.ok(nameOps.some((o) => o.op === "update"), "in-place correction");
  assert.ok(!nameOps.some((o) => o.op === "insert"), "no new Name row (no fabricated history)");
  assert.ok(!nameOps.some((o) => o.op === "delete"), "no destruction of the prior fact");
});

test("VO-03-D — a no-op correction (same value) makes no write", async () => {
  state.readRow = { id: "n1", value: "Same" };
  await N.correctPrimaryName("org1", "Same");
  assert.equal(opsOn("organisation_names").filter((o) => o.op === "update").length, 0);
});

test("correctPrimaryName refuses when there is no primary (never silently seeds)", async () => {
  state.readRow = null;
  const r = await N.correctPrimaryName("org1", "X");
  assert.ok("error" in r);
  assert.equal(r.status, 409);
  assert.equal(opsOn("organisation_names").filter((o) => o.op !== "select").length, 0, "no write");
});

// VO-03-B + VO-03-C — represented-world CHANGE preserves the prior fact as history
// and respects Effective Applicability (close current at T, open new from T).
test("VO-03-B/C — recordNameChange preserves history and Effective Applicability", async () => {
  state.readRow = { id: "p1", value: "Old", subject_id: "org1", subject_kind: "organisation", is_primary: true, effective_from: "2020-01-01", effective_to: null };
  const r = await N.recordNameChange("org1", "organisation", "New", "2026-01-01");
  assert.ok(!("error" in r), "change succeeds");

  const nameOps = opsOn("organisation_names");
  // Prior primary is CLOSED (kept as history), not deleted/overwritten in value.
  const close = nameOps.find((o) => o.op === "update");
  assert.ok(close, "prior primary is closed");
  const cp = close!.payload as { is_primary?: boolean; effective_to?: string };
  assert.equal(cp.is_primary, false);
  assert.equal(cp.effective_to, "2026-01-01", "closed at the transition (Effective Applicability)");
  assert.ok(!nameOps.some((o) => o.op === "delete"), "prior Name history is never destroyed");
  // New primary opens from the transition date, still current (no end).
  const ins = nameOps.find((o) => o.op === "insert");
  assert.ok(ins, "a new primary Name fact is created");
  const ip = ins!.payload as { value?: string; is_primary?: boolean; effective_from?: string; effective_to?: string | null };
  assert.equal(ip.value, "New");
  assert.equal(ip.is_primary, true);
  assert.equal(ip.effective_from, "2026-01-01");
  assert.equal(ip.effective_to, null);
});

test("VO-03-C — a transition on/before the current start is rejected (half-open interval)", async () => {
  state.readRow = { id: "p1", value: "Old", is_primary: true, effective_from: "2026-01-01", effective_to: null };
  const r = await N.recordNameChange("org1", "organisation", "New", "2025-01-01");
  assert.ok("error" in r);
  assert.equal(r.status, 400);
});

// ── Source-guards: route conformance + projection preservation ────────────────

// VO-03-A + VO-03-F — the Organisation core-edit route routes NAME through the
// canonical machinery and does NOT write organisations.name directly.
test("VO-03-A/F — PUT /api/organisations/[id] routes name via canonical correction, not the projection", () => {
  const route = src("app/api/organisations/[id]/route.ts");
  assert.match(route, /import \{ correctPrimaryName \} from "@\/lib\/organisations\/names"/);
  assert.match(route, /await correctPrimaryName\(id, name\)/);
  // name is NEVER placed in the organisations core UPDATE payload.
  assert.doesNotMatch(route, /update\.name\s*=/);
});

// VO-03-E + VO-03-G — the compatibility projection remains maintained by the
// existing governed DB trigger (organisations.name follows the current primary
// canonical Name), so existing consumers still read the current name.
test("VO-03-E/G — the one-way canonical→projection sync (migration 151) is intact", () => {
  const m = src("supabase-migration-151.sql");
  assert.match(m, /FUNCTION sync_name_projection/i);
  assert.match(m, /UPDATE organisations SET name = v WHERE id = subj/);
  // Consumers keep reading organisations.name (e.g. the org list GET).
  assert.match(src("app/api/organisations/route.ts"), /\.select\("id, name/);
});

// VO-03-H — Name administration still consumes the inherited Platform Authorisation
// (admin) with no independent entitlement mechanism introduced.
test("VO-03-H — administration remains admin-gated via requireUser, no new entitlement", () => {
  const route = src("app/api/organisations/[id]/route.ts");
  assert.match(route, /requireUser\(req, \["admin"\]\)/);
  const namesRoute = src("app/api/organisations/[id]/names/route.ts");
  assert.match(namesRoute, /requireUser\(req, \["admin"\]\)/);
  // No role/entitlement invented in the name service.
  assert.doesNotMatch(src("lib/organisations/names.ts"), /entitlement|grantRole|new Role/i);
});
