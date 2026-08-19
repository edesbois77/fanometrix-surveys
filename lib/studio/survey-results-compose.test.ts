// ── Stage 7 — one coherent results experience: composition (pure) ────────────
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSurveyResults, KEY_CAP, NOTE_CAP, NOTE_MIN } from "./survey-results-compose";
import { leaderUsefulness, segmentUsefulness } from "./usefulness";
import type { CoreFindingsProjection, CoreFinding } from "@/lib/core/studio/projection";
import type { SurveyAnalysisView } from "@/lib/studio/survey-analysis-service";

const ev = (option: string, count: number, base = 200) => ({ question: "How satisfied?", option, count, base, percentage: Math.round((count / base) * 1000) / 10 });
const finding = (o: Partial<CoreFinding> & { id: string; tier: CoreFinding["tier"]; basis: CoreFinding["basis"] }): CoreFinding => ({
  title: `title ${o.id}`, caveats: [], evidence: [ev("A", 100)], ...o,
});
const projection = (findings: CoreFinding[]): CoreFindingsProjection => ({
  version: "core-projection-v1", generatedFrom: "immutable_snapshot", deterministic: true, findings,
  counts: { key: findings.filter((f) => f.tier === "key").length, supporting: findings.filter((f) => f.tier === "supporting").length, context: findings.filter((f) => f.tier === "context").length },
});
const narrative = (summary: string): SurveyAnalysisView => ({ narrative: { headline: "h", summary, evidenceRefs: [] }, themes: [], findings: [], generatedAt: "t", noStrongConclusions: false } as unknown as SurveyAnalysisView);

test("§J/§I flag-off shape (no core / empty core) → legacy mode (existing experience)", () => {
  assert.equal(composeSurveyResults({ core: null, analysis: null }).mode, "legacy");
  assert.equal(composeSurveyResults({ core: projection([]), analysis: narrative("x") }).mode, "legacy");
});

test("§A/§B governed key findings lead, and each carries traceable evidence", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "obs", tier: "key", basis: "observed", statistic: "45%" }),
    finding({ id: "gov", tier: "key", basis: "governed", statistic: "80%", evidence: [ev("Very satisfied", 90), ev("Satisfied", 70)] }),
  ]), analysis: null });
  assert.equal(vm.mode, "intelligence");
  if (vm.mode !== "intelligence") return;
  assert.equal(vm.keyFindings[0].basis, "governed", "governed leads over observed");
  assert.equal(vm.keyFindings[0].statistic, "80%");
  assert.ok(vm.keyFindings[0].evidence.every((e) => e.base > 0 && e.percentage != null), "evidence traces with base + %");
});

test("§E exploratory content can NEVER be a key finding (kept subordinate in 'worth noting')", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "gov", tier: "key", basis: "governed" }),
    finding({ id: "expl", tier: "context", basis: "exploratory", caveats: ["This is a possible interpretation, not a confirmed finding."] }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.ok(vm.keyFindings.every((f) => f.basis !== "exploratory"), "no exploratory in key findings");
  assert.ok(vm.worthNoting.some((f) => f.id === "expl" && f.caveat), "exploratory sits in worth-noting with its caveat");
});

test("§C/§D key + worth-noting are capped so contextual noise never overwhelms", () => {
  const many = [
    ...Array.from({ length: 8 }, (_, i) => finding({ id: `k${i}`, tier: "key", basis: "governed" })),
    ...Array.from({ length: 12 }, (_, i) => finding({ id: `c${i}`, tier: "context", basis: "observed" })),
  ];
  const vm = composeSurveyResults({ core: projection(many), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.ok(vm.keyFindings.length <= KEY_CAP, `key ≤ ${KEY_CAP}`);
  assert.ok(vm.worthNoting.length <= NOTE_CAP, `worthNoting ≤ ${NOTE_CAP}`);
});

test("§F nothing leads and only routine trivia remains → honest empty message, and NOT padded", () => {
  // Bare context observations (below the worth-noting floor) are trivia; a restrained
  // page shows the empty message and does NOT fill "worth noting" just to use the slots.
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "c1", tier: "context", basis: "observed" }),
    finding({ id: "c2", tier: "context", basis: "observed" }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings.length, 0);
  assert.match(vm.emptyMessage ?? "", /no single result dominates/i);
  assert.equal(vm.worthNoting.length, 0, "routine trivia is not padded into 'worth noting'");
});

