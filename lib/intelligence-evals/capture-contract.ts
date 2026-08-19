// ── Fanometrix Intelligence Evals — ANALYSIS-UNDER-TEST contract (pure) ──
//
// A presentation-neutral, engine-neutral representation of ONE analytical
// output, so the same benchmark can score ANY producer: the current Survey
// Studio pipeline (baseline), a future shared Analytical Core, a human
// transcription, or a control brainstorm. It intentionally imports NOTHING from
// production (no Studio, no lib/analysis) — an adapter converts a producer's
// native output into this shape, and the adapter is the only part that knows
// the producer.
//
// This is the seam that lets us compare, later:
//     Existing Fanometrix   → baseline score
//     Shared Core v1        → new score
//     Future revisions      → regression/improvement score
// without the benchmark ever depending on a producer's internal types.

/** One claim the analysis makes, decomposed into the machine-checkable parts
 *  the scorer needs. `text` preserves the natural-language claim for
 *  model-assisted/human semantic scoring; the structured fields drive the
 *  deterministic and structured-output tiers. */
export type AnalysisFinding = {
  id: string;
  /** 1 = most important. The producer's own ranking of this finding. */
  rank: number;
  /** The claim/headline as written — used for semantic (tier 3/4) scoring and
   *  for lexical MUST-NOT-SAY detectors; never string-matched for recall. */
  text: string;
  /** Optional longer interpretation/explanation prose. */
  detail?: string;
  /** Every numeric percentage/point value the finding ASSERTS, as displayed
   *  (e.g. 33.6, 64.6, 2.6). Drives arithmetic-validity + grounding scoring. */
  statedNumbers: number[];
  /** Canonical question keys the finding draws on. One key = single-question;
   *  two+ keys = cross-question (synthesis if no summed number, prohibited if a
   *  summed number appears). */
  citedQuestions: string[];
  /** Optional explicit option citations, when the producer exposes them. */
  citedOptions?: { question: string; option: string }[];
  /** Optional producer self-classification. NOT trusted for scoring truth;
   *  used only to route structured-output checks (e.g. treat implications'
   *  causal language more strictly). */
  kind?: "observation" | "comparison" | "synthesis" | "pattern" | "tension" | "implication" | "recommendation";
  /** Optional producer self-tag mapping this finding to a benchmark must_find
   *  id. When present it enables a structured-output recall check; when absent,
   *  recall falls to the model-assisted tier. Self-tags are advisory — a
   *  mis-tag cannot make a wrong claim score as correct. */
  claimsMustFindId?: string;
};

export type AnalysisUnderTest = {
  benchmarkId: string;
  /** Who/what produced this — e.g. "survey-studio@<sha>", "core-v1", "human",
   *  "control". Recorded in results so scores are attributable. */
  producedBy: string;
  /** ISO timestamp the capture was taken (supplied by the caller, never
   *  generated here, so this module stays pure/deterministic). */
  capturedAt?: string;
  findings: AnalysisFinding[];
  /** Optional executive/narrative prose (headline + summary), scored the same
   *  way as findings for grounding and MUST-NOT-SAY. */
  narrative?: { headline?: string; summary?: string };
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFERRED — Survey Studio baseline adapter.
//
// A real adapter that turns the current Survey Studio Study Analysis output
// (validated proposals + themes + narrative) into an AnalysisUnderTest is
// DELIBERATELY NOT IMPLEMENTED here, because Survey Studio's analysis output
// shape is being actively changed in another session and importing it now
// would (a) couple this benchmark to volatile types and (b) risk touching
// production behaviour.
//
// When Survey Studio settles, add `capture-survey-studio.ts` next to this file
// with a single pure function of roughly this signature (no DB writes, no
// prompt/logic changes — a read-only mapping only):
//
//   import type { StudyAnalysisProposal, StudyTheme, StudyNarrative } from "@/lib/studio/study-analysis";
//   export function fromStudyAnalysis(run: {
//     proposals: StudyAnalysisProposal[]; themes: StudyTheme[]; narrative: StudyNarrative | null;
//   }, benchmarkId: string, producedBy: string): AnalysisUnderTest { ... }
//
// Mapping notes for whoever implements it:
//   • rank            ← theme.importance ("primary" → low rank numbers) then
//                        proposal order within theme, standalone last.
//   • text/detail     ← proposal.headline / proposal.explanation (ref-stripped
//                        already by production `stripInlineRefs`).
//   • statedNumbers   ← parse displayed "NN.N%" and "NNpp" tokens out of the
//                        text; do NOT re-derive — capture only what the producer
//                        actually stated.
//   • citedQuestions  ← resolve proposal.evidenceRefs → the governed evidence
//                        line's canonicalQuestionKey (via the run snapshot).
//   • kind            ← proposal.displayType.
// The capture is offline: run the existing lib/studio/qa harness (which already
// exercises the real pipeline WITHOUT touching the DB) N times, map each run,
// and write the AnalysisUnderTest JSON to ./captures/ for scoring. See
// ./capture/README.md.
// ─────────────────────────────────────────────────────────────────────────────
