import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { evidenceRef } from "./study-analysis";
import type { OptionResult } from "./survey-results";

// ── Hermetic service tests ───────────────────────────────────────────────────
// analyseStudy / getLatestStudyAnalysis / reviewProposal run against a stateful
// in-memory fake for @/lib/supabase-admin and a mocked resolveStudyResults; the AI
// call is injected (opts.complete). No DB, no network. Live end-to-end persistence
// against the real tables is proven separately by the FedEx QA harness.

const opt = (id: string, label: string, count: number, base: number): OptionResult =>
  ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });

const RESULTS = {
  study: { id: "STU", name: "FedEx", objective: null as string | null, status: "draft", surveyCount: 2, completedResponses: 274 },
  resultGroups: [{
    canonicalQuestionKey: "qk1", label: "FedEx as a sponsor?", comparability: "combined" as const,
    combined: { base: 274, sourceCount: 2, options: [opt("1", "Strong fit", 92, 274), opt("2", "Unclear", 85, 274)] },
    sources: [
      { surveyId: "A", surveyName: "Survey 1", questionIndex: 0, questionId: "qk1", canonicalQuestionKey: "qk1", label: "FedEx as a sponsor?", resultMode: "historical" as const, completedResponses: 196, base: 196, shown: null, displayLanguage: "en", options: [opt("1", "Strong fit", 62, 196), opt("2", "Unclear", 58, 196)] },
      { surveyId: "B", surveyName: "Survey v2", questionIndex: 0, questionId: "qk1", canonicalQuestionKey: "qk1", label: "FedEx as a sponsor?", resultMode: "historical" as const, completedResponses: 78, base: 78, shown: null, displayLanguage: "en", options: [opt("1", "Strong fit", 30, 78), opt("2", "Unclear", 27, 78)] },
    ],
  }],
  surveys: [{ surveyId: "A" }, { surveyId: "B" }] as { surveyId: string }[],
};
const REF_COMBINED_1 = evidenceRef("STU", "qk1", "1", "combined");
const REF_A1 = evidenceRef("STU", "qk1", "1", "survey", "A");
const REF_B1 = evidenceRef("STU", "qk1", "1", "survey", "B");

// Mutable access + a stateful fake DB.
let mockAccess: "ok" | "forbidden" | "not_found" = "ok";
const db: { runs: Record<string, unknown>[]; proposals: Record<string, unknown>[]; seq: number; fail: Record<string, boolean> } =
  { runs: [], proposals: [], seq: 0, fail: {} };
const extraTables: Record<string, Record<string, unknown>[]> = {};
const storeFor = (t: string) => (t === "study_analysis_runs" ? db.runs : t === "study_analysis_proposals" ? db.proposals : (extraTables[t] ??= []));