test("§G historic (observed-only, no governed) survey is still useful — a dominant lead headlines", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "lead", tier: "key", basis: "observed", statistic: "60%", usefulness: leaderUsefulness(40) }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings.length, 1, "a genuinely dominant descriptive lead surfaces");
  assert.equal(vm.keyFindings[0].basis, "observed");
});

test("§H dedup: the AI narrative is reused as a SUBORDINATE summary — never as separate findings", () => {
  const analysis = narrative("Most respondents appear satisfied overall.");
  // even if the AI analysis carried its own findings, composition ignores them:
  (analysis as unknown as { findings: unknown[] }).findings = [{ id: "ai1", headline: "AI: satisfied", explanation: "", supportingQuestions: [], base: 200 }];
  const vm = composeSurveyResults({ core: projection([finding({ id: "gov", tier: "key", basis: "governed", statistic: "80%" })]), analysis });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.interpretation, "Most respondents appear satisfied overall.", "narrative summary is the subordinate interpretation");
  assert.ok(vm.keyFindings.every((f) => f.id !== "ai1"), "AI findings are NOT surfaced as separate key findings");
});

test("§12 complementary governed findings that sum to 100% collapse — stronger side leads, inverse dropped", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "top", tier: "key", basis: "governed", statistic: "35%", title: "35% selected “Agree”", question: "Can you rely on systems?", evidence: [ev("Agree", 91)] }),
    finding({ id: "bot", tier: "key", basis: "governed", statistic: "65%", title: "65% selected “Disagree”", question: "Can you rely on systems?", evidence: [ev("Disagree", 169)] }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings.length, 1, "complementary pair collapses to one headline");
  assert.equal(vm.keyFindings[0].id, "bot", "the larger-share side leads");
  // The pure inverse (35%, trivially 100−65) is not repeated anywhere in the view.
  assert.ok(![...vm.keyFindings, ...vm.worthNoting].some((f) => f.id === "top"), "the inverse side is not shown twice");
});

test("§12 a governed scale WITH a neutral midpoint (sum < 100%) keeps BOTH sides — not complements", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "pos", tier: "key", basis: "governed", statistic: "50%", title: "50% satisfied", question: "Satisfaction?", evidence: [ev("Satisfied", 130)] }),
    finding({ id: "neg", tier: "key", basis: "governed", statistic: "30%", title: "30% dissatisfied", question: "Satisfaction?", evidence: [ev("Dissatisfied", 78)] }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  const shown = new Set([...vm.keyFindings, ...vm.worthNoting].map((f) => f.id));
  assert.ok(shown.has("pos") && shown.has("neg"), "both distinct sides of a neutral-midpoint scale are kept");
});

test("complementary collapse only groups the SAME question — different questions both lead", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "a", tier: "key", basis: "governed", statistic: "80%", title: "t", question: "Q1" }),
    finding({ id: "b", tier: "key", basis: "governed", statistic: "70%", title: "t", question: "Q2" }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings.length, 2, "different questions each keep a headline");
});

test("§4/§5 a material segment leads 'What stands out'; a mundane topline leader stays subordinate", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "seg", tier: "supporting", basis: "observed", title: "Germany stands out (41% never noticed)", usefulness: segmentUsefulness("seg_concentration", 16) }),
    finding({ id: "lead", tier: "supporting", basis: "observed", statistic: "34%", title: "Rewards is the most-selected", usefulness: leaderUsefulness(3) }),
    finding({ id: "min", tier: "context", basis: "observed", title: "27% never noticed" }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.emptyMessage, null, "a material segment prevents the deflating empty message");
  assert.ok(vm.keyFindings.some((f) => f.id === "seg"), "the material segment leads 'What stands out'");
  assert.ok(!vm.keyFindings.some((f) => f.id === "lead"), "a mundane topline leader does NOT headline");
  assert.ok(vm.worthNoting.some((f) => f.id === "lead"), "the mundane leader is subordinate under 'worth noting'");
});

test("§K a governed key finding still OUTRANKS observed supporting facts", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "gov", tier: "key", basis: "governed", statistic: "65%", title: "65% ...", question: "Qgov" }),
    finding({ id: "obs", tier: "supporting", basis: "observed", title: "Rewards most-selected", usefulness: leaderUsefulness(9) }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings[0].basis, "governed", "governed leads");
  assert.ok(vm.worthNoting.some((f) => f.id === "obs"), "observed is subordinate");
});

