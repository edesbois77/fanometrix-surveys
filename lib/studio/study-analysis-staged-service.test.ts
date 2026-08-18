import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildStressStudy, STRESS_OBJECTIVE } from "./stress-fixture";

// Hermetic staged-flow test: mock the DB + resolveStudyResults (stress fixture → staged)
// and a fake completion that branches on the prompt (Stage-1 vs Stage-2). No network.

const { study, resultGroups } = buildStressStudy();
const RESULTS = { study: { ...study, objective: STRESS_OBJECTIVE }, resultGroups, surveys: study.surveyIds.map((id) => ({ surveyId: id })) };

type Row = Record<string, unknown>;
const db: { runs: Row[]; proposals: Row[]; seq: number } = { runs: [], proposals: [], seq: 0 };
const tbl = (t: string) => (t === "study_analysis_runs" ? db.runs : db.proposals);
function chain(table: string) {
  const st: { table: string; filters: [string, unknown][]; ins: Row[] | null; upd: Row | null; sel: boolean } = { table, filters: [], ins: null, upd: null, sel: false };
  const c: Record<string, unknown> = {
    select() { st.sel = true; return c; },
    insert(p: Row | Row[]) { st.ins = Array.isArray(p) ? p : [p]; return c; },
    update(p: Row) { st.upd = p; return c; },
    eq(k: string, v: unknown) { st.filters.push([k, v]); return c; },
    order() { return c; }, limit() { return c; }, in() { return c; },
    single() { return Promise.resolve(term(st, true)); },
    then(res: (x: unknown) => unknown) { return Promise.resolve(term(st, false)).then(res); },
  };
  return c;
}
function match(rows: Row[], f: [string, unknown][]) { return rows.filter((r) => f.every(([k, v]) => r[k] === v)); }
function term(st: { table: string; filters: [string, unknown][]; ins: Row[] | null; upd: Row | null }, single: boolean) {
  const rows = tbl(st.table);
  if (st.ins) { const now = new Date().toISOString(); const made = st.ins.map((r) => { const row = { id: `${st.table}_${++db.seq}`, created_at: now, ...r }; rows.push(row); return row; }); return { data: single ? made[0] : made, error: null }; }
  if (st.upd) { const target = match(rows, st.filters); target.forEach((r) => Object.assign(r, st.upd)); return { data: single ? target[0] : target, error: null }; }
  const out = match(rows, st.filters); return { data: single ? (out[0] ?? null) : out, error: null };
}
const supabaseAdmin = { from: (t: string) => chain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });
mock.module("@/lib/studio/study-results-resolve", { namedExports: { resolveStudyResults: async () => ({ access: "ok", results: RESULTS }) } });

let SVC: typeof import("./study-analysis-service");
before(async () => { SVC = await import("./study-analysis-service"); });
beforeEach(() => { db.runs = []; db.proposals = []; db.seq = 0; });
const session = { workEmail: "admin@fanometrix", role: "admin" } as unknown as import("@/lib/auth-server").AuthedUser;

// Branching fake: ANALYST pass (Stage-1) → proposals; PROJECTION pass → narrative only.
// A per-call counter makes each batch's proposal headline distinct (so cross-batch
// dedupe keeps them). Cites "e1" (global short id).
const isAnalyst = (p: string) => p.toLowerCase().includes("broad first-pass review of one section");
function makeComplete(counter: { analyst: number; narrative: number }) {
  return async (args: { prompt: string }) => {
    if (isAnalyst(args.prompt)) { counter.analyst++; const topic = ["fit", "rewards", "reach", "trust", "premium", "content"][counter.analyst - 1] ?? `topic${counter.analyst}`; return { proposals: [{ type: "observation", priority: "key", headline: `Insight about ${topic}`, explanation: "Grounded in e1.", evidenceRefs: ["e1"] }] }; }
    counter.narrative++;
    return { narrative: { headline: "Overall picture", summary: "e1 says something.", evidenceRefs: ["e1"] } };
  };
}

test("55,42,43. complex study routes staged; snapshot records analysisMode + batchCount", async () => {
  const counter = { analyst: 0, narrative: 0 };
  const out = await SVC.analyseStudy(session, "stress", { complete: makeComplete(counter) as never });
  const snap = out.run?.evidence_snapshot as { analysisMode?: string; batchCount?: number };
  assert.equal(out.run?.status, "completed");
  assert.equal(snap.analysisMode, "staged");
  assert.equal(snap.batchCount, 4);   // 13 groups / 4 per batch
  assert.equal(counter.analyst, 4);   // one ANALYST pass per batch
  assert.equal(counter.narrative, 1); // one PROJECTION (narrative) pass
});

test("42,45. proposals come from the analyst passes (one per batch) and are persisted", async () => {
  const out = await SVC.analyseStudy(session, "stress", { complete: makeComplete({ analyst: 0, narrative: 0 }) as never });
  assert.equal(out.proposals.length, 4);          // one distinct proposal per batch
  assert.ok(out.proposals.every((p) => p.headline.startsWith("Insight ")));
});

test("the projection narrative is frozen in the snapshot (proposals not regenerated)", async () => {
  const out = await SVC.analyseStudy(session, "stress", { complete: makeComplete({ analyst: 0, narrative: 0 }) as never });
  const snap = out.run?.evidence_snapshot as { narrative?: { headline: string } };
  assert.equal(snap.narrative?.headline, "Overall picture");
});

test("32,34,36. an unrecovered analyst batch failure marks the run failed (no partial analysis)", async () => {
  let calls = 0;
  const complete = async (args: { prompt: string }) => {
    if (isAnalyst(args.prompt)) { calls++; throw new Error("analyst provider down"); }
    return { narrative: { headline: "x", summary: "y", evidenceRefs: ["e1"] } };
  };
  const out = await SVC.analyseStudy(session, "stress", { complete: complete as never });
  assert.equal(out.run?.status, "failed");
  assert.equal(out.proposals.length, 0);
  assert.equal(calls, 2, "one controlled retry, then fail"); // first batch: attempt + 1 retry
  assert.equal(db.proposals.length, 0);
});

test("35. zero valid proposals from the analyst passes marks the run failed", async () => {
  const complete = async (args: { prompt: string }) => {
    if (isAnalyst(args.prompt)) return { proposals: [{ type: "observation", headline: "x", explanation: "y", evidenceRefs: ["study#stress|q#NOPE|opt#9|src#combined"] }] }; // hallucinated → rejected
    return { narrative: { headline: "n", summary: "s", evidenceRefs: ["e1"] } };
  };
  const out = await SVC.analyseStudy(session, "stress", { complete: complete as never });
  assert.equal(out.run?.status, "failed");
  assert.equal(out.proposals.length, 0);
});
