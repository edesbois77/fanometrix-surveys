import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Hermetic report-service tests: fake supabase-admin + mocked resolveStudyResults /
// getLatestStudyAnalysis, and an INJECTED composer (opts.complete). No DB, no network, no LLM.

type Row = Record<string, unknown>;
const db: { tables: Record<string, Row[]>; seq: number } = { tables: {}, seq: 0 };
const tbl = (t: string) => (db.tables[t] ??= []);
function chain(table: string) {
  const st: { table: string; filters: [string, unknown][]; ins: Row[] | null; upd: Row | null; sel: string } = { table, filters: [], ins: null, upd: null, sel: "*" };
  const c: Record<string, unknown> = {
    select(s?: string, o?: { head?: boolean; count?: string }) { st.sel = s ?? "*"; if (o?.head || o?.count) c.__count = true; return c; },
    insert(p: Row | Row[]) { st.ins = Array.isArray(p) ? p : [p]; return c; },
    update(p: Row) { st.upd = p; return c; },
    eq(k: string, v: unknown) { st.filters.push([k, v]); return c; },
    in(k: string, arr: unknown[]) { st.filters.push([`__in__${k}`, arr]); return c; },
    order() { return c; }, limit() { return c; },
    single() { return Promise.resolve(term(st, "single")); },
    maybeSingle() { return Promise.resolve(term(st, "single")); },
    then(res: (x: unknown) => unknown) { return Promise.resolve(term(st, "many")).then(res); },
  };
  return c;
}
const match = (rows: Row[], f: [string, unknown][]) => rows.filter((r) => f.every(([k, v]) => (k.startsWith("__in__") ? (v as unknown[]).includes(r[k.slice(6)]) : r[k] === v)));
function term(st: { table: string; filters: [string, unknown][]; ins: Row[] | null; upd: Row | null; sel: string }, shape: "single" | "many") {
  const rows = tbl(st.table);
  if (st.ins) { const now = new Date().toISOString(); const made = st.ins.map((r) => { const row = { id: `${st.table}_${++db.seq}`, created_at: now, updated_at: now, ...r }; rows.push(row); return row; }); return { data: shape === "single" ? made[0] : made, error: null }; }
  if (st.upd) { const t = match(rows, st.filters); t.forEach((r) => Object.assign(r, st.upd)); return { data: shape === "single" ? t[0] : t, error: null }; }
  const out = match(rows, st.filters); return { data: shape === "single" ? (out[0] ?? null) : out, error: null };
}
const supabaseAdmin = { from: (t: string) => chain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

const RESULTS = { study: { id: "STU", name: "FedEx UCL Study", objective: "Assess FedEx as a UCL sponsor.", completedResponses: 274 }, surveys: [{ surveyId: "A", surveyName: "Survey 1", completedResponses: 196 }, { surveyId: "B", surveyName: "Survey v2", completedResponses: 78 }] };
mock.module("@/lib/studio/study-results-resolve", { namedExports: { resolveStudyResults: async () => ({ access: "ok", results: RESULTS }) } });

const RUN_SNAPSHOT = { evidence: [
  { canonicalQuestionKey: "q_fit", question: "FedEx as a UCL sponsor?", scope: "combined", optionId: "1", optionLabel: "Strong natural fit", count: 92, base: 274, percentage: 0.336 },
  { canonicalQuestionKey: "q_fit", question: "FedEx as a UCL sponsor?", scope: "combined", optionId: "2", optionLabel: "Relevant but unclear", count: 85, base: 274, percentage: 0.31 },
], segmentDerived: [{ detail: { groups: [{ group: "France" }, { group: "Germany" }] } }] };
mock.module("@/lib/studio/study-analysis-service", { namedExports: { getLatestStudyAnalysis: async () => ({ run: { id: "RUN1", evidence_snapshot: RUN_SNAPSHOT }, narrative: { headline: "Credible fit", summary: "Fit is real." }, themes: [{ title: "Fit", interpretation: "…" }] }) } });

let SVC: typeof import("./report-service");
before(async () => { SVC = await import("./report-service"); });
beforeEach(() => {
  db.tables = {}; db.seq = 0;
  tbl("studies").push({ id: "STU" });
  // Two findings; one has a base stat, one a derived fact.
  tbl("study_findings").push({ id: "F1", study_id: "STU", headline: "Strong natural fit leads", commentary: "Fit leads at 33.6%." });
  tbl("study_findings").push({ id: "F2", study_id: "STU", headline: "A minority find it unclear", commentary: "31% unclear." });
  tbl("study_finding_evidence").push({ finding_id: "F1", position: 0, evidence_snapshot: { evidenceClass: "derived", ref: "d1", kind: "leader", canonicalQuestionKey: "q_fit", question: "FedEx as a UCL sponsor?", label: 'Leading option "Strong natural fit" (33.6%) ahead of "Relevant but unclear" (31%) by 2.6pp' } });
  tbl("study_finding_evidence").push({ finding_id: "F2", position: 0, evidence_snapshot: { evidenceClass: "base", ref: "b1", canonicalQuestionKey: "q_fit", question: "FedEx as a UCL sponsor?", optionLabel: "Relevant but unclear", count: 85, base: 274, percentage: 0.31, scope: "combined", surveyId: null, surveyName: null } });
});
const admin = { workEmail: "admin@fx", role: "admin" } as unknown as import("@/lib/auth-server").AuthedUser;
const brand = { workEmail: "b@x", role: "brand" } as unknown as import("@/lib/auth-server").AuthedUser;

// A composer fake that only references findings it was actually given (proves selection).
const goodComposer = async ({ prompt }: { prompt: string }) => {
  const ids = [...prompt.matchAll(/FINDING (F\d)/g)].map((m) => m[1]);
  return { title: "FedEx Report", executive: { headline: "The fit is credible but recognition is uneven", summary: "A plurality see a fit; a minority find it unclear." }, themes: [{ heading: "The sponsorship fit is credible", interpretation: "Fit is real.", findingIds: ids, archetype: "narrative" }], implications: [{ text: "Make the sponsorship more visible.", findingIds: ids }] };
};

test("23. non-curator is forbidden", async () => {
  assert.equal((await SVC.generateReport(brand, "STU", {})).status, 403);
});

// A governed executive PLAN (Slice A.2 shape) — hero labels are governed q_fit options.
const execPlanComposer = async () => ({
  headline: "Fit is credible but recognition is uneven",
  whatWeFound: "A plurality see a strong natural fit; a similar share find the sponsorship unclear.",
  hero: { mode: "tension", primaryOption: "Strong natural fit", tensionOption: "Relevant but unclear" },
  bottomLine: { text: "Credible fit is offset by unclear recognition, so activation must make the sponsorship legible.", form: "tension" },
});

test("Slice A. composeExecutivePage builds ONE governed Executive page from a verified editorial plan (no persistence)", async () => {
  const r = await SVC.resolveReportInput(admin, "STU");
  assert.equal(r.access, "ok");
  const out = await SVC.composeExecutivePage(r.input!, r.governance!, { complete: execPlanComposer as never });
  assert.equal(out.ok, true, out.reasons?.join("; ") ?? out.error);
  const d = out.document!;
  assert.equal(d.kind, "studio-exec-report-v1");                       // versioned; does not disturb studio-report-document-v1
  assert.equal(d.headline, "Fit is credible but recognition is uneven");
  assert.equal(d.hero.mode, "tension");                                // AI chose the editorial mode
  assert.equal(d.hero.primary?.value, "33.6%");                        // server supplied the value
  assert.ok(d.modules.some((m) => m.kind === "distribution"));         // SHOWS the governed q_fit distribution
  assert.equal((db.tables["study_reports"] ?? []).length, 0);         // preview-only: nothing persisted
});

test("4,5,21. generate persists a draft report from ONLY the selected findings", async () => {
  const r = await SVC.generateReport(admin, "STU", { selectedFindingIds: ["F1"] }, { complete: goodComposer as never });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.data?.report.status, "draft");
  assert.deepEqual(r.data?.report.source_finding_ids, ["F1"]);          // only the selected finding
  const cfg = JSON.stringify(r.data?.report.config);
  assert.doesNotMatch(cfg, /A minority find it unclear/);               // the UNSELECTED finding cannot appear
  assert.equal((db.tables["study_reports"] ?? []).length, 1);
});

