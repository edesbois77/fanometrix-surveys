// ── Fanometrix Analytical Core — Evidence & Result contracts (pure types) ─────
// Presentation-neutral, provenance-preserving. Supersets that read adapters can
// map existing Research Projects and Survey Studio shapes into WITHOUT loss.
// Stage 1 defines these; it creates NO persistence and NO write path. Fields for
// future capabilities exist but must not be populated without source evidence.

import type {
  EvidenceKind, SourceType, Unit, DenominatorType, ResultGroupingKind, ResultOperation,
  ContributionKind, CitationStance,
} from "../vocabulary";
import type { StatisticalAssessment } from "../statistics/inference";
import type { ConstructInterpretation } from "../semantic/authority";

export type EvidenceRef = string;   // opaque, stable within its analysis run / source
export type ResultRef = string;

/** A quantitative value bound to its explicit scale (Stage 1.1). Bundling the
 *  number with its `unit` makes it IMPOSSIBLE to carry a value without knowing
 *  its scale, so `0.336` (proportion) can never be confused with `33.6`
 *  (percentage_points). This is the only way a measured number enters the Core. */
export type Quantity = { value: number; unit: Unit };

/** Governed source material from which analytical claims can legitimately be
 *  made (§3.1). AI-generated interpretation is NOT Evidence. */
export type Evidence = {
  id: string;                        // REQUIRED
  kind: EvidenceKind;                // REQUIRED (base | derived | segment | respondent)
  /** WHAT KIND OF KNOWLEDGE this evidence supplies to a claim (first-class, so
   *  governance never depends on product-specific `sourceMeta`). Adapters set it
   *  from the source's definitional contribution; absent when unavailable. */
  contribution?: ContributionKind;
  /** WHAT THIS citation does for the claim it is cited on. Absent when the source
   *  does not model a claim-relationship stance (e.g. Survey Studio evidence). */
  stance?: CitationStance;
  // Core-native producers always set these; read adapters set them only when the
  // source actually stores them. The Research Projects citation model does NOT
  // carry a plain source type/id on an evidence row (it is observation/citation
  // based), so a faithful adapter leaves them ABSENT rather than inventing them —
  // the raw contribution/provenance is preserved in `sourceMeta` instead.
  sourceType?: SourceType;
  sourceId?: string;
  provenance?: { studyId?: string; projectId?: string; surveyId?: string; analysisRunId?: string };
  question?: { canonicalKey: string; index?: number; text?: string };
  option?: { id: string; label?: string };
  segment?: { dimension: string; value: string };
  numerator?: number;                 // a count — no scale ambiguity
  denominator?: number;               // a count — no scale ambiguity
  denominatorType?: DenominatorType;  // defaults to "respondents" at read
  rawBase?: number;                   // unweighted respondent count (Decision 12)
  weightedBase?: number;              // Decision 12 — NOT populated in Stage 1
  /** The measured figure WITH explicit scale. Absent when the source stored no
   *  scalar value. A value can never be present without its unit. */
  quantity?: Quantity;
  observationKey?: string;            // independence key (RP model)
  frozen?: { frozenAt: string | null; snapshot: Record<string, unknown> }; // §23
  sourceMeta?: Record<string, unknown>; // faithful passthrough of source-only fields
};

/** A deterministic statement derived directly from Evidence (§3.2). A Result is
 *  always a NUMBER. A thematic synthesis is NOT a Result (see grouping). */
export type Result = {
  id: string;                        // REQUIRED
  operation: ResultOperation;        // REQUIRED
  /** REQUIRED — a Result is a number WITH explicit scale (proportion vs
   *  percentage_points vs count vs index). Never a bare number. */
  quantity: Quantity;
  label?: string;
  questionKey?: string;
  numerator?: number;                // a count
  denominator?: number;              // a count
  denominatorType?: DenominatorType;
  base?: number;
  components?: (EvidenceRef | ResultRef)[];   // what this was computed from (auditable)
  /** Grouping provenance (Decision 7/8). Restricted to explicit | governed_semantic —
   *  a thematic synthesis cannot be encoded here, so it can never become a number. */
  grouping?: { kind: ResultGroupingKind; componentLabels: string[]; parentConstruct: string };
  /** Present only for operation === "comparison". */
  statisticalAssessment?: StatisticalAssessment;
  policyVersion?: string;
  /** WHAT this Result is taken to represent (Standard v1.2 §45, Stage 5R.2).
   *  SEPARATE from the arithmetic above: attaching, rejecting or abstaining on an
   *  interpretation NEVER changes the Result's value/components. Absent on ordinary
   *  descriptive Results that introduce no novel construct. */
  interpretation?: ConstructInterpretation;
};

export type { StatisticalAssessment } from "../statistics/inference";
