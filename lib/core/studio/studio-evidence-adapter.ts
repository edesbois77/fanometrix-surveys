// ── Fanometrix Analytical Core — Studio evidence_snapshot → governed input (5C/5D) ─
// READ-ONLY. Reconstructs a StudioGovernedInput from the IMMUTABLE evidence
// snapshot that Survey Studio already persists on every analysis run
// (study_analysis_runs.evidence_snapshot / survey_analysis_runs.evidence_snapshot).
// Re-reading that snapshot — rather than re-deriving upstream — guarantees the
// shadow Core analyses the EXACT governed state the authoritative run analysed
// (Stage 5C §8 consistency model).
//
// Decoupled via a minimal structural type (Studio is edited elsewhere). Stage 5D:
// when the snapshot carries GOVERNED semantics (scaleType/constructKey/ordinalPosition/
// polarity — established at authoring by an explicit scale template, never wording),
// they are mapped FAITHFULLY into QuestionSemantics. Missing semantics stay missing:
// the Core then abstains (PROVISIONAL) rather than inventing a construct. Model-
// produced metadata never reaches here; wording is never interpreted.

import type { StudioGovernedInput, StudioQuestionInput } from "./adapter";
import type { QuestionSemantics, OptionSemantics, ScaleType, Polarity } from "../semantic/metadata";

/** The minimal shape of a persisted Studio evidence snapshot the Core reads. The
 *  semantic fields (Stage 5D) are optional — absent on pre-5D snapshots and on any
 *  question with no governed scale. */
export type StudioEvidenceSnapshot = {
  study?: { id?: string; objective?: string | null };
  evidence: Array<{
    canonicalQuestionKey: string;
    question?: string;
    scope: string;            // "combined" | "survey"
    optionId: string;
    optionLabel?: string;
    count: number;
    base: number;
    // Governed semantics (Stage 5D), verbatim from the instrument:
    scaleType?: ScaleType;
    constructKey?: string;    // question-level; the Core namespaces it per question
    ordinalPosition?: number; // per option
    polarity?: Polarity;      // per option
  }>;
};

/** Accumulates governed semantics for one question as evidence rows are scanned. */
type SemAccum = { scaleType?: ScaleType; constructKey?: string; options: Map<string, OptionSemantics> };

/** Build a QuestionSemantics from accumulated governed facts, or undefined when the
 *  question declared no governed scale (scaleType absent). The constructId is
 *  NAMESPACED per question — the Studio instrument establishes construct identity
 *  WITHIN a question (all options of a governed scale share it), and Stage 5D makes
 *  no cross-question construct claim (no ontology/registry). Provenance is
 *  `source_declared`: the instrument itself declared these facts. */
function toQuestionSemantics(questionKey: string, acc: SemAccum | undefined): QuestionSemantics | undefined {
  if (!acc || !acc.scaleType) return undefined;
  return {
    questionKey,
    scaleType: acc.scaleType,
    ...(acc.constructKey ? { constructId: `${questionKey}::${acc.constructKey}` } : {}),
    provenance: "source_declared",
    options: [...acc.options.values()],
  };
}

/** Build the Core governed input from a persisted Studio evidence snapshot. Uses
 *  ONLY combined-scope statistics (the study-level figure); survey-scoped rows are
 *  per-source detail and are intentionally not treated as separate questions. */
export function studioEvidenceToGovernedInput(snapshot: StudioEvidenceSnapshot, source: { kind: string; id: string }): StudioGovernedInput {
  const byQ = new Map<string, StudioQuestionInput>();
  const semByQ = new Map<string, SemAccum>();
  for (const e of snapshot.evidence) {
    if (e.scope !== "combined") continue;
    let q = byQ.get(e.canonicalQuestionKey);
    if (!q) { q = { canonicalQuestionKey: e.canonicalQuestionKey, text: e.question, base: e.base, options: [] }; byQ.set(e.canonicalQuestionKey, q); }
    // The answered base is per-question; keep the largest seen (single-select rows agree).
    if (e.base > q.base) q.base = e.base;
    q.options.push({ optionId: e.optionId, label: e.optionLabel, count: e.count });

    // Accumulate governed semantics (only where the instrument declared a scale).
    if (e.scaleType) {
      let acc = semByQ.get(e.canonicalQuestionKey);
      if (!acc) { acc = { options: new Map() }; semByQ.set(e.canonicalQuestionKey, acc); }
      acc.scaleType = e.scaleType;
      if (e.constructKey) acc.constructKey = e.constructKey;
      const opt: OptionSemantics = {
        optionId: e.optionId,
        ...(e.ordinalPosition != null ? { ordinalPosition: e.ordinalPosition } : {}),
        ...(e.polarity ? { polarity: e.polarity } : {}),
      };
      acc.options.set(e.optionId, opt);
    }
  }
  const questions = [...byQ.entries()].map(([key, q]) => {
    const semantics = toQuestionSemantics(key, semByQ.get(key));
    return semantics ? { ...q, semantics } : q;
  });
  return { source, objective: snapshot.study?.objective ?? undefined, questions };
}