test("Slice B. composeInfographicReport returns Page 1 + report-complete; no Page 2 when nothing distinct remains", async () => {
  const r = await SVC.resolveReportInput(admin, "STU");
  const out = await SVC.composeInfographicReport(r.input!, r.governance!, { complete: execPlanComposer as never });
  assert.equal(out.ok, true, out.reasons?.join("; ") ?? out.error);
  assert.equal(out.pages!.executive.kind, "studio-exec-report-v1"); // Page 1 unchanged
  assert.equal(out.pages!.evidence, null);                          // only one showable question → no distinct Page 2
  assert.equal(out.reportStoryComplete, true);                      // the story is complete at one page
  assert.equal((db.tables["study_reports"] ?? []).length, 0);       // preview-only: nothing persisted
});

test("21b,22. a generated report is retrievable with its renderable config", async () => {
  const gen = await SVC.generateReport(admin, "STU", {}, { complete: goodComposer as never });
  const got = await SVC.getReport(admin, "STU", gen.data!.report.id);
  assert.equal(got.ok, true);
  assert.equal(got.data?.report.config.kind, "studio-report-document-v1"); // renderable editorial document
  assert.equal(got.data?.report.config.pages[0].archetype, "executive");   // opens on the executive page
  assert.equal(got.data?.stale, false);
});