function makeChain(table: string) {
  const st: { table: string; filters: [string, unknown][]; mode: string | null; insertRows: Record<string, unknown>[] | null; patch: Record<string, unknown> | null; selectStr: string | null; limitN: number | null } =
    { table, filters: [], mode: null, insertRows: null, patch: null, selectStr: null, limitN: null };
  const chain: Record<string, unknown> = {
    select(str?: string) { st.selectStr = str ?? "*"; if (!st.mode) st.mode = "select"; return chain; },
    insert(payload: Record<string, unknown> | Record<string, unknown>[]) { st.mode = "insert"; st.insertRows = Array.isArray(payload) ? payload : [payload]; return chain; },
    update(patch: Record<string, unknown>) { st.mode = "update"; st.patch = patch; return chain; },
    eq(col: string, val: unknown) { st.filters.push([col, val]); return chain; },
    in(col: string, arr: unknown[]) { st.filters.push([`__in__${col}`, arr]); return chain; },
    order() { return chain; },
    limit(n: number) { st.limitN = n; return chain; },
    single() { return Promise.resolve(term(st, true)); },
    then(res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(term(st, false)).then(res, rej); },
  };
  return chain;
}
function applyFilters(rows: Record<string, unknown>[], filters: [string, unknown][]) {
  return rows.filter((r) => filters.every(([c, v]) => (c.startsWith("__in__") ? (v as unknown[]).includes(r[c.slice(6)]) : r[c] === v)));
}
function term(st: { table: string; filters: [string, unknown][]; mode: string | null; insertRows: Record<string, unknown>[] | null; patch: Record<string, unknown> | null; selectStr: string | null; limitN: number | null }, single: boolean) {
  const rows = storeFor(st.table);
  if (st.mode === "insert") {
    if (db.fail[`insert_${st.table}`]) return { data: null, error: { message: "forced insert failure" } };
    const now = new Date().toISOString();
    const inserted = (st.insertRows ?? []).map((r) => { const row = { id: `${st.table === "study_analysis_runs" ? "run" : "prop"}_${++db.seq}`, created_at: now, ...r }; rows.push(row); return row; });
    return { data: single ? inserted[0] : inserted, error: null };
  }
  if (st.mode === "update") {
    if (db.fail[`update_${st.table}`]) return { data: null, error: { message: "forced update failure" } };
    const target = applyFilters(rows, st.filters);
    for (const r of target) Object.assign(r, st.patch);
    return { data: single ? (target[0] ?? null) : target, error: null };
  }
  let out = applyFilters(rows, st.filters);
  if (st.table === "study_analysis_runs") out = [...out].reverse(); // created_at DESC (insertion order)
  if (st.limitN) out = out.slice(0, st.limitN);
  let data: unknown = single ? (out[0] ?? null) : out;
  if (single && data && st.selectStr?.includes("run:study_analysis_runs")) {
    const run = db.runs.find((r) => r.id === (data as { analysis_run_id?: string }).analysis_run_id);
    data = { ...(data as object), run: run ? { study_id: run.study_id } : undefined };
  }
  return { data, error: null };
}

const supabaseAdmin = { from: (t: string) => makeChain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });
mock.module("@/lib/studio/study-results-resolve", { namedExports: { resolveStudyResults: async () => ({ access: mockAccess, results: mockAccess === "ok" ? RESULTS : null }) } });

let SVC: typeof import("./study-analysis-service");
before(async () => { SVC = await import("./study-analysis-service"); });
beforeEach(() => { db.runs = []; db.proposals = []; db.seq = 0; db.fail = {}; mockAccess = "ok"; for (const k of Object.keys(extraTables)) delete extraTables[k]; });

const session = { workEmail: "admin@fanometrix", role: "admin" } as unknown as import("@/lib/auth-server").AuthedUser;
const goodCompletion = async () => ({ proposals: [{ type: "observation", headline: "Strong fit leads", explanation: "92 of 274 completed responses selected it.", evidenceRefs: [REF_COMBINED_1] }] });

// ── RUN LIFECYCLE / FAILURE SEMANTICS ────────────────────────────────────────
test("9. successful analysis → run 'completed' with persisted proposals", async () => {
  const out = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  assert.equal(out.access, "ok");
  assert.equal(out.run?.status, "completed");
  assert.equal(out.run?.proposal_count, 1);
  assert.equal(out.proposals.length, 1);
  assert.equal(db.runs.length, 1);
  assert.equal(db.proposals.length, 1);
});

test("3,4. run persists an immutable evidence snapshot + evidence_hash", async () => {
  const out = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  const snap = out.run?.evidence_snapshot as { study: unknown; evidence: unknown[] };
  assert.ok(snap.evidence.length > 0);
  assert.equal(typeof out.run?.evidence_hash, "string");
  assert.ok((out.run?.evidence_hash as string).length >= 32);
});

test("6. persisted proposal refs all resolve into the run's evidence snapshot", async () => {
  const out = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  const refs = new Set((out.run?.evidence_snapshot as { evidence: { ref: string }[] }).evidence.map((e) => e.ref));
  for (const p of out.proposals) for (const r of p.evidence_refs) assert.ok(refs.has(r), `ref ${r} must be in the snapshot`);
});

test("10. provider failure → run 'failed', no proposals", async () => {
  const boom = async () => { throw new Error("provider 502"); };
  const out = await SVC.analyseStudy(session, "STU", { complete: boom as never });
  assert.equal(out.run?.status, "failed");
  assert.match(out.run?.error ?? "", /provider 502/);
  assert.equal(db.proposals.length, 0);
});

