// ── Research Reasoner PROTOTYPE — governed evidence package (ISOLATED) ────────
// NOT WIRED TO PRODUCTION. Nothing in the app imports this module; it exists only
// for the contained research-reasoning evaluation. It converts an immutable survey
// evidence_snapshot into the smallest COMPLETE structured package a senior analyst
// would need to reason across the whole survey — full distributions, governed derived
// facts, segment facts, the existing deterministic product findings, and an explicit
// statement of what is NOT governed and what the data cannot support.
//
// It invents nothing: every field is copied from the snapshot the Evidence Core already
// produced. It only RE-SHAPES for reasoning and attaches a machine-checkable ref index.

// `id` is the SHORT, stable citation token the model must quote (e1, d2, s3). Long
// structured refs invite truncation/paraphrase and cause false citation failures; short
// ids are resolved verbatim. `ref` is kept for provenance/traceability, not for citing.
export type PackOption = { id: string; label: string; pct: number; count: number; ref: string };
export type PackQuestion = { key: string; text: string; base: number; options: PackOption[] };
export type PackDerived = { id: string; ref: string; kind: string; label: string; value: number; governed: boolean; note?: string };
export type PackSegment = { id: string; ref: string; kind: string; dimension: string; dimensionClass: "research" | "technical"; label: string; value: number };
export type PackCoreFinding = { basis: string; takeaway?: string; title: string; statistic?: string };

export type ReasonerPackage = {
  survey: { name: string; objective: string | null; respondents: number; respondentUniquenessProven: boolean };
  dataLimitations: string[];
  questions: PackQuestion[];
  derivedFacts: PackDerived[];
  segmentFacts: PackSegment[];
  currentDeterministicFindings: PackCoreFinding[];
  refGuide: string;
};

const RESEARCH_DIMENSIONS = new Set(["market", "country", "publisher", "survey"]);
const pp = (x: number): number => Math.round((x <= 1 ? x * 100 : x) * 10) / 10;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

type SnapEvidence = { ref: string; question?: string; canonicalQuestionKey?: string; optionLabel?: string; count?: number; base?: number; percentage?: number | null; scope?: string };
type SnapDerived = { ref: string; kind: string; label?: string; value?: number; detail?: Record<string, unknown> };
type SnapSegment = SnapDerived & { dimension?: string };
type Snapshot = { study?: { name?: string; objective?: string | null; completedResponses?: number; respondentUniquenessProven?: boolean }; evidence?: SnapEvidence[]; derived?: SnapDerived[]; segmentDerived?: SnapSegment[] };

/** All numbers that appear in a fact's label + its structured detail — the set of
 *  values the model is allowed to quote for that ref (the verifier checks against it). */
function gatherNumbers(label: string | undefined, detail: Record<string, unknown> | undefined, extra: number[] = []): number[] {
  const out = new Set<number>(extra.map((n) => Math.round(n * 10) / 10));
  for (const m of (label ?? "").matchAll(/-?\d+(?:\.\d+)?/g)) out.add(Math.round(parseFloat(m[0]) * 10) / 10);
  for (const v of Object.values(detail ?? {})) {
    if (typeof v === "number") out.add(Math.round(v * 10) / 10);
    if (Array.isArray(v)) for (const it of v) if (it && typeof it === "object") for (const vv of Object.values(it)) if (typeof vv === "number") out.add(Math.round(vv * 10) / 10);
  }
  return [...out];
}

