import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { evidenceRef, type EvidenceItem } from "./study-analysis";
import type { OptionResult } from "./survey-results";

// ── Hermetic Study Finding service tests ─────────────────────────────────────
// Stateful in-memory fake for @/lib/supabase-admin covering studies,
// study_analysis_proposals(+run join), study_findings, study_finding_evidence; plus a
// mocked resolveStudyResults for the manual path. No DB, no network, no LLM. Live
// end-to-end persistence is proven by the FedEx QA harness.

const opt = (id: string, label: string, count: number, base: number): OptionResult => ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });
const RESULTS = {
  study: { id: "STU", name: "FedEx", objective: null as string | null, status: "draft", surveyCount: 2, completedResponses: 274 },
  resultGroups: [{
    canonicalQuestionKey: "qk1", label: "FedEx as a sponsor?", comparability: "combined" as const,
    combined: { base: 274, sourceCount: 2, options: [opt("1", "Strong fit", 92, 274), opt("2", "Unclear", 85, 274)] },
    sources: [
      { surveyId: "A", surveyName: "Survey 1", questionIndex: 0, questionId: "qk1", canonicalQuestionKey: "qk1", label: "FedEx as a sponsor?", resultMode: "historical" as const, completedResponses: 196, base: 196, shown: null, displayLanguage: "en", options: [opt("1", "Strong fit", 62, 196)] },
      { surveyId: "B", surveyName: "Survey v2", questionIndex: 0, questionId: "qk1", canonicalQuestionKey: "qk1", label: "FedEx as a sponsor?", resultMode: "historical" as const, completedResponses: 78, base: 78, shown: null, displayLanguage: "en", options: [opt("1", "Strong fit", 30, 78)] },
    ],
  }],
};
const REF_COMBINED_1 = evidenceRef("STU", "qk1", "1", "combined");
const REF_A1 = evidenceRef("STU", "qk1", "1", "survey", "A");

// Governed DERIVED + SEGMENT facts that live in the run snapshot (not in `.evidence`).
const DERIVED_REF = "derived:leader:study#STU|q#qk1";
const DERIVED_ITEM = { ref: DERIVED_REF, kind: "leader", canonicalQuestionKey: "qk1", question: "FedEx as a sponsor?", label: 'Leading option "Strong fit" (33.6%), ahead of "Unclear" (31.0%) by 2.6pp', value: 2.6, unit: "pp", inputRefs: [REF_COMBINED_1], detail: { leader: "Strong fit" } };
const SEGMENT_REF = "derived:seg-concentration:study#STU|q#qk1|dim#country|opt#2|grp#Germany";
const SEGMENT_ITEM = { ref: SEGMENT_REF, kind: "seg_concentration", canonicalQuestionKey: "qk1", question: "FedEx as a sponsor?", dimension: "country", label: '"Never noticed them" is chosen by 40.9% of Germany respondents, compared with 24.8% overall', value: 16.1, unit: "pp", inputRefs: [], detail: { group: "Germany" } };

// Build the analysis-run evidence snapshot the same way the server does.
function snapshotEvidence(): EvidenceItem[] {
  const g = RESULTS.resultGroups[0];
  const items: EvidenceItem[] = [];
  for (const o of g.combined.options) items.push({ ref: evidenceRef("STU", g.canonicalQuestionKey, o.optionId, "combined"), canonicalQuestionKey: g.canonicalQuestionKey, question: g.label, comparability: "combined", scope: "combined", surveyId: null, surveyName: null, questionId: null, questionIndex: null, optionId: o.optionId, optionLabel: o.label, count: o.count, base: g.combined.base, percentage: o.percentage, resultMode: null });
  for (const s of g.sources) for (const o of s.options) items.push({ ref: evidenceRef("STU", g.canonicalQuestionKey, o.optionId, "survey", s.surveyId), canonicalQuestionKey: g.canonicalQuestionKey, question: g.label, comparability: "combined", scope: "survey", surveyId: s.surveyId, surveyName: s.surveyName, questionId: s.questionId, questionIndex: s.questionIndex, optionId: o.optionId, optionLabel: o.label, count: o.count, base: s.base, percentage: o.percentage, resultMode: "historical" });
  return items;
}