test("11,12. validation failure (all rejected) → run 'failed', no misleading partial set", async () => {
  const bad = async () => ({ proposals: [{ type: "observation", headline: "x", explanation: "y", evidenceRefs: ["study#STU|q#NOPE|opt#9|src#combined"] }] });
  const out = await SVC.analyseStudy(session, "STU", { complete: bad as never });
  assert.equal(out.run?.status, "failed");
  assert.equal(db.proposals.length, 0);
});

test("13. proposal persistence failure → run must NOT become 'completed'", async () => {
  db.fail["insert_study_analysis_proposals"] = true;
  const out = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  assert.equal(out.run?.status, "failed");
  assert.notEqual(out.run?.status, "completed");
  assert.equal(db.proposals.length, 0);
});

// ── IMMUTABILITY / RERUN ─────────────────────────────────────────────────────
test("5,6(rerun). rerun creates a NEW run; the first run is unchanged; same hash allowed", async () => {
  const first = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  const second = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  assert.notEqual(first.run?.id, second.run?.id);
  assert.equal(db.runs.length, 2);
  // Evidence unchanged → identical hash is allowed across the two runs.
  assert.equal(first.run?.evidence_hash, second.run?.evidence_hash);
  // First run's provenance untouched.
  const firstReloaded = db.runs.find((r) => r.id === first.run?.id)!;
  assert.equal(firstReloaded.evidence_hash, first.run?.evidence_hash);
  assert.equal(firstReloaded.prompt_version, first.run?.prompt_version);
});

test("1,2. run belongs to Study; proposal belongs to run", async () => {
  const out = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  assert.equal(out.run?.study_id, "STU");
  assert.equal(out.proposals[0].analysis_run_id, out.run?.id);
});

// ── PROPOSAL TYPES PERSIST ───────────────────────────────────────────────────
test("14,15,16. observation / comparison / synthesis all persist", async () => {
  const mixed = async () => ({ proposals: [
    { type: "observation", headline: "Obs", explanation: "92 of 274.", evidenceRefs: [REF_COMBINED_1] },
    { type: "comparison", headline: "S1 vs v2", explanation: "62 of 196 vs 30 of 78.", evidenceRefs: [REF_A1, REF_B1] },
    { type: "synthesis", headline: "Syn", explanation: "Two signals connect.", evidenceRefs: [REF_COMBINED_1, REF_A1] },
  ] });
  const out = await SVC.analyseStudy(session, "STU", { complete: mixed as never });
  assert.deepEqual(out.proposals.map((p) => p.type).sort(), ["comparison", "observation", "synthesis"]);
});

// ── REVIEW: edit / accept / dismiss ──────────────────────────────────────────
async function seedOne() {
  const out = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  return out.proposals[0];
}

test("17,20. edit changes headline/explanation only; evidence refs unchanged", async () => {
  const p = await seedOne();
  const res = await SVC.reviewProposal(session, "STU", p.id, { action: "edit", headline: "New headline", explanation: "New prose." });
  assert.ok(res.ok);
  assert.equal(res.proposal?.headline, "New headline");
  assert.equal(res.proposal?.explanation, "New prose.");
  assert.deepEqual(res.proposal?.evidence_refs, p.evidence_refs); // immutable
  assert.equal(res.proposal?.type, p.type);                       // immutable
  assert.equal(res.proposal?.updated_by, "admin@fanometrix");
  assert.ok(res.proposal?.updated_at);
});

test("18. accept records status + reviewer + time", async () => {
  const p = await seedOne();
  const res = await SVC.reviewProposal(session, "STU", p.id, { action: "accept" });
  assert.equal(res.proposal?.review_status, "accepted");
  assert.equal(res.proposal?.reviewed_by, "admin@fanometrix");
  assert.ok(res.proposal?.reviewed_at);
});

test("19. dismiss records status + reviewer + time (no delete)", async () => {
  const p = await seedOne();
  const res = await SVC.reviewProposal(session, "STU", p.id, { action: "dismiss" });
  assert.equal(res.proposal?.review_status, "dismissed");
  assert.equal(res.proposal?.reviewed_by, "admin@fanometrix");
  assert.equal(db.proposals.length, 1); // still present — history preserved
});

