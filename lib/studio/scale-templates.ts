// ── Survey Studio — governed scale templates (Stage 5D) ──────────────────────
// The ONLY mechanism by which Survey Studio establishes governed semantic metadata
// on a question. Semantics are NEVER inferred from wording, option order, AI, or
// fuzzy matching (Stage 5D §2/§6). They are established solely by an author's
// EXPLICIT choice of a recognised ordered scale from this CLOSED catalog. Picking a
// template is a factual declaration: "this question uses the <construct> ordered
// scale", which fixes scaleType, each option's ordinalPosition and polarity, and a
// per-question construct — by construction, not by reading the labels.
//
// This is deliberately NOT an ontology or a global construct registry: each template
// is a self-contained instrument definition, and its construct is scoped to the
// single question it is applied to (the Core adapter namespaces it per question). It
// is also NOT a Core dependency — the string vocabularies below are identical to the
// Core's ScaleType/Polarity literals but declared locally so production Studio never
// imports lib/core.
//
// The product's answer count is 2–4 (SURVEY_LIMITS.MIN/MAX_OPTIONS), so every
// template here has 2–4 positions. Larger scales (5-/7-point) are a real product
// constraint away, not a Core one — the Core path is option-count-agnostic.

/** Same literal values as the Core's ScaleType — declared locally to keep Studio
 *  free of any lib/core import (the Stage 5C isolation rule). */
export type StudioScaleType = "nominal" | "ordinal" | "binary" | "interval";
/** Same literal values as the Core's Polarity. */
export type StudioPolarity = "positive" | "neutral" | "negative";

/** One position in an ordered scale, in DISPLAY order (index 0 = shown first).
 *  `ordinalPosition` is the scale RANK (higher = more positive); it is independent of
 *  display order. `defaultText` only prefills the editor — the author may reword the
 *  option; polarity/position come from the chosen slot, never the wording. */
export type ScaleTemplatePosition = { defaultText: string; ordinalPosition: number; polarity: StudioPolarity };

export type ScaleTemplate = {
  key: string;
  label: string;              // product-facing name shown in the authoring picker
  scaleType: StudioScaleType; // ordered scales are "ordinal"
  constructKey: string;       // the construct this scale measures (per-question when applied)
  positions: ScaleTemplatePosition[];
};

// ── The closed catalog ───────────────────────────────────────────────────────
const pos = (defaultText: string, ordinalPosition: number, polarity: StudioPolarity): ScaleTemplatePosition => ({ defaultText, ordinalPosition, polarity });

export const SCALE_TEMPLATES: readonly ScaleTemplate[] = [
  { key: "satisfaction_4", label: "Satisfaction (4-point)", scaleType: "ordinal", constructKey: "satisfaction",
    positions: [pos("Very satisfied", 4, "positive"), pos("Satisfied", 3, "positive"), pos("Dissatisfied", 2, "negative"), pos("Very dissatisfied", 1, "negative")] },
  { key: "satisfaction_3", label: "Satisfaction (3-point)", scaleType: "ordinal", constructKey: "satisfaction",
    positions: [pos("Satisfied", 3, "positive"), pos("Neither", 2, "neutral"), pos("Dissatisfied", 1, "negative")] },
  { key: "agreement_4", label: "Agreement (4-point)", scaleType: "ordinal", constructKey: "agreement",
    positions: [pos("Strongly agree", 4, "positive"), pos("Agree", 3, "positive"), pos("Disagree", 2, "negative"), pos("Strongly disagree", 1, "negative")] },
  { key: "agreement_3", label: "Agreement (3-point)", scaleType: "ordinal", constructKey: "agreement",
    positions: [pos("Agree", 3, "positive"), pos("Neither", 2, "neutral"), pos("Disagree", 1, "negative")] },
  { key: "quality_4", label: "Quality (4-point)", scaleType: "ordinal", constructKey: "quality",
    positions: [pos("Excellent", 4, "positive"), pos("Good", 3, "positive"), pos("Poor", 2, "negative"), pos("Very poor", 1, "negative")] },
  { key: "likelihood_4", label: "Likelihood (4-point)", scaleType: "ordinal", constructKey: "likelihood",
    positions: [pos("Very likely", 4, "positive"), pos("Likely", 3, "positive"), pos("Unlikely", 2, "negative"), pos("Very unlikely", 1, "negative")] },
] as const;

export function getScaleTemplate(key: string | null | undefined): ScaleTemplate | undefined {
  if (!key) return undefined;
  return SCALE_TEMPLATES.find((t) => t.key === key);
}

/** Product-facing list for the authoring picker (key + label + option count). */
export function listScaleTemplates(): Array<{ key: string; label: string; optionCount: number }> {
  return SCALE_TEMPLATES.map((t) => ({ key: t.key, label: t.label, optionCount: t.positions.length }));
}