type Row = Record<string, unknown>;
const db: { tables: Record<string, Row[]>; seq: number } = { tables: {}, seq: 0 };
const tbl = (t: string) => (db.tables[t] ??= []);

function makeChain(table: string) {
  const st: { table: string; filters: [string, unknown][]; ins: Row[] | null; upd: Row | null; del: boolean; selStr: string; head: boolean; count: boolean; mode: string | null } =
    { table, filters: [], ins: null, upd: null, del: false, selStr: "*", head: false, count: false, mode: null };
  const chain: Record<string, unknown> = {
    select(str?: string, opts?: { head?: boolean; count?: string }) { st.selStr = str ?? "*"; st.head = !!opts?.head; st.count = !!opts?.count; if (!st.mode) st.mode = "select"; return chain; },
    insert(p: Row | Row[]) { st.mode = "insert"; st.ins = Array.isArray(p) ? p : [p]; return chain; },
    update(p: Row) { st.mode = "update"; st.upd = p; return chain; },
    delete() { st.mode = "delete"; st.del = true; return chain; },
    eq(c: string, v: unknown) { st.filters.push([c, v]); return chain; },
    in(c: string, arr: unknown[]) { st.filters.push([`__in__${c}`, arr]); return chain; },
    order() { return chain; },
    limit() { return chain; },
    single() { return Promise.resolve(term(st, "single")); },
    maybeSingle() { return Promise.resolve(term(st, "maybe")); },
    then(res: (x: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(term(st, "many")).then(res, rej); },
  };
  return chain;
}
function match(rows: Row[], filters: [string, unknown][]) {
  return rows.filter((r) => filters.every(([c, v]) => (c.startsWith("__in__") ? (v as unknown[]).includes(r[c.slice(6)]) : r[c] === v)));
}
function term(st: { table: string; filters: [string, unknown][]; ins: Row[] | null; upd: Row | null; del: boolean; selStr: string; head: boolean; count: boolean; mode: string | null }, shape: "single" | "maybe" | "many") {
  const rows = tbl(st.table);
  if (st.mode === "insert") {
    const now = new Date().toISOString();
    const inserted = st.ins!.map((r) => { const row = { id: `${st.table}_${++db.seq}`, created_at: now, ...r }; rows.push(row); return row; });
    return { data: shape === "many" ? inserted : inserted[0], error: null };
  }
  if (st.mode === "update") {
    const target = match(rows, st.filters);
    for (const r of target) Object.assign(r, st.upd);
    return { data: shape === "many" ? target : (target[0] ?? null), error: null };
  }
  if (st.mode === "delete") { const keep = new Set(match(rows, st.filters)); db.tables[st.table] = rows.filter((r) => !keep.has(r)); return { data: null, error: null }; }
  // select
  let out = match(rows, st.filters);
  if (st.count || st.head) return { count: out.length, data: null, error: null };
  // join: study_analysis_proposals -> run
  if (st.selStr.includes("run:study_analysis_runs")) out = out.map((r) => ({ ...r, run: tbl("study_analysis_runs").find((x) => x.id === r.analysis_run_id) }));
  if (shape === "many") return { data: out, error: null };
  return { data: out[0] ?? null, error: null };
}

const supabaseAdmin = { from: (t: string) => makeChain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });
mock.module("@/lib/studio/study-results-resolve", { namedExports: { resolveStudyResults: async () => ({ access: "ok", results: RESULTS }) } });

let SVC: typeof import("./study-finding-service");
before(async () => { SVC = await import("./study-finding-service"); });
beforeEach(() => {
  db.tables = {}; db.seq = 0;
  tbl("studies").push({ id: "STU", name: "FedEx" });
  // Deep-clone the derived/segment fixtures so a test mutating the run snapshot (EF13)
  // never leaks into another test via a shared object reference.
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  tbl("study_analysis_runs").push({ id: "RUN1", study_id: "STU", evidence_snapshot: { study: RESULTS.study, evidence: snapshotEvidence(), derived: [clone(DERIVED_ITEM)], segmentDerived: [clone(SEGMENT_ITEM)] } });
  tbl("study_analysis_proposals").push({ id: "PROP1", analysis_run_id: "RUN1", review_status: "accepted", evidence_refs: [REF_COMBINED_1, REF_A1], headline: "Strong fit leads", explanation: "92 of 274." });
});
/** Seed a proposal citing arbitrary refs (all classes), then add it to Findings. */
function seedProp(id: string, refs: string[]) { tbl("study_analysis_proposals").push({ id, analysis_run_id: "RUN1", review_status: "accepted", evidence_refs: refs, headline: `H ${id}`, explanation: "e" }); }

