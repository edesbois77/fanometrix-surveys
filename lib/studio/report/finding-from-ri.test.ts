// ── Stage C2 — accept a verified RI insight → DRAFT finding (freeze + provenance) ─
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

const REF = "study#S1|q#q1|opt#o1|src#combined";
// The source run's IMMUTABLE snapshot the evidence is frozen FROM (real selectFindingEvidence
// resolves REF against this).
const SNAPSHOT = { evidence: [{ ref: REF, canonicalQuestionKey: "q1", question: "Fit?", scope: "combined", optionId: "o1", optionLabel: "Strong fit", count: 87, base: 274, percentage: 0.316 }], derived: [], segmentDerived: [] };

// Test-controlled current artefact.
let artefact: { evidenceFingerprint: string; analysisRunId: string | null; product: unknown } | null = null;
mock.module("@/lib/research-intelligence/read", { namedExports: { getCurrentResearchArtefact: async () => artefact } });
mock.module("@/lib/research-intelligence/source", { namedExports: { researchSourceFor: (kind: string, id: string) => ({ kind, sourceId: id, resolveRun: async () => ({ snapshot: SNAPSHOT }) }) } });
mock.module("@/lib/studio/study", { namedExports: { canCurateStudies: () => true } });
// study-analysis / results imports pulled in by the service — stub the heavy ones it doesn't use here.
mock.module("@/lib/studio/study-results-resolve", { namedExports: { resolveStudyResults: async () => ({ access: "ok", results: null }) } });

// In-memory supabase that CAPTURES inserts so we can prove what was frozen/persisted.
type Row = Record<string, unknown>;
const db: { studies: Row[]; surveys: Row[]; study_findings: Row[]; study_finding_evidence: Row[] } = { studies: [], surveys: [], study_findings: [], study_finding_evidence: [] };
let findingInsert: Row | null = null;
let evidenceInsert: Row[] | null = null;
function chain(table: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  let pendingInsert: Row | Row[] | null = null;
  const rows = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const c: Record<string, unknown> = {
    select() { return c; }, eq(k: string, v: unknown) { filters.push([k, v]); return c; }, is(k: string, v: unknown) { filters.push([k, v]); return c; }, order() { return c; },
    insert(payload: Row | Row[]) {
      pendingInsert = payload;
      if (table === "study_findings") { findingInsert = payload as Row; const row = { id: "F1", ...(payload as Row) }; db.study_findings.push(row); }
      if (table === "study_finding_evidence") { evidenceInsert = payload as Row[]; db.study_finding_evidence.push(...(payload as Row[])); }
      return c;
    },
    single() {
      if (pendingInsert && table === "study_findings") return Promise.resolve({ data: db.study_findings[db.study_findings.length - 1], error: null });
      const r = rows()[0] ?? null; return Promise.resolve({ data: r, error: r ? null : { message: "no rows" } });
    },
    maybeSingle() { return Promise.resolve({ data: rows()[0] ?? null, error: null }); },
    delete() { return c; },
    then(res: (v: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: pendingInsert ? [] : rows(), error: null }).then(res); },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: keyof typeof db) => chain(t) } } });

let createFindingFromResearchInsight: typeof import("@/lib/studio/study-finding-service").createFindingFromResearchInsight;
before(async () => { ({ createFindingFromResearchInsight } = await import("@/lib/studio/study-finding-service")); });
beforeEach(() => { db.studies = [{ id: "S1", name: "Study" }]; db.surveys = []; db.study_findings = []; db.study_finding_evidence = []; findingInsert = null; evidenceInsert = null; artefact = null; });

const product = (insights: unknown[]) => ({ displayable: true, story: { headline: "h", summary: null }, keyInsights: insights, toConsider: [], observations: [], tensions: [], cannotConclude: [], openQuestions: [] });
const INSIGHT = { id: "i1", authority: "synthesis", takeaway: "Strong fit leads", explanation: "31.6% strong fit.", whyItMatters: "matters", confidence: "high", caveat: "", evidence: [], counterEvidence: [], evidenceRefs: [REF], counterEvidenceRefs: [] };
const SESSION = { role: "admin", workEmail: "a@b.com" } as never;
const ACCEPT = { sourceKind: "study" as const, sourceId: "S1", insightId: "i1", evidenceFingerprint: "FP" };