test("21. a proposal can never be 'published' (only proposed/accepted/dismissed exist)", async () => {
  const p = await seedOne();
  // The service exposes no path to 'published'; an unknown action is not applied.
  const res = await SVC.reviewProposal(session, "STU", p.id, { action: "publish" } as never);
  // reviewProposal edit-branch requires headline/explanation; a bogus action falls to edit with nothing → 400.
  assert.equal(res.ok, false);
});

// ── SECURITY (service honours the Study-Manage gate) ─────────────────────────
test("30,31,33. non-manager access is refused (forbidden) for analyse + review", async () => {
  mockAccess = "forbidden";
  const a = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  assert.equal(a.access, "forbidden");
  assert.equal(db.runs.length, 0); // nothing created when unauthorised
  const r = await SVC.reviewProposal(session, "STU", "prop_x", { action: "accept" });
  assert.equal(r.status, 403);
});

test("32. cross-study proposal review fails closed (proposal of another study → 404)", async () => {
  const p = await seedOne();                 // belongs to study STU
  mockAccess = "ok";
  const res = await SVC.reviewProposal(session, "OTHER", p.id, { action: "accept" }); // wrong study in path
  assert.equal(res.status, 404);
});

test("getLatest returns latest run + proposals + bounded history", async () => {
  await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  const latest = await SVC.getLatestStudyAnalysis(session, "STU");
  assert.equal(latest.access, "ok");
  assert.equal(latest.history.length, 2);
  assert.equal(latest.proposals.length, 1);
  assert.equal(latest.run?.id, db.runs[db.runs.length - 1].id); // most recent
});

test("staleness: objective change, no change, and objective-only edit", async () => {
  RESULTS.study.objective = "Assess FedEx as a natural sponsor.";
  await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  assert.deepEqual((await SVC.getLatestStudyAnalysis(session, "STU")).stale, { objectiveChanged: false, membershipChanged: false });
  RESULTS.study.objective = "Assess FedEx AND measure activation appetite.";
  assert.deepEqual((await SVC.getLatestStudyAnalysis(session, "STU")).stale, { objectiveChanged: true, membershipChanged: false });
  RESULTS.study.objective = null; // restore
});

test("staleness: membership by SET — add / remove / same-count swap flag; reorder does NOT", async () => {
  RESULTS.surveys = [{ surveyId: "A" }, { surveyId: "B" }];
  await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });

  RESULTS.surveys = [{ surveyId: "A" }, { surveyId: "B" }, { surveyId: "C" }]; // add
  assert.equal((await SVC.getLatestStudyAnalysis(session, "STU")).stale?.membershipChanged, true);

  RESULTS.surveys = [{ surveyId: "A" }]; // remove
  assert.equal((await SVC.getLatestStudyAnalysis(session, "STU")).stale?.membershipChanged, true);

  RESULTS.surveys = [{ surveyId: "A" }, { surveyId: "C" }]; // SAME-COUNT SWAP (the fixed weakness)
  assert.equal((await SVC.getLatestStudyAnalysis(session, "STU")).stale?.membershipChanged, true);

  RESULTS.surveys = [{ surveyId: "B" }, { surveyId: "A" }]; // reorder only
  assert.equal((await SVC.getLatestStudyAnalysis(session, "STU")).stale?.membershipChanged, false);

  RESULTS.surveys = [{ surveyId: "A" }, { surveyId: "B" }]; // restore
});

test("the Study narrative is frozen in the run snapshot and returned by getLatest", async () => {
  const withNarrative = async () => ({
    narrative: { headline: "Credible fit, weaker visibility", summary: "92 of 274 see a strong fit for the sponsorship.", evidenceRefs: [REF_COMBINED_1] },
    proposals: [{ type: "observation", headline: "Strong fit leads", explanation: "92 of 274.", evidenceRefs: [REF_COMBINED_1] }],
  });
  await SVC.analyseStudy(session, "STU", { complete: withNarrative as never });
  const gl = await SVC.getLatestStudyAnalysis(session, "STU");
  assert.equal(gl.narrative?.headline, "Credible fit, weaker visibility");
  assert.deepEqual(gl.narrative?.evidenceRefs, [REF_COMBINED_1]);
  // No schema change: the narrative lives inside the run's evidence_snapshot output.
  assert.equal((gl.run?.evidence_snapshot as { narrative?: { headline: string } }).narrative?.headline, "Credible fit, weaker visibility");
});

