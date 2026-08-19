// ── Fanometrix Analytical Core — Construct Authority (Stage 5R.1) ─────────────
// A new epistemic axis (Standard v1.2 §44): WHY is Fanometrix entitled to treat a
// constructed meaning as real? Deliberately ORTHOGONAL to Confidence, Materiality,
// statistical significance, Relevance, Priority and evidence strength — a strong
// number cannot compensate for weak Construct Authority (Principle 2).
//
// Stage 5R.1 adds ONLY the state + the deterministic priority ceiling required to
// close the Stage 5 model-authority leak. The machinery that ESTABLISHES declared/
// derived/attested authority (source metadata, deterministic entailment, human
// attestation, semantic provenance) arrives in later 5R batches. Until then every
// model-proposed novel construct is PROVISIONAL by construction.

export type ConstructAuthority =
  | "declared"     // meaning explicitly established by an authoritative source/instrument
  | "derived"      // meaning follows deterministically from already-governed semantics
  | "attested"     // meaning independently established via an approved validation route
  | "provisional"; // meaning proposed (e.g. by a model) but lacking independent authority

/** The MAXIMUM Finding priority a Construct Authority permits for a NOVEL
 *  quantitative interpretation (Standard v1.2 §36/§44). PROVISIONAL — meaning
 *  resting only on model judgement — can never be a headline: capped at Contextual
 *  (retained as exploratory context, never Suppressed for being provisional).
 *  DECLARED / DERIVED / ATTESTED impose no ceiling (normal ranking). */
export const AUTHORITY_CEILING: Record<ConstructAuthority, "primary" | "contextual"> = {
  declared: "primary",
  derived: "primary",
  attested: "primary",
  provisional: "contextual",
};

// ── Result truth vs Interpretation authority (Stage 5R.2, Standard v1.2 §45) ───
// A mathematically valid Result and a semantically authoritative interpretation
// are SEPARATE analytical objects. A Result may exist with no interpretation; an
// interpretation never changes the Result's arithmetic.

/** The semantic model's decision about a proposed interpretation. Kept SEPARATE
 *  from authority: a model may `approved`-as-plausible without granting authority
 *  above provisional. `unable_to_establish` is first-class (never silently mapped
 *  to approved or rejected). */
export type SemanticDecision = "approved" | "rejected" | "unable_to_establish";

/** WHERE an interpretation's meaning came from — distinct from WHY we may use it
 *  (authority). `model_proposed` describes origin, NOT entitlement. Stage 5R.2
 *  actively produces only the model provenances; the others are contract-reserved
 *  for the routes built in later batches. */
export type SemanticProvenance =
  | "source_declared"      // declared on the instrument/source
  | "deterministic_recode" // derived by a governed rule over metadata
  | "governed_pattern"     // matched a validated construct-registry pattern
  | "prior_attested"       // a previously attested construct, reused
  | "human_defined"        // asserted/approved by an authorised person
  | "model_proposed"       // first suggested by a model (grouping/recode)
  | "model_synthesised";   // a model-connected cross-question/source synthesis

/** The MAXIMUM authority a provenance may ever confer (Standard v1.2 §47.1). This
 *  makes "provenance is not authority" enforceable: a model-origin interpretation
 *  can never be more than PROVISIONAL, whatever else is claimed. */
export const MAX_AUTHORITY_FOR_PROVENANCE: Record<SemanticProvenance, ConstructAuthority> = {
  source_declared: "declared",
  deterministic_recode: "derived",
  governed_pattern: "derived",
  prior_attested: "attested",
  human_defined: "attested",
  model_proposed: "provisional",
  model_synthesised: "provisional",
};

/** True when `authority` does not exceed what `provenance` may confer. Deterministic
 *  guard against a model-origin interpretation self-escalating (Standard v1.2 §8). */
export function authorityWithinProvenance(authority: ConstructAuthority, provenance: SemanticProvenance): boolean {
  const order: Record<ConstructAuthority, number> = { provisional: 0, derived: 1, attested: 2, declared: 3 };
  const cap = MAX_AUTHORITY_FOR_PROVENANCE[provenance];
  // declared and derived are both "no ceiling" for ranking; compare by the
  // provenance cap's own rank, treating declared/derived/attested as independently
  // sufficient. A model provenance caps at provisional (rank 0).
  return order[authority] <= order[cap];
}

/** WHAT Fanometrix says a Result represents — separate from the Result itself
 *  (Standard v1.2 §45). Attaches to a Result via `Result.interpretation`. A Finding
 *  references it by id (`Finding.constructInterpretationId`) and derives authority
 *  from it — it never carries an independent, mutable authority duplicate. */
export type ConstructInterpretation = {
  id: string;
  label: string;                    // the semantic claim ("perceives at least some relevance")
  construct?: string;               // the construct/meaning reference, when available
  decision: SemanticDecision;       // approved | rejected | unable_to_establish
  authority: ConstructAuthority;    // WHY we may use it (never above what provenance permits)
  provenance: SemanticProvenance;   // WHERE the meaning came from
  reviewRequired: boolean;          // still needs independent authority/validation
  caveats: string[];                // mandatory disclosures
  /** Audit trail for a DERIVED (or deterministically rejected) interpretation
   *  (Stage 5R.4, Standard v1.2 §47.2): the governed facts that entitled — or
   *  forbade — the label. NO hidden reasoning; structured facts only. */
  derivation?: {
    method: string;                 // e.g. "same_governed_construct_union"
    componentIds: string[];         // the governed component evidence ids combined
    constructIds: (string | undefined)[]; // each component's governed constructId
    metadataProvenance?: string;    // MetadataProvenance of the governing metadata
    schemaVersion: string;          // SEMANTIC_SCHEMA_VERSION at derivation time
  };
};

/** The interpretation-contract schema version (Standard v1.2 §47.2). Bumped when
 *  the ConstructInterpretation shape changes; recorded in a run's VersionSet so a
 *  historical Finding can answer which interpretation schema produced it. */
export const SEMANTIC_SCHEMA_VERSION = "interpretation_v1";
