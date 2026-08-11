import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── ORG-007 CF-001 (NFR-004) — atomic / non-partial Organisations mutations ────
// Verifies the QUALITY OUTCOME, not merely that a function exists: the three material
// mutation paths now perform their multi-statement work through a SINGLE atomic
// database RPC (migration 177) and NO LONGER issue the separate table writes whose
// interruption produced partial state. Behaviour runs the real services against a
// recording fake for @/lib/supabase-admin; the DB-side atomicity is asserted by
// source-guard here and proven live by supabase-migration-177-verify.sql.

type FromOp = { kind: "from"; table: string; op: string | null };
type RpcOp = { kind: "rpc"; fn: string; args: unknown };
const state: { readRow: unknown; rpcResult: { data: unknown; error: unknown }; ops: (FromOp | RpcOp)[] } =
  { readRow: null, rpcResult: { data: null, error: null }, ops: [] };

function makeChain(table: string) {
  const op: FromOp = { kind: "from", table, op: null };
  const chain: Record<string, unknown> = {
    select() { if (!op.op) op.op = "select"; return chain; },
    insert() { op.op = "insert"; state.ops.push(op); return chain; },
    update() { op.op = "update"; state.ops.push(op); return chain; },
    upsert() { op.op = "upsert"; state.ops.push(op); return chain; },
    delete() { op.op = "delete"; state.ops.push(op); return chain; },
    eq() { return chain; },
    is() { return chain; },
    in() { return chain; },
    order() { return chain; },
    single() { pushRead(op); return Promise.resolve({ data: state.readRow, error: null }); },
    maybeSingle() { pushRead(op); return Promise.resolve({ data: state.readRow, error: null }); },
    then(res: (x: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) {
      pushRead(op);
      return Promise.resolve({ data: null, error: null }).then(res, rej);
    },
  };
  return chain;
}
function pushRead(op: FromOp) { if (op.op === "select") state.ops.push(op); }

const supabaseAdmin = {
  from: (t: string) => makeChain(t),
  rpc: (fn: string, args: unknown) => { state.ops.push({ kind: "rpc", fn, args }); return Promise.resolve(state.rpcResult); },
};
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

let N: typeof import("./names");
let P: typeof import("@/lib/authz/provision-access");
before(async () => { N = await import("./names"); P = await import("@/lib/authz/provision-access"); });
beforeEach(() => { state.readRow = null; state.rpcResult = { data: null, error: null }; state.ops = []; });

const rpcs = () => state.ops.filter((o): o is RpcOp => o.kind === "rpc");
const writesOn = (table: string) =>
  state.ops.filter((o): o is FromOp => o.kind === "from" && o.table === table && o.op !== null && o.op !== "select");

const root = resolve(__dirname, "..", "..");
const mig = readFileSync(resolve(root, "supabase-migration-177.sql"), "utf8");

// ── Name change ────────────────────────────────────────────────────────────────
test("CF-01 — recordNameChange performs one atomic RPC and NO separate close/insert writes", async () => {
  state.readRow = { id: "p1", value: "Old", subject_id: "org1", subject_kind: "organisation", is_primary: true, effective_from: "2020-01-01", effective_to: null };
  state.rpcResult = { data: { id: "n2", value: "New", is_primary: true }, error: null };

  const r = await N.recordNameChange("org1", "organisation", "New", "2026-01-01");
  assert.ok(!("error" in r), "change succeeds");

  const call = rpcs().find((o) => o.fn === "record_organisation_name_change");
  assert.ok(call, "the atomic name-change RPC is invoked");
  assert.deepEqual(call!.args, {
    p_subject_id: "org1", p_subject_kind: "organisation", p_value: "New",
    p_name_form: "display", p_language: null, p_script: null, p_transition_date: "2026-01-01",
  });
  // The former partial-state window (separate UPDATE close + INSERT open) is GONE.
  assert.equal(writesOn("organisation_names").length, 0, "no separate close/insert table writes");
});

test("CF-01 — recordNameChange surfaces an RPC failure as an error (no partial write path)", async () => {
  state.readRow = { id: "p1", value: "Old", is_primary: true, effective_from: "2020-01-01", effective_to: null };
  state.rpcResult = { data: null, error: { code: "23505", message: "dup" } };
  const r = await N.recordNameChange("org1", "organisation", "New", "2026-01-01");
  assert.ok("error" in r, "failure is surfaced");
  assert.equal(writesOn("organisation_names").length, 0, "no compensating/revert write is issued");
});

// ── Organisation access-set reconcile ────────────────────────────────────────────
test("CF-01 — setOrganisationAccessSet reconciles via one atomic RPC, not upsert→select→revoke", async () => {
  await P.setOrganisationAccessSet("u1", [{ organisationId: "orgA", role: "admin" }, { organisationId: "orgB", role: "brand" }]);
  const call = rpcs().find((o) => o.fn === "set_organisation_access_set");
  assert.ok(call, "the atomic reconcile RPC is invoked");
  assert.deepEqual(call!.args, { p_user_id: "u1", p_assignments: [{ organisationId: "orgA", role: "admin" }, { organisationId: "orgB", role: "brand" }] });
  // No multi-statement sequence against the access table.
  assert.equal(writesOn("user_organisation_access").length, 0, "no separate upsert/select/revoke statements");
});

test("CF-01 — an empty access set still goes through the atomic RPC (governed revoke-all)", async () => {
  await P.setOrganisationAccessSet("u1", []);
  const call = rpcs().find((o) => o.fn === "set_organisation_access_set");
  assert.ok(call);
  assert.deepEqual((call!.args as { p_assignments: unknown }).p_assignments, []);
  assert.equal(writesOn("user_organisation_access").length, 0);
});

// ── Selected-study authorisation sync ────────────────────────────────────────────
test("CF-01 — syncSelectedStudyAuthorisations reconciles via one atomic RPC, not DELETE→INSERT", async () => {
  await P.syncSelectedStudyAuthorisations("u1", [
    { resource_type: "research_project", resource_id: "s1" },
    { resource_type: "research_project", resource_id: "s1" }, // duplicate → deduped
    { resource_type: "campaign", resource_id: "c9" },         // non-study → excluded
  ]);
  const call = rpcs().find((o) => o.fn === "sync_selected_study_authorisations");
  assert.ok(call, "the atomic study-sync RPC is invoked");
  assert.deepEqual(call!.args, { p_user_id: "u1", p_study_ids: ["s1"] });
  assert.equal(writesOn("user_resource_authorisations").length, 0, "no separate DELETE/INSERT statements");
});

// ── Source-guards: the RPCs are genuinely atomic at the DB boundary ──────────────
test("CF-01 — migration 177 RPCs are single-transaction plpgsql with NO exception handler", () => {
  for (const fn of ["record_organisation_name_change", "set_organisation_access_set", "sync_selected_study_authorisations"]) {
    assert.match(mig, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`), `${fn} defined`);
  }
  // No EXCEPTION handler anywhere → any failure propagates and rolls the whole op back.
  assert.doesNotMatch(mig, /EXCEPTION\s+WHEN/i, "no exception handler swallows a partial failure");
  // Least privilege: server-only execution.
  assert.match(mig, /GRANT\s+EXECUTE ON FUNCTION public\.record_organisation_name_change[\s\S]*TO service_role/);
  assert.match(mig, /REVOKE ALL ON FUNCTION public\.set_organisation_access_set\(uuid, jsonb\) FROM PUBLIC/);
  // The name-change RPC locks the current primary so concurrent changes serialise.
  assert.match(mig, /FROM public\.organisation_names[\s\S]*FOR UPDATE/);
  // Access-set reconcile is upsert + revoke-not-in-set in one function.
  assert.match(mig, /ON CONFLICT \(user_id, organisation_id\)[\s\S]*DO UPDATE/);
  assert.match(mig, /organisation_id NOT IN \(/);
});