const admin = { workEmail: "admin@fanometrix", role: "admin" } as unknown as import("@/lib/auth-server").AuthedUser;
const brand = { workEmail: "brand@x", role: "brand" } as unknown as import("@/lib/auth-server").AuthedUser;

// ── ANALYSIS → FINDING ───────────────────────────────────────────────────────
test("11,19,20. accepted proposal → draft Finding; evidence copied EXACTLY from run snapshot; origin recorded", async () => {
  const r = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  assert.equal(r.ok, true); assert.equal(r.data?.finding.status, "draft");
  assert.equal(r.data?.finding.origin_type, "analysis_proposal");
  assert.equal(r.data?.finding.origin_analysis_proposal_id, "PROP1");
  assert.equal(r.data?.evidence.length, 2);
  const snap = snapshotEvidence();
  const first = r.data!.evidence[0].evidence_snapshot as Record<string, unknown>;
  // Exact copy of the governed base item, tagged with its evidence class.
  assert.deepEqual(first, { evidenceClass: "base", ...snap.find((e) => e.ref === REF_COMBINED_1) });
  assert.equal(first.count, 92); assert.equal(first.base, 274);
});

test("7. evidence order (position) preserved from the proposal ref order", async () => {
  const r = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  assert.deepEqual(r.data?.evidence.map((e) => [e.position, e.evidence_ref]), [[0, REF_COMBINED_1], [1, REF_A1]]);
});

test("12. a still-'proposed' proposal is auto-accepted and added in one action", async () => {
  tbl("study_analysis_proposals")[0].review_status = "proposed";
  const r = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  assert.equal(r.ok, true);
  assert.equal(r.status, 201);
  assert.equal(tbl("study_analysis_proposals")[0].review_status, "accepted"); // audit state retained
});

test("13. a dismissed proposal cannot be added to findings", async () => {
  tbl("study_analysis_proposals")[0].review_status = "dismissed";
  assert.equal((await SVC.createFindingFromProposal(admin, "STU", "PROP1", {})).status, 409);
  assert.equal((db.tables["study_findings"] ?? []).length, 0);
});

test("14. proposal from another Study fails closed (404)", async () => {
  const r = await SVC.createFindingFromProposal(admin, "OTHER", "PROP1", {});
  assert.equal(r.status, 404);
});

test("16. a proposal citing an unresolvable ref fails closed (422), no Finding created", async () => {
  tbl("study_analysis_proposals")[0].evidence_refs = ["study#STU|q#NOPE|opt#9|src#combined"];
  const r = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  assert.equal(r.status, 422);
  assert.equal((db.tables["study_findings"] ?? []).length, 0);
});

test("17,18. client-supplied numbers/evidence are ignored — only headline/commentary honoured", async () => {
  const r = await SVC.createFindingFromProposal(admin, "STU", "PROP1", { headline: "My headline", commentary: "My note" } as Record<string, unknown>);
  assert.equal(r.data?.finding.headline, "My headline");
  // Evidence still comes from the snapshot, not from any client field.
  assert.equal((r.data?.evidence[0].evidence_snapshot as { count?: number }).count, 92);
});

test("21. add-to-findings is idempotent — a repeat returns the SAME finding, no error", async () => {
  const first = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  assert.equal(first.ok, true);
  const second = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  assert.equal(second.ok, true);
  assert.equal(second.status, 200);           // idempotent success, not a 409 error
  assert.equal(second.data?.finding.id, first.data?.finding.id);
  assert.equal((db.tables["study_findings"] ?? []).length, 1); // still only one finding
});