export function buildReasonerPackage(
  snapshot: Snapshot,
  coreFindings: PackCoreFinding[],
): { pkg: ReasonerPackage; validRefs: Set<string>; numbersByRef: Map<string, number[]>; refToQuestion: Map<string, string>; groupedShareRefs: Set<string> } {
  const validRefs = new Set<string>();
  const numbersByRef = new Map<string, number[]>();
  const refToQuestion = new Map<string, string>();
  const groupedShareRefs = new Set<string>();
  let eN = 0, dN = 0, sN = 0;

  // ── Full distributions (base evidence), grouped by question ──────────────────
  const evidence = Array.isArray(snapshot.evidence) ? snapshot.evidence : [];
  const qOrder: string[] = [];
  const qMap = new Map<string, PackQuestion>();
  for (const e of evidence) {
    if (e.scope && e.scope !== "combined") continue; // the governed combined read only
    const key = e.canonicalQuestionKey ?? e.question ?? "q";
    if (!qMap.has(key)) { qMap.set(key, { key, text: e.question ?? key, base: num(e.base), options: [] }); qOrder.push(key); }
    const q = qMap.get(key)!;
    const pct = pp(num(e.percentage));
    const id = `e${++eN}`;
    q.options.push({ id, label: e.optionLabel ?? "—", pct, count: num(e.count), ref: e.ref });
    validRefs.add(id);
    numbersByRef.set(id, gatherNumbers(undefined, undefined, [pct, num(e.count), num(e.base)]));
    refToQuestion.set(id, key);
  }
  const questions = qOrder.map((k) => { const q = qMap.get(k)!; q.options.sort((a, b) => b.pct - a.pct); return q; });

  // ── Governed derived facts — grouped_share is flagged UNGOVERNED (held) ───────
  const derivedFacts: PackDerived[] = (Array.isArray(snapshot.derived) ? snapshot.derived : []).map((d) => {
    const governed = d.kind !== "grouped_share";
    const id = `d${++dN}`;
    validRefs.add(id);
    numbersByRef.set(id, gatherNumbers(d.label, d.detail, [num(d.value)]));
    if (d.kind === "grouped_share") groupedShareRefs.add(id);
    if ((d as { canonicalQuestionKey?: string }).canonicalQuestionKey) refToQuestion.set(id, (d as { canonicalQuestionKey?: string }).canonicalQuestionKey!);
    return {
      id, ref: d.ref, kind: d.kind, label: d.label ?? "", value: pp(num(d.value)), governed,
      note: governed ? undefined : "UNGOVERNED grouping: this survey has NOT declared these options as a shared construct. You may note the combined share as an exploratory observation ONLY, clearly caveated — never as a measured finding.",
    };
  });

  // ── Segment facts, tagged research vs technical dimension ─────────────────────
  const segmentFacts: PackSegment[] = (Array.isArray(snapshot.segmentDerived) ? snapshot.segmentDerived : []).map((s) => {
    const id = `s${++sN}`;
    validRefs.add(id);
    numbersByRef.set(id, gatherNumbers(s.label, s.detail, [num(s.value)]));
    if ((s as { canonicalQuestionKey?: string }).canonicalQuestionKey) refToQuestion.set(id, (s as { canonicalQuestionKey?: string }).canonicalQuestionKey!);
    const dim = s.dimension ?? "segment";
    return { id, ref: s.ref, kind: s.kind, dimension: dim, dimensionClass: RESEARCH_DIMENSIONS.has(dim) ? "research" : "technical", label: s.label ?? "", value: pp(num(s.value)) };
  });

  const st = snapshot.study ?? {};
  const pkg: ReasonerPackage = {
    survey: { name: st.name ?? "Untitled survey", objective: st.objective ?? null, respondents: num(st.completedResponses), respondentUniquenessProven: st.respondentUniquenessProven === true },
    dataLimitations: [
      "This is AGGREGATE data. There is NO respondent-level join across questions: you cannot claim the same people who answered X also answered Y, and you cannot correlate answers across questions.",
      "No statistical significance testing has been run. Do not use significance language ('significant', 'p<') for any difference.",
      "Segment comparisons only include groups with a base of at least 30 respondents; smaller groups were excluded upstream.",
      "Percentages are shares of those who answered each question, not of all respondents.",
      "Any 'combined share' of two options is a raw arithmetic sum, not a governed construct, unless explicitly marked governed.",
      st.respondentUniquenessProven === true ? "Respondent uniqueness is proven for this dataset." : "Respondent uniqueness is NOT proven; treat counts as responses, not guaranteed unique people.",
    ],
    questions,
    derivedFacts,
    segmentFacts,
    currentDeterministicFindings: coreFindings,
    refGuide: "Every substantive claim must cite one or more of the SHORT ids shown on the options and facts above (e.g. e3, d1, s2) in its evidenceRefs. Cite the exact id(s) whose numbers you use, verbatim. Never invent an id, and never quote a number that is not on a cited id (in particular, do NOT add two option shares together and quote the sum).",
  };
  return { pkg, validRefs, numbersByRef, refToQuestion, groupedShareRefs };
}
