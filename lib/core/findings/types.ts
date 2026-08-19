// ── Fanometrix Analytical Core — Finding contract (pure types) ────────────────
// The presentation-neutral, traceable analytical record (§22, §24). A superset
// capable of adapting Research Projects findings, Survey Studio curated Findings
// and the deterministic engine. The analytical chain
// Evidence → Result → Finding → Insight → Implication → Recommendation may stop
// at any stage: the interpretive fields are all optional.
//
// Stage 1 defines this contract only. Read adapters populate the factual/
// provenance fields from data that ALREADY exists; the assessed/interpretive
// fields (confidence, materiality, priority, insight, implications,
// recommendations, caveats, claimStrength, change) are populated by LATER
// stages and MUST remain absent when adapting existing sources.

import type {
  Confidence, Materiality, Priority, RecommendationTier, FindingStatus,
  ChangeState, QuestionComparability,
} from "../vocabulary";
import type { Evidence, Result, StatisticalAssessment } from "../evidence/types";
import type { VersionTriple } from "../version";
import type { ConstructAuthority } from "../semantic/authority";

/** "What does this tell us?" (§3.4) — populated by a later stage. */
export type Insight = { text: string; provenance?: string };
/** "Why should the reader care?" (§3.5) — populated by a later stage. */
export type Implication = { text: string; provenance?: string };
/** An action someone might consider (§3.6, Decision 8) — populated by a later stage. */
export type Recommendation = {
  text: string;
  tier: RecommendationTier;
  supportingFindingIds?: string[];
  /** Whether the claimed outcome relationship was actually MEASURED (Decision 8). */
  outcomeMeasured?: boolean;
};

export type Finding = {
  id: string;                                   // REQUIRED
  statement: string;                            // REQUIRED — the claim
  assertionType?: string;
  scope?: string | null;
  // Traceability (§22).
  evidence: Evidence[];                         // REQUIRED (normally present)
  results?: Result[];
  source?: { studyId?: string; projectId?: string; surveyId?: string };
  questions?: string[];
  segments?: { dimension: string; value: string }[];
  comparisons?: Result[];
  statisticalAssessment?: StatisticalAssessment;
  // ── Assessed / interpretive layers — POPULATED BY LATER STAGES, not Stage 1 ──
  confidence?: Confidence;
  materiality?: Materiality;
  priority?: Priority;
  insight?: Insight;
  implications?: Implication[];
  recommendations?: Recommendation[];
  caveats?: string[];
  claimStrength?: string;
  change?: { state: ChangeState; comparability: QuestionComparability };
  /** Ids of the component Findings this Finding SYNTHESISES (Stage 3.1). Set
   *  explicitly by a producer — never inferred from wording. A synthesis does not
   *  outrank its components by default (it would double-count one story). */
  derivedFrom?: string[];
  /** A GOVERNED decision that this synthesis IS the central story and may outrank
   *  its components (Stage 5R.6 §7). A structured route, NOT a naked boolean — a
   *  model signal can never set it. Absent = conservative default (capped). */
  synthesisElevation?: { route: "governed_review" | "human_attested" };
  /** Reference to the governing ConstructInterpretation carried on one of this
   *  Finding's `results[].interpretation` (Stage 5R.2, Standard v1.2 §45). When
   *  present, it is the SINGLE source of construct authority (read via
   *  `constructAuthorityOf`); `constructAuthority` below is NOT set alongside it. */
  constructInterpretationId?: string;
  /** FALLBACK authority for a Finding that introduces a novel construct but carries
   *  NO Result-level interpretation (e.g. directly-constructed/legacy Findings and
   *  focused unit tests). The canonical pipeline sets the interpretation instead,
   *  so this and the interpretation never coexist — no independent mutable
   *  duplicate. Absent = no novel construct → normal ranking. */
  constructAuthority?: ConstructAuthority;
  // Provenance.
  version: VersionTriple;                       // REQUIRED (may hold nulls)
  model?: string | null;
  promptVersion?: string | null;
  analysisRunId?: string | null;
  status: FindingStatus;                        // REQUIRED
  frozen?: { frozenAt: string | null };
  revisionRef?: string | null;
  sourceMeta?: Record<string, unknown>;
};