test("coverage: truly nothing (only context) → honest empty message", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "c1", tier: "context", basis: "observed", title: "spread" }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings.length, 0);
  assert.match(vm.emptyMessage ?? "", /no single result dominates/i);
});

// ── Executive storytelling pass ──────────────────────────────────────────────
test("executive caps: at most 3 lead + 2 worth-noting, even with many strong findings", () => {
  const many = [
    ...Array.from({ length: 6 }, (_, i) => finding({ id: `k${i}`, tier: "key", basis: "governed", statistic: `${90 - i}%`, question: `Q${i}` })),
    ...Array.from({ length: 6 }, (_, i) => finding({ id: `s${i}`, tier: "supporting", basis: "observed", title: `seg ${i}`, usefulness: 60 - i })),
  ];
  const vm = composeSurveyResults({ core: projection(many), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.ok(vm.keyFindings.length <= KEY_CAP && vm.keyFindings.length === 3, "≤3 lead");
  assert.ok(vm.worthNoting.length <= NOTE_CAP && vm.worthNoting.length === 2, "≤2 worth-noting");
  assert.ok(vm.keyFindings.length + vm.worthNoting.length <= 5, "reading burden stays small");
});

test("no padding: a worth-noting slot stays empty rather than showing sub-floor trivia", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "gov", tier: "key", basis: "governed", statistic: "71%", title: "71% selected the top of the scale", question: "Q1" }),
    finding({ id: "min1", tier: "context", basis: "observed", title: "A notable 18% chose Other", usefulness: NOTE_MIN - 8 }),
    finding({ id: "min2", tier: "context", basis: "observed", title: "A notable 15% chose None", usefulness: NOTE_MIN - 12 }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings.length, 1, "the one worthwhile finding leads");
  assert.equal(vm.worthNoting.length, 0, "trivia below the floor is not padded in");
});

test("a genuinely useful secondary note (above the floor) DOES surface, capped at 2", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "seg", tier: "supporting", basis: "observed", title: "Germany stands out", usefulness: 80 }),
    finding({ id: "lead1", tier: "supporting", basis: "observed", statistic: "34%", title: "Rewards most-selected", usefulness: NOTE_MIN + 8 }),
    finding({ id: "lead2", tier: "supporting", basis: "observed", statistic: "31%", title: "Access most-selected", usefulness: NOTE_MIN + 6 }),
    finding({ id: "lead3", tier: "supporting", basis: "observed", statistic: "30%", title: "Other most-selected", usefulness: NOTE_MIN + 4 }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.ok(vm.keyFindings.some((f) => f.id === "seg"), "the material segment leads");
  assert.equal(vm.worthNoting.length, 2, "the two strongest above-floor notes surface, the third is dropped");
  assert.deepEqual(vm.worthNoting.map((f) => f.id), ["lead1", "lead2"]);
});

test("takeaway/evidence: a finding's short takeaway threads through to the view-model", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "seg", tier: "supporting", basis: "observed", takeaway: "UK respondents stand out on “Connecting”", title: "“Connecting” chosen by 41.9% of UK vs 25.1% overall", usefulness: 80 }),
  ]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.keyFindings[0].takeaway, "UK respondents stand out on “Connecting”");
  assert.equal(vm.keyFindings[0].title, "“Connecting” chosen by 41.9% of UK vs 25.1% overall", "evidence preserved beneath the takeaway");
});

test("narrative remains a subordinate interpretation, never promoted to a finding", () => {
  const vm = composeSurveyResults({ core: projection([
    finding({ id: "seg", tier: "supporting", basis: "observed", title: "Germany stands out", usefulness: 80 }),
  ]), analysis: narrative("A short interpretation of the findings.") });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  assert.equal(vm.interpretation, "A short interpretation of the findings.");
  assert.ok(![...vm.keyFindings, ...vm.worthNoting].some((f) => f.title.includes("interpretation")), "the narrative is never a finding card");
});

test("§M no engine jargon leaks through composition", () => {
  const vm = composeSurveyResults({ core: projection([finding({ id: "g", tier: "key", basis: "governed", title: "80% selected “Very satisfied or Satisfied”" })]), analysis: null });
  if (vm.mode !== "intelligence") throw new Error("intelligence");
  const blob = JSON.stringify(vm);
  assert.doesNotMatch(blob, /threshold recode|constructId|entailment|provisional|authority|ledger|candidate/i);
});
