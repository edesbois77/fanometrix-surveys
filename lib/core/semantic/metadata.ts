// ── Fanometrix Analytical Core — governed semantic metadata (Stage 5R.3) ──────
// FACTS ONLY. This module records product-independent semantic facts about
// governed questions/options — what construct an item measures, whether its scale
// is ordered, where the metadata came from — so that Stage 5R.4 can LATER decide
// whether an interpretation is legitimately DERIVED. It performs NO reasoning: it
// never approves a grouping, never derives a label, never grants authority, never
// bypasses the Stage 5R.1 ceiling. `sameGovernedConstruct` reports a fact; it does
// not decide validity.
//
// Metadata is GOVERNED INPUT supplied by upstream products/sources — never inferred
// from a model or from option wording (Standard v1.2 §K/§L, Stage 5R.3 §15).

/** How a measurement is generated — ORTHOGONAL to Quantity.unit (which describes
 *  how a NUMBER is represented: proportion / percentage_points / count / index). */
export type ScaleType = "nominal" | "ordinal" | "binary" | "interval";

/** Governed semantic REGION of an ordinal option (Stage 5R.9R, Standard v1.2 §17.4).
 *  It marks which side of the scale an option belongs to so a threshold recode can
 *  respect polarity and not cross a neutral midpoint. GOVERNED metadata — never
 *  inferred from wording or from ordinal position alone. */
export type Polarity = "positive" | "neutral" | "negative";

/** WHERE governed metadata came from — kept distinct from ConstructInterpretation's
 *  SemanticProvenance (which is about the analytical meaning Fanometrix proposes).
 *  `analytically_proposed` metadata must never silently be treated as governed. */
export type MetadataProvenance = "source_declared" | "governed_imported" | "analytically_proposed";

/** Semantic facts about ONE answer option. `constructId` is per-option so a single
 *  question may legitimately contain options measuring DIFFERENT constructs (a fact
 *  5R.4 will later use — not here). */
export type OptionSemantics = {
  optionId: string;
  constructId?: string;       // the governed construct this option measures/belongs to
  ordinalPosition?: number;   // declared order; meaningful only on ordinal/binary scales
  /** GOVERNED semantic region (Stage 5R.9R). Present only where the source declares
   *  polarity. Its ABSENCE means the threshold is not governed — the Core must then
   *  abstain from a semantic ordinal recode rather than invent one. */
  polarity?: Polarity;
};

/** Governed semantic facts about ONE question. The single canonical metadata
 *  container; nothing here is duplicated onto Evidence/Result (lineage is resolved
 *  via existing component/evidence keys). */
export type QuestionSemantics = {
  questionKey: string;
  constructId?: string;       // the question's primary governed construct (option may override)
  scaleType: ScaleType;
  provenance: MetadataProvenance;
  options: OptionSemantics[];
};

// ── Fact resolvers (no reasoning, no authority effect) ────────────────────────

export function optionSemanticsOf(qs: QuestionSemantics | undefined, optionId: string): OptionSemantics | undefined {
  return qs?.options.find((o) => o.optionId === optionId);
}

/** The governed construct id for an option: its own, else the question's, else
 *  undefined (absent metadata is a normal state — never fabricated). */
export function constructIdOf(qs: QuestionSemantics | undefined, optionId: string): string | undefined {
  return optionSemanticsOf(qs, optionId)?.constructId ?? qs?.constructId;
}

export function scaleTypeOf(qs: QuestionSemantics | undefined): ScaleType | undefined {
  return qs?.scaleType;
}

export function polarityOf(qs: QuestionSemantics | undefined, optionId: string): Polarity | undefined {
  return optionSemanticsOf(qs, optionId)?.polarity;
}

/** FACT: do two governed construct ids denote the same construct? Requires BOTH to
 *  be present and exactly equal — NO fuzzy/label matching, and NO decision about
 *  whether a grouping is therefore valid (that is Stage 5R.4). */
export function sameGovernedConstruct(a: string | undefined, b: string | undefined): boolean {
  return a != null && b != null && a === b;
}

/** True when metadata is source/governed (not merely analytically proposed). Lets a
 *  future consumer refuse to treat proposed metadata as governed. */
export function isGovernedMetadata(p: MetadataProvenance): boolean {
  return p === "source_declared" || p === "governed_imported";
}

/** Structural hygiene ONLY (not semantic reasoning): flags malformed metadata —
 *  duplicate ordinal positions, or ordinalPosition supplied on a non-ordered scale.
 *  Does not infer, complete or reject any grouping. */
export function validateQuestionSemantics(qs: QuestionSemantics): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const positions = qs.options.map((o) => o.ordinalPosition).filter((p): p is number => p != null);
  if (new Set(positions).size !== positions.length) issues.push("duplicate ordinalPosition values");
  const ordered = qs.scaleType === "ordinal" || qs.scaleType === "binary";
  if (!ordered && positions.length) issues.push("ordinalPosition supplied on a non-ordered scale");
  return { ok: issues.length === 0, issues };
}