// Branch on the PROMPT (robust to the number of analyst passes): analyst → proposals;
// first projection → invalid narrative (triggers repair); repair → a valid narrative.
const isAnalystPrompt = (p: string) => p.toLowerCase().includes("broad first-pass review of one section");
const isRepairPrompt = (p: string) => p.includes("previous narrative draft was rejected");

test("narrative repair: one extra call fixes an invalid narrative; proposals untouched", async () => {
  let projection = 0, repair = 0;
  const complete = async ({ prompt }: { prompt: string }) => {
    if (isAnalystPrompt(prompt)) return { proposals: [{ type: "observation", headline: "Strong fit", explanation: "92 of 274.", evidenceRefs: [REF_COMBINED_1] }] };
    if (isRepairPrompt(prompt)) { repair++; return { narrative: { headline: "Repaired verdict", summary: "92 of 274 see a strong fit.", evidenceRefs: [REF_COMBINED_1] } }; }
    projection++; return { narrative: { headline: "bad", summary: "s", evidenceRefs: ["study#STU|q#NOPE|opt#9|src#combined"] } }; // invalid → triggers repair
  };
  await SVC.analyseStudy(session, "STU", { complete: complete as never });
  const gl = await SVC.getLatestStudyAnalysis(session, "STU");
  assert.equal(gl.narrative?.headline, "Repaired verdict");
  assert.equal(projection, 1, "one projection call");
  assert.equal(repair, 1, "exactly one repair attempt");
  assert.equal(gl.proposals.length, 1); // proposals not regenerated by projection/repair
});

test("narrative repair failure degrades gracefully (proposals still complete, no narrative)", async () => {
  const complete = async ({ prompt }: { prompt: string }) => {
    if (isAnalystPrompt(prompt)) return { proposals: [{ type: "observation", headline: "Strong fit", explanation: "92 of 274.", evidenceRefs: [REF_COMBINED_1] }] };
    throw new Error("narrative provider down"); // projection + repair both fail
  };
  const out = await SVC.analyseStudy(session, "STU", { complete: complete as never });
  assert.equal(out.run?.status, "completed"); // run still completes
  const gl = await SVC.getLatestStudyAnalysis(session, "STU");
  assert.equal(gl.narrative, null);
  assert.equal(gl.proposals.length, 1);
});

test("proposal priority (key/supporting) is persisted in the snapshot and returned by getLatest", async () => {
  const mixed = async () => ({
    narrative: { headline: "H", summary: "e1.", evidenceRefs: [REF_COMBINED_1] },
    proposals: [
      { type: "observation", priority: "key", headline: "Key one", explanation: "92 of 274.", evidenceRefs: [REF_COMBINED_1] },
      { type: "observation", priority: "supporting", headline: "Secondary one", explanation: "85 of 274.", evidenceRefs: [REF_A1] },
    ],
  });
  await SVC.analyseStudy(session, "STU", { complete: mixed as never });
  const gl = await SVC.getLatestStudyAnalysis(session, "STU");
  const byHead = new Map(gl.proposals.map((p) => [p.headline, p.priority]));
  assert.equal(byHead.get("Key one"), "key");
  assert.equal(byHead.get("Secondary one"), "supporting");
});

test("coverage metadata is deterministic from the snapshot (no chain-of-thought)", async () => {
  await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  const gl = await SVC.getLatestStudyAnalysis(session, "STU");
  assert.deepEqual(gl.coverage, { surveys: 2, questions: 1, evidencePoints: (gl.run?.evidence_snapshot as { evidence: unknown[] }).evidence.length });
});

test("getLatest projects a proposal→finding link so the UI knows the added state", async () => {
  const out = await SVC.analyseStudy(session, "STU", { complete: goodCompletion as never });
  const pid = out.proposals[0].id;
  // No finding yet → findingId null.
  const before = await SVC.getLatestStudyAnalysis(session, "STU");
  assert.equal(before.proposals[0].findingId, null);
  // Simulate a Finding created for that proposal.
  storeFor("study_findings").push({ id: "F1", origin_analysis_proposal_id: pid });
  const after = await SVC.getLatestStudyAnalysis(session, "STU");
  assert.equal(after.proposals[0].findingId, "F1");
});