test("E: accept freezes the EXACT governed evidence the insight was verified against, as a DRAFT with full provenance (never published)", async () => {
  artefact = { evidenceFingerprint: "FP", analysisRunId: "RUN", product: product([INSIGHT]) };
  const res = await createFindingFromResearchInsight(SESSION, "S1", ACCEPT, {});
  assert.ok(res.ok && res.status === 201);
  // DRAFT only — no auto-publish.
  assert.equal(findingInsert!.status, "draft");
  assert.equal(findingInsert!.published_at ?? null, null);
  // Provenance persisted.
  assert.equal(findingInsert!.origin_type, "research_intelligence");
  assert.equal(findingInsert!.ri_source_kind, "study");
  assert.equal(findingInsert!.ri_source_id, "S1");
  assert.equal(findingInsert!.ri_evidence_fingerprint, "FP");
  assert.equal(findingInsert!.ri_insight_id, "i1");
  assert.equal(findingInsert!.ri_authority, "synthesis");
  // The frozen evidence is the exact governed ref, tagged base — same freeze path as proposals.
  assert.equal(evidenceInsert!.length, 1);
  assert.equal(evidenceInsert![0].evidence_ref, REF);
  assert.equal((evidenceInsert![0].evidence_snapshot as Row).evidenceClass, "base");
  assert.equal((evidenceInsert![0].evidence_snapshot as Row).optionLabel, "Strong fit");
});

test("K: STALE candidate — fingerprint no longer matches current artefact → 409, nothing frozen or written", async () => {
  artefact = { evidenceFingerprint: "NEW_FP", analysisRunId: "RUN", product: product([INSIGHT]) };
  const res = await createFindingFromResearchInsight(SESSION, "S1", { ...ACCEPT, evidenceFingerprint: "OLD_FP" }, {});
  assert.equal(res.ok, false);
  assert.equal(res.status, 409);
  assert.equal(findingInsert, null);
});

test("staleness: no current artefact at all → 409 (cannot accept superseded research)", async () => {
  artefact = null;
  const res = await createFindingFromResearchInsight(SESSION, "S1", ACCEPT, {});
  assert.equal(res.status, 409);
  assert.equal(findingInsert, null);
});

test("pre-C2 fallback: an insight with NO refs cannot be frozen → 422, nothing written", async () => {
  artefact = { evidenceFingerprint: "FP", analysisRunId: "RUN", product: product([{ ...INSIGHT, evidenceRefs: [] }]) };
  const res = await createFindingFromResearchInsight(SESSION, "S1", ACCEPT, {});
  assert.equal(res.status, 422);
  assert.equal(findingInsert, null);
});

test("insight id not present in the current research → 404", async () => {
  artefact = { evidenceFingerprint: "FP", analysisRunId: "RUN", product: product([INSIGHT]) };
  const res = await createFindingFromResearchInsight(SESSION, "S1", { ...ACCEPT, insightId: "nope" }, {});
  assert.equal(res.status, 404);
});

test("idempotency: a repeat accept returns the existing draft (no duplicate finding)", async () => {
  artefact = { evidenceFingerprint: "FP", analysisRunId: "RUN", product: product([INSIGHT]) };
  db.study_findings = [{ id: "EXIST", study_id: "S1", origin_type: "research_intelligence", ri_source_kind: "study", ri_source_id: "S1", ri_evidence_fingerprint: "FP", ri_insight_id: "i1", status: "draft" }];
  const res = await createFindingFromResearchInsight(SESSION, "S1", ACCEPT, {});
  assert.ok(res.ok && res.status === 200);
  assert.equal(res.data!.finding.id, "EXIST");
  assert.equal(findingInsert, null, "no new finding inserted");
});

test("cross-study guard: a 'study' insight whose id is not this study is refused", async () => {
  artefact = { evidenceFingerprint: "FP", analysisRunId: "RUN", product: product([INSIGHT]) };
  const res = await createFindingFromResearchInsight(SESSION, "S1", { ...ACCEPT, sourceId: "OTHER" }, {});
  assert.equal(res.status, 400);
  assert.equal(findingInsert, null);
});
