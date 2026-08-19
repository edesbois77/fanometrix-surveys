// ── Stage C2 — Report candidate derivation: source policy, dedup, provenance ──
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// getCurrentResearchArtefact is mocked to return a per-source artefact from a test map.
type Artefact = { evidenceFingerprint: string; analysisRunId: string | null; product: unknown } | null;
const artefacts: Record<string, Artefact> = {}; // key = `${kind}:${sourceId}`
mock.module("@/lib/research-intelligence/read", {
  namedExports: { getCurrentResearchArtefact: async (src: { kind: string; sourceId: string }) => artefacts[`${src.kind}:${src.sourceId}`] ?? null },
});
mock.module("@/lib/studio/study", { namedExports: { canCurateStudies: () => true } });

// In-memory supabase for studies / surveys / study_findings.
type Row = Record<string, unknown>;
const db: { studies: Row[]; surveys: Row[]; study_findings: Row[] } = { studies: [], surveys: [], study_findings: [] };
function chain(table: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  const rows = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const c: Record<string, unknown> = {
    select() { return c; }, eq(k: string, v: unknown) { filters.push([k, v]); return c; }, is(k: string, v: unknown) { filters.push([k, v]); return c; },
    single() { const r = rows()[0] ?? null; return Promise.resolve({ data: r, error: r ? null : { message: "no rows" } }); },
    maybeSingle() { return Promise.resolve({ data: rows()[0] ?? null, error: null }); },
    then(res: (v: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: rows(), error: null }).then(res); },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: keyof typeof db) => chain(t) } } });

let deriveStudyReportCandidates: typeof import("./research-candidates").deriveStudyReportCandidates;
before(async () => { ({ deriveStudyReportCandidates } = await import("./research-candidates")); });
beforeEach(() => { for (const k of Object.keys(artefacts)) delete artefacts[k]; db.studies = []; db.surveys = []; db.study_findings = []; });

const insight = (id: string, authority: string, qkeys: string[], over: Record<string, unknown> = {}) => ({
  id, authority, takeaway: `takeaway ${id}`, explanation: `statement ${id}`, whyItMatters: "why", confidence: "high", caveat: "",
  evidence: [{ question: "Q", label: "L", percentage: 30, base: 274 }], counterEvidence: [],
  evidenceRefs: qkeys.map((k) => `study#S1|q#${k}|opt#o1|src#combined`), counterEvidenceRefs: [], ...over,
});
const product = (key: unknown[], consider: unknown[] = []) => ({ displayable: true, story: { headline: "h", summary: null }, keyInsights: key, toConsider: consider, observations: [], tensions: [], cannotConclude: [], openQuestions: [] });
const SESSION = { role: "admin", workEmail: "a@b.com" } as never;

test("study-level insights become candidates; authority + section (hypothesis→consideration) are preserved", async () => {
  db.studies = [{ id: "S1", name: "FedEx Study" }];
  artefacts["study:S1"] = { evidenceFingerprint: "FP", analysisRunId: "RUN", product: product(
    [insight("i1", "synthesis", ["q1"]), insight("i2", "interpretation", ["q2"])],
    [insight("i3", "hypothesis", ["q3"])],
  ) };
  const res = await deriveStudyReportCandidates(SESSION, "S1");
  assert.ok(res.ok);
  const c = res.data!.candidates;
  assert.equal(c.length, 3);
  assert.deepEqual(c.map((x) => x.authority).sort(), ["hypothesis", "interpretation", "synthesis"]);
  assert.equal(c.find((x) => x.authority === "hypothesis")!.section, "consideration");
  assert.ok(c.every((x) => x.sourceKind === "study" && x.canFreeze === true), "study candidates carry refs → canFreeze");
});

test("Study-vs-Survey dedup: a member-survey insight on a question the STUDY already covers is suppressed; an UNcovered survey insight is kept", async () => {
  db.studies = [{ id: "S1", name: "Study" }];
  db.surveys = [{ id: "SV1", name: "Survey 1", study_id: "S1", deleted_at: null }];
  artefacts["study:S1"] = { evidenceFingerprint: "FP", analysisRunId: "R", product: product([insight("s1", "synthesis", ["q1"])]) };
  // survey covers q1 (covered by study → drop) and q9 (not covered → keep)
  artefacts["survey:SV1"] = { evidenceFingerprint: "FPsv", analysisRunId: "Rsv", product: product([
    insight("v1", "synthesis", ["q1"]),      // duplicate of study coverage → suppressed
    insight("v2", "synthesis", ["q9"]),      // study doesn't cover q9 → kept
  ]) };
  const res = await deriveStudyReportCandidates(SESSION, "S1");
  const c = res.data!.candidates;
  assert.ok(c.some((x) => x.sourceKind === "study" && x.insightId === "s1"));
  assert.ok(!c.some((x) => x.sourceKind === "survey" && x.insightId === "v1"), "survey insight on a study-covered question is deduped out");
  assert.ok(c.some((x) => x.sourceKind === "survey" && x.insightId === "v2"), "survey-only question is preserved");
});

test("already-accepted RI insights are not re-offered (fingerprint-specific)", async () => {
  db.studies = [{ id: "S1", name: "Study" }];
  db.study_findings = [{ study_id: "S1", origin_type: "research_intelligence", ri_source_kind: "study", ri_source_id: "S1", ri_evidence_fingerprint: "FP", ri_insight_id: "i1" }];
  artefacts["study:S1"] = { evidenceFingerprint: "FP", analysisRunId: "R", product: product([insight("i1", "synthesis", ["q1"]), insight("i2", "synthesis", ["q2"])]) };
  const res = await deriveStudyReportCandidates(SESSION, "S1");
  const c = res.data!.candidates;
  assert.equal(c.find((x) => x.insightId === "i1")!.alreadyAccepted, true);
  assert.equal(c.find((x) => x.insightId === "i2")!.alreadyAccepted, false);
});

test("a finding accepted from an OLDER fingerprint does NOT suppress the current candidate (changed evidence is genuinely new)", async () => {
  db.studies = [{ id: "S1", name: "Study" }];
  db.study_findings = [{ study_id: "S1", origin_type: "research_intelligence", ri_source_kind: "study", ri_source_id: "S1", ri_evidence_fingerprint: "OLD_FP", ri_insight_id: "i1" }];
  artefacts["study:S1"] = { evidenceFingerprint: "NEW_FP", analysisRunId: "R", product: product([insight("i1", "synthesis", ["q1"])]) };
  const res = await deriveStudyReportCandidates(SESSION, "S1");
  assert.equal(res.data!.candidates.find((x) => x.insightId === "i1")!.alreadyAccepted, false);
});

test("no study artefact → no candidates (deterministic Findings/analysis remains the surface)", async () => {
  db.studies = [{ id: "S1", name: "Study" }];
  const res = await deriveStudyReportCandidates(SESSION, "S1");
  assert.ok(res.ok);
  assert.equal(res.data!.candidates.length, 0);
});

test("pre-C2 artefact (insights without refs) → canFreeze false (surfaced but not directly acceptable)", async () => {
  db.studies = [{ id: "S1", name: "Study" }];
  artefacts["study:S1"] = { evidenceFingerprint: "FP", analysisRunId: "R", product: product([insight("i1", "synthesis", ["q1"], { evidenceRefs: [] })]) };
  const res = await deriveStudyReportCandidates(SESSION, "S1");
  assert.equal(res.data!.candidates[0].canFreeze, false);
});