// ── MANUAL ───────────────────────────────────────────────────────────────────
test("22,23,24. manual Finding from one governed result — server-resolved, no AI, origin manual", async () => {
  const r = await SVC.createManualFinding(admin, "STU", REF_COMBINED_1, { headline: "Manual finding" });
  assert.equal(r.ok, true);
  assert.equal(r.data?.finding.origin_type, "manual");
  assert.equal(r.data?.finding.origin_analysis_proposal_id, null);
  assert.equal(r.data?.evidence.length, 1);
  assert.equal((r.data?.evidence[0].evidence_snapshot as { count?: number }).count, 92); // server-resolved
});

test("manual Finding with an invalid ref is rejected (422)", async () => {
  const r = await SVC.createManualFinding(admin, "STU", "study#STU|q#NOPE|opt#9|src#combined", { headline: "x" });
  assert.equal(r.status, 422);
});

test("manual Finding requires a headline", async () => {
  assert.equal((await SVC.createManualFinding(admin, "STU", REF_COMBINED_1, { headline: "" })).status, 400);
});

test("same result may back multiple manual Findings (no cross-Finding dedupe)", async () => {
  assert.equal((await SVC.createManualFinding(admin, "STU", REF_COMBINED_1, { headline: "One" })).ok, true);
  assert.equal((await SVC.createManualFinding(admin, "STU", REF_COMBINED_1, { headline: "Two" })).ok, true);
  assert.equal((db.tables["study_findings"] ?? []).length, 2);
});

// ── EDIT / PUBLISH ───────────────────────────────────────────────────────────
test("10,28. edit changes prose only; evidence rows untouched", async () => {
  const c = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  const fid = c.data!.finding.id;
  const before = (db.tables["study_finding_evidence"] ?? []).filter((e) => e.finding_id === fid).map((e) => ({ ...e }));
  const r = await SVC.editFinding(admin, "STU", fid, { headline: "Edited", commentary: "New" });
  assert.equal(r.data?.finding.headline, "Edited");
  assert.equal(r.data?.finding.updated_by, "admin@fanometrix");
  const after = (db.tables["study_finding_evidence"] ?? []).filter((e) => e.finding_id === fid);
  assert.deepEqual(after, before); // evidence immutable
});

test("25,27,28,29. publish sets published stamps; does not touch evidence", async () => {
  const c = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  const fid = c.data!.finding.id;
  const evBefore = (db.tables["study_finding_evidence"] ?? []).filter((e) => e.finding_id === fid).map((e) => ({ ...e }));
  const r = await SVC.publishFinding(admin, "STU", fid);
  assert.equal(r.data?.finding.status, "published");
  assert.equal(r.data?.finding.published_by, "admin@fanometrix");
  assert.ok(r.data?.finding.published_at);
  assert.deepEqual((db.tables["study_finding_evidence"] ?? []).filter((e) => e.finding_id === fid), evBefore);
});

test("26. a Finding with zero evidence cannot publish", async () => {
  // Seed a finding row directly with no evidence.
  tbl("study_findings").push({ id: "F_EMPTY", study_id: "STU", headline: "H", status: "draft", origin_type: "manual", published_at: null, published_by: null });
  const r = await SVC.publishFinding(admin, "STU", "F_EMPTY");
  assert.equal(r.status, 409);
});

// ── ACCESS ─────────────────────────────────────────────────────────────────
test("31,32,34. admin curates; non-admin (even with data) denied 403", async () => {
  assert.equal((await SVC.createFindingFromProposal(admin, "STU", "PROP1", {})).ok, true);
  const denied = await SVC.createFindingFromProposal(brand, "STU", "PROP1", {});
  assert.equal(denied.status, 403);
  assert.equal((await SVC.listFindings(brand, "STU")).status, 403);
});

test("33. cross-study / unknown study fails closed (404)", async () => {
  assert.equal((await SVC.listFindings(admin, "GHOST")).status, 404);
});

// ── DURABILITY (architectural: evidence is copied, independent of the proposal) ─
test("37. Finding evidence is copied — it does not merely point at the proposal/run", async () => {
  const c = await SVC.createFindingFromProposal(admin, "STU", "PROP1", {});
  const fid = c.data!.finding.id;
  // Remove Analysis working history entirely.
  db.tables["study_analysis_proposals"] = [];
  db.tables["study_analysis_runs"] = [];
  const got = await SVC.getFinding(admin, "STU", fid);
  assert.equal(got.ok, true);
  assert.equal(got.data?.evidence.length, 2); // evidence still fully present
  assert.equal(got.data?.evidence[0].count, 92);
});