// ── Governed instrument semantics (what is persisted on a question) ───────────
/** The governed semantic fields written onto a stored question/option. All optional:
 *  their ABSENCE is the normal state (a question with no chosen scale). */
export type GovernedOptionSemantics = { ordinal_position?: number; polarity?: StudioPolarity };
export type GovernedQuestionSemantics = { scale_type?: StudioScaleType; construct_key?: string; scale_template?: string };

/** A minimal question shape the governance step reads/writes (kept structural so it
 *  applies to the stored JSONB without pulling survey-locale types). Extra stored
 *  fields (text, canonical_question_key, …) are preserved at runtime by the spread;
 *  the type just doesn't track them. */
export type GovernableOption = { id?: unknown; text?: unknown } & GovernedOptionSemantics;
export type GovernableQuestion = { id?: unknown; text?: unknown; options?: GovernableOption[] } & GovernedQuestionSemantics;

const SEMANTIC_Q_KEYS = ["scale_type", "construct_key", "scale_template"] as const;
const SEMANTIC_O_KEYS = ["ordinal_position", "polarity"] as const;

function stripKeys<T extends object>(obj: T, keys: readonly string[]): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of keys) delete out[k];
  return out as T;
}

/** SERVER-SIDE governance: re-establish a question's semantics from its declared
 *  `scale_template` ALONE, discarding any client-supplied scale_type / polarity /
 *  ordinal_position. If the template is unknown, or its option count does not match
 *  the question's, ALL semantics are stripped (missing stays missing — never a
 *  partial or wording-derived guess). Idempotent: applying twice yields the same. */
export function governQuestionSemantics(question: GovernableQuestion): GovernableQuestion {
  const template = getScaleTemplate(question.scale_template);
  const options = Array.isArray(question.options) ? question.options : [];
  const cleanOptions = options.map((o) => stripKeys(o, SEMANTIC_O_KEYS));

  // No (or invalid) template, or an option-count mismatch → not a governed scale.
  if (!template || cleanOptions.length !== template.positions.length) {
    return { ...stripKeys(question, SEMANTIC_Q_KEYS), ...(Array.isArray(question.options) ? { options: cleanOptions } : {}) };
  }
  // Establish semantics strictly from the template, by option position.
  const governedOptions: GovernableOption[] = cleanOptions.map((o, i) => ({ ...o, ordinal_position: template.positions[i].ordinalPosition, polarity: template.positions[i].polarity }));
  return {
    ...question,
    scale_type: template.scaleType,
    construct_key: template.constructKey,
    scale_template: template.key,
    ...(Array.isArray(question.options) ? { options: governedOptions } : {}),
  };
}

/** Apply governance across a survey's questions array (the save-path entry point).
 *  Non-array input is returned untouched (validation handles shape elsewhere). */
export function governSurveyQuestions(questions: unknown): unknown {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => (q && typeof q === "object" ? governQuestionSemantics(q as GovernableQuestion) : q));
}

// ── Reading semantics back out (analysis-time) ───────────────────────────────
const isStudioPolarity = (v: unknown): v is StudioPolarity => v === "positive" || v === "neutral" || v === "negative";
const isStudioScaleType = (v: unknown): v is StudioScaleType => v === "nominal" || v === "ordinal" || v === "binary" || v === "interval";

/** Governed semantics for ONE question, resolved from stored fields for the evidence
 *  snapshot. `options` is keyed by STRING option id (matching evidence optionId). */
export type ResolvedQuestionSemantics = {
  scaleType: StudioScaleType;
  constructKey?: string;
  options: Record<string, { ordinalPosition?: number; polarity?: StudioPolarity }>;
};

/** Extract governed semantics from stored questions, keyed by question id. Only
 *  questions that carry a governed scale_type are included; everything else (custom /
 *  wording-only questions) is absent — never inferred. Pure. */
export function resolveInstrumentSemantics(
  questions: Array<{ id?: unknown; scale_type?: unknown; construct_key?: unknown; options?: unknown }>,
): Record<string, ResolvedQuestionSemantics> {
  const out: Record<string, ResolvedQuestionSemantics> = {};
  for (const q of questions) {
    if (!isStudioScaleType(q.scale_type)) continue;
    const options: ResolvedQuestionSemantics["options"] = {};
    for (const o of Array.isArray(q.options) ? q.options : []) {
      const oo = o as { id?: unknown; ordinal_position?: unknown; polarity?: unknown };
      options[String(oo.id)] = {
        ...(typeof oo.ordinal_position === "number" ? { ordinalPosition: oo.ordinal_position } : {}),
        ...(isStudioPolarity(oo.polarity) ? { polarity: oo.polarity } : {}),
      };
    }
    out[String(q.id)] = { scaleType: q.scale_type, constructKey: typeof q.construct_key === "string" ? q.construct_key : undefined, options };
  }
  return out;
}