test("verification failure → no report persisted (nothing partial)", async () => {
  const bad = async () => ({ title: "T", executive: { headline: "H", summary: "An invented 91% agreed." }, themes: [{ heading: "H", narrative: "N", findingIds: ["F1"] }], implications: [] });
  const r = await SVC.generateReport(admin, "STU", {}, { complete: bad as never });
  assert.equal(r.ok, false); assert.equal(r.status, 422);
  assert.equal((db.tables["study_reports"] ?? []).length, 0);
});

test("24,26. removing a source finding marks the report STALE; getReport never regenerates", async () => {
  let composerCalls = 0;
  const counting = async (a: { prompt: string }) => { composerCalls++; return goodComposer(a); };
  const gen = await SVC.generateReport(admin, "STU", {}, { complete: counting as never });
  assert.equal(composerCalls, 1);
  // A source finding is deleted from the study.
  db.tables["study_findings"] = (db.tables["study_findings"] ?? []).filter((f) => f.id !== "F1");
  const got = await SVC.getReport(admin, "STU", gen.data!.report.id);
  assert.equal(got.data?.stale, true);                                  // flagged, not rewritten
  assert.equal(composerCalls, 1);                                       // getReport did NOT call the composer
});

test("2. readiness reports ok when findings + objective exist", async () => {
  const r = await SVC.reportReadinessFor(admin, "STU");
  assert.equal(r.readiness?.ok, true);
  assert.equal(r.readiness?.findingCount, 2);
});

test("segment evidence detail becomes a GOVERNED audience-comparison visual (values from the frozen fact)", async () => {
  // A finding whose frozen SEGMENT fact carries comparable per-group values.
  tbl("study_findings").push({ id: "F3", study_id: "STU", headline: "Recognition weakest in one market", commentary: "Concentrated non-recognition." });
  tbl("study_finding_evidence").push({ finding_id: "F3", position: 0, evidence_snapshot: { evidenceClass: "segment", ref: "s1", kind: "seg_concentration", dimension: "country", question: "FedEx as a UCL sponsor?", label: '"Never noticed" is chosen by 40.9% of Germany respondents, compared with 24.8% overall', detail: { option: "Never noticed", group: "Germany", groupPct: 40.9, overallPct: 24.8 } } });
  const audienceComposer = async () => ({ title: "R", executive: { headline: "Recognition is uneven by market", summary: "Non-recognition is concentrated in one market." }, themes: [{ heading: "Recognition is uneven by market", interpretation: "One market lags.", findingIds: ["F3"], archetype: "audience-comparison", chartFindingId: "F3" }], implications: [{ text: "Prioritise that market.", findingIds: ["F3"] }] });
  const r = await SVC.generateReport(admin, "STU", { selectedFindingIds: ["F3"] }, { complete: audienceComposer as never });
  assert.equal(r.ok, true, r.error);
  const themePage = r.data!.report.config.pages.find((p) => p.archetype === "audience-comparison")!;
  const cmp = themePage.modules.find((m) => m.kind === "audience-comparison");
  assert.ok(cmp && cmp.kind === "audience-comparison");              // proper governed visual, not prose
  assert.deepEqual(cmp.points.map((p) => p.pct), [40.9, 24.8]);      // governed values from the frozen fact
});
