// ── Stage 5C — Analytical Core shadow HANDLER: DB flow, identity, isolation ────
// Runs the real handler with a MOCKED supabaseAdmin (no DB) and the REAL
// deterministic Core (lazy-imported). Verifies: it resolves the authoritative run
// from the trusted stored record (identity never from the payload), reads the
// immutable evidence_snapshot, upserts ONE shadow row keyed on analysis_run_id, and
// fails correctly — PermanentJobError for un-retryable input, a plain (transient)
// Error for a persistence failure. It writes only the shadow table.
//
// Run with the repo flag: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Mutable supabaseAdmin stub (only the two chains the handler uses) ──────────
type Row = Record<string, unknown>;
let runData: Record<string, Record<string, Row>> = {};      // table → id → run row
let upserts: Array<{ table: string; row: Row; onConflict?: string }> = [];
let upsertError: { message: string } | null = null;
let fromTables: string[] = [];

function makeChain(table: string) {
  fromTables.push(table);
  const st: { table: string; id?: string } = { table };
  const chain: Record<string, unknown> = {
    select() { return chain; },
    eq(col: string, val: string) { if (col === "id") st.id = val; return chain; },
    async single() {
      const row = runData[st.table]?.[st.id ?? ""] ?? null;
      return { data: row, error: row ? null : { message: "no rows" } };
    },
    async upsert(row: Row, opts?: { onConflict?: string }) {
      upserts.push({ table: st.table, row, onConflict: opts?.onConflict });
      return { error: upsertError };
    },
  };
  return chain;
}
const supabaseAdmin = { from: (t: string) => makeChain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

// ── Load the handler (registers itself) after the mock is in place ────────────
import { getHandler } from "@/lib/jobs/registry";
import { PermanentJobError } from "@/lib/jobs/types";
import { ANALYTICAL_CORE_SHADOW_JOB } from "@/lib/jobs/handlers/analytical-core-shadow.constants";

before(async () => { await import("@/lib/jobs/handlers/analytical-core-shadow"); });
beforeEach(() => { runData = {}; upserts = []; upsertError = null; fromTables = []; });

function runHandler(payload: Record<string, unknown>) {
  const def = getHandler(ANALYTICAL_CORE_SHADOW_JOB);
  assert.ok(def, "handler registered");
  return def!.run({
    job: { id: "job1" } as never, payload, attempts: 1, maxAttempts: 5,
    heartbeat: async () => {}, log: () => {},
  });
}

const SNAPSHOT = {
  study: { id: "SRC", objective: "Assess perception of X" },
  evidence: [
    { canonicalQuestionKey: "qk1", question: "How do you rate X?", scope: "combined", optionId: "o1", optionLabel: "Good", count: 62, base: 100 },
    { canonicalQuestionKey: "qk1", question: "How do you rate X?", scope: "combined", optionId: "o2", optionLabel: "Poor", count: 38, base: 100 },
    // survey-scoped detail rows the adapter must ignore (combined-only):
    { canonicalQuestionKey: "qk1", question: "How do you rate X?", scope: "survey", optionId: "o1", optionLabel: "Good", count: 30, base: 50 },
  ],
};

test("valid SURVEY run → one shadow row; identity + lineage from the trusted record", async () => {
  runData.survey_analysis_runs = { R1: { id: "R1", survey_id: "SURVEY-42", evidence_snapshot: SNAPSHOT } };
  await runHandler({ source_kind: "survey", analysis_run_id: "R1" });

  assert.equal(upserts.length, 1);
  const { table, row, onConflict } = upserts[0];
  assert.equal(table, "analytical_core_shadow_runs");     // shadow table only
  assert.equal(onConflict, "analysis_run_id");            // idempotent key
  assert.equal(row.source_kind, "survey");
  assert.equal(row.analysis_run_id, "R1");
  assert.equal(row.source_id, "SURVEY-42");               // from the run row, NOT the payload
  assert.equal(row.status, "completed");
  assert.match(String(row.input_fingerprint), /^sha256:/);// deterministic lineage
  assert.ok(row.versions && typeof row.versions === "object");
  assert.ok(row.run && typeof row.run === "object");
  assert.equal(row.error, null);
});

test("valid STUDY run → resolves study_analysis_runs + study_id", async () => {
  runData.study_analysis_runs = { R9: { id: "R9", study_id: "STUDY-7", evidence_snapshot: SNAPSHOT } };
  await runHandler({ source_kind: "study", analysis_run_id: "R9" });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].row.source_kind, "study");
  assert.equal(upserts[0].row.source_id, "STUDY-7");
});

test("reads ONLY the run table + shadow table (no live results re-resolution)", async () => {
  runData.survey_analysis_runs = { R1: { id: "R1", survey_id: "S", evidence_snapshot: SNAPSHOT } };
  await runHandler({ source_kind: "survey", analysis_run_id: "R1" });
  assert.deepEqual([...new Set(fromTables)].sort(), ["analytical_core_shadow_runs", "survey_analysis_runs"]);
});

test("missing analysis_run_id → PermanentJobError (un-retryable input)", async () => {
  await assert.rejects(() => runHandler({ source_kind: "survey" }), PermanentJobError);
  assert.equal(upserts.length, 0);
});

test("unknown source_kind → PermanentJobError (before any DB read)", async () => {
  await assert.rejects(() => runHandler({ source_kind: "brand", analysis_run_id: "R1" }), PermanentJobError);
  assert.equal(fromTables.length, 0);
});

test("authoritative run not found → PermanentJobError", async () => {
  await assert.rejects(() => runHandler({ source_kind: "survey", analysis_run_id: "GHOST" }), PermanentJobError);
  assert.equal(upserts.length, 0);
});

test("run without a usable evidence_snapshot → PermanentJobError", async () => {
  runData.survey_analysis_runs = { R1: { id: "R1", survey_id: "S", evidence_snapshot: null } };
  await assert.rejects(() => runHandler({ source_kind: "survey", analysis_run_id: "R1" }), PermanentJobError);
  assert.equal(upserts.length, 0);
});

test("persistence failure → TRANSIENT error (retryable), NOT PermanentJobError", async () => {
  runData.survey_analysis_runs = { R1: { id: "R1", survey_id: "S", evidence_snapshot: SNAPSHOT } };
  upsertError = { message: "db unavailable" };
  await assert.rejects(() => runHandler({ source_kind: "survey", analysis_run_id: "R1" }), (e: unknown) => {
    assert.ok(e instanceof Error);
    assert.ok(!(e instanceof PermanentJobError), "must be retryable, not permanent");
    return true;
  });
  // The only write attempted was the shadow upsert — no authoritative table touched.
  assert.deepEqual(upserts.map((u) => u.table), ["analytical_core_shadow_runs"]);
});