// ══ EVIDENCE-FREEZING CONTRACT MATRIX (base | derived | segment) ═══════════════
// 1. base-only proposal → Finding
test("EF1. base-only proposal freezes as a Finding", async () => {
  seedProp("P_BASE", [REF_COMBINED_1]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_BASE", {});
  assert.equal(r.ok, true);
  assert.equal((r.data!.evidence[0].evidence_snapshot as { evidenceClass: string }).evidenceClass, "base");
});
// 2. derived-only proposal → Finding (the FedEx failure case)
test("EF2. derived-only proposal (2.6pp lead) now freezes as a Finding", async () => {
  seedProp("P_DER", [DERIVED_REF]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_DER", {});
  assert.equal(r.ok, true, r.error);
  const snap = r.data!.evidence[0].evidence_snapshot as { evidenceClass: string; label: string };
  assert.equal(snap.evidenceClass, "derived");
  assert.match(snap.label, /2\.6pp/); // the governed computed fact is frozen verbatim
});
// 3. segment-only proposal → Finding
test("EF3. segment-only proposal (Germany) now freezes as a Finding", async () => {
  seedProp("P_SEG", [SEGMENT_REF]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_SEG", {});
  assert.equal(r.ok, true, r.error);
  const snap = r.data!.evidence[0].evidence_snapshot as { evidenceClass: string; dimension: string };
  assert.equal(snap.evidenceClass, "segment");
  assert.equal(snap.dimension, "country");
});
// 4-7. mixtures
test("EF4. base + derived freezes both", async () => {
  seedProp("P_BD", [REF_COMBINED_1, DERIVED_REF]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_BD", {});
  assert.equal(r.ok, true);
  assert.deepEqual(r.data!.evidence.map((e) => (e.evidence_snapshot as { evidenceClass: string }).evidenceClass), ["base", "derived"]);
});
test("EF5. base + segment freezes both", async () => {
  seedProp("P_BS", [REF_COMBINED_1, SEGMENT_REF]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_BS", {});
  assert.deepEqual(r.data!.evidence.map((e) => (e.evidence_snapshot as { evidenceClass: string }).evidenceClass), ["base", "segment"]);
});
test("EF6. derived + segment freezes both", async () => {
  seedProp("P_DS", [DERIVED_REF, SEGMENT_REF]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_DS", {});
  assert.deepEqual(r.data!.evidence.map((e) => (e.evidence_snapshot as { evidenceClass: string }).evidenceClass), ["derived", "segment"]);
});
test("EF7. base + derived + segment freezes all three, in ref order", async () => {
  seedProp("P_BDS", [REF_COMBINED_1, DERIVED_REF, SEGMENT_REF]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_BDS", {});
  assert.equal(r.data!.evidence.length, 3);
  assert.deepEqual(r.data!.evidence.map((e) => (e.evidence_snapshot as { evidenceClass: string }).evidenceClass), ["base", "derived", "segment"]);
});
// 8-11. fail-safe on unresolved / malformed refs
for (const [label, id, refs] of [
  ["EF8 unresolved base", "P_UB", ["study#STU|q#NOPE|opt#9|src#combined"]],
  ["EF9 unresolved derived", "P_UD", ["derived:leader:study#STU|q#NOPE"]],
  ["EF10 unresolved segment", "P_US", ["derived:seg-spread:study#STU|q#NOPE|dim#country|opt#1"]],
  ["EF11 malformed ref", "P_MAL", ["!!!garbage!!!"]],
] as [string, string, string[]][]) {
  test(`${label} ref → fails safely (422, no Finding, friendly message)`, async () => {
    seedProp(id, refs);
    const r = await SVC.createFindingFromProposal(admin, "STU", id, {});
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
    assert.match(r.error ?? "", /can't be added to Findings/); // no ref counts / jargon
    assert.equal((db.tables["study_findings"] ?? []).length, 0); // nothing persisted
  });
}
// 12. never a partially-complete Finding — one bad ref fails the whole add
test("EF12. one unresolved ref among valid ones → NOTHING is silently dropped (422, no Finding)", async () => {
  seedProp("P_PARTIAL", [REF_COMBINED_1, DERIVED_REF, "derived:leader:study#STU|q#GONE"]);
  const r = await SVC.createFindingFromProposal(admin, "STU", "P_PARTIAL", {});
  assert.equal(r.status, 422);
  assert.equal((db.tables["study_findings"] ?? []).length, 0);
  assert.equal((db.tables["study_finding_evidence"] ?? []).length, 0);
});
// 13-15. frozen evidence survives later Analysis / Study changes
test("EF13,14,15. frozen evidence survives a later rerun / objective / membership change", async () => {
  seedProp("P_FREEZE", [DERIVED_REF, SEGMENT_REF]);
  const c = await SVC.createFindingFromProposal(admin, "STU", "P_FREEZE", {});
  const fid = c.data!.finding.id;
  // Simulate run B: the run snapshot's derived label changes; the objective + membership change.
  (tbl("study_analysis_runs")[0].evidence_snapshot as { derived: { label: string }[] }).derived[0].label = "CHANGED BY RERUN";
  RESULTS.study.objective = "A DIFFERENT OBJECTIVE";
  const got = await SVC.getFinding(admin, "STU", fid);
  assert.equal(got.data?.evidence[0].label.includes("2.6pp"), true); // still the ORIGINAL run-A fact
  assert.equal(got.data?.evidence[0].label.includes("CHANGED"), false);
  RESULTS.study.objective = null; // restore fixture
});
// 16. wording edit never mutates evidence
test("EF16. editing a Finding's wording does not mutate its frozen evidence", async () => {
  seedProp("P_EDIT", [DERIVED_REF]);
  const c = await SVC.createFindingFromProposal(admin, "STU", "P_EDIT", {});
  const fid = c.data!.finding.id;
  const before = (await SVC.getFinding(admin, "STU", fid)).data!.evidence[0].label;
  await SVC.editFinding(admin, "STU", fid, { headline: "Reworded headline" });
  const after = (await SVC.getFinding(admin, "STU", fid)).data!.evidence[0].label;
  assert.equal(after, before); // evidence untouched
});
// 17,18. derived + segment display intelligibly, no refs
test("EF17,18. derived + segment evidence display as clean governed facts (no refs)", async () => {
  seedProp("P_DISP", [DERIVED_REF, SEGMENT_REF]);
  const c = await SVC.createFindingFromProposal(admin, "STU", "P_DISP", {});
  const ev = (await SVC.getFinding(admin, "STU", c.data!.finding.id)).data!.evidence;
  assert.match(ev[0].label, /Leading option/);   // derived reads as a sentence
  assert.match(ev[1].label, /Germany respondents/); // segment reads as a sentence
  for (const e of ev) { assert.doesNotMatch(e.label, /derived:|study#|dim#|e\d+/); assert.ok(e.evidenceClass); }
});
// 19. provenance → originating run
test("EF19. provenance: the Finding records its originating Analysis proposal/run", async () => {
  seedProp("P_PROV", [DERIVED_REF]);
  const c = await SVC.createFindingFromProposal(admin, "STU", "P_PROV", {});
  assert.equal(c.data?.finding.origin_type, "analysis_proposal");
  assert.equal(c.data?.finding.origin_analysis_proposal_id, "P_PROV");
});
// 20. historical (untagged, base-only) Finding evidence still loads
test("EF20. a historical untagged base-only Finding row still loads as base", async () => {
  const f = { id: "F_HIST", study_id: "STU", headline: "Legacy", commentary: null, status: "draft", origin_type: "manual", origin_analysis_proposal_id: null, created_by: null, created_at: "t", updated_by: null, updated_at: null, published_by: null, published_at: null };
  tbl("study_findings").push(f);
  const raw = snapshotEvidence().find((e) => e.ref === REF_COMBINED_1)!; // NO evidenceClass tag (historical)
  tbl("study_finding_evidence").push({ id: "EV_HIST", finding_id: "F_HIST", position: 0, evidence_ref: raw.ref, evidence_snapshot: raw });
  const got = await SVC.getFinding(admin, "STU", "F_HIST");
  assert.equal(got.ok, true);
  assert.equal(got.data?.evidence[0].evidenceClass, "base"); // inferred, backward-compatible
  assert.equal(got.data?.evidence[0].count, 92);
});
