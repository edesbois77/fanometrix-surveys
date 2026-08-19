// ── Research intelligence persistence identity (server-only) ─────────────────
// ONE definition of what makes a research-intelligence artefact reusable, shared by the
// read (does a reusable artefact exist for the current evidence?), the handler skip-guard
// (has this exact combination already been reasoned?), and the write (UPSERT target). The
// identity is deliberately NOT the analysis run id — it is:
//
//     (source_kind, source_id, evidence_fingerprint, prompt_version, schema_version, model)
//
// i.e. "same governed evidence + same methodology ⇒ same intelligence". Re-running
// deterministic analysis over unchanged evidence produces a new run id but the SAME
// fingerprint, so it reuses (no model call, no fallback flicker); a genuine evidence
// change (new fingerprint) or a methodology version bump falls outside this key and is
// treated as new. The analysis_run_id column is retained as PROVENANCE, never identity.
import { REASONER_MODEL, REASONER_PROMPT_VERSION, REASONER_SCHEMA_VERSION } from "@/lib/research-intelligence/model";
import type { ResearchSourceKind } from "@/lib/research-intelligence/source";

/** The persisted artefact table. Kept as the existing name in Stage A so no live row is
 *  moved and no rename risk is taken; the columns already generalise across sources. */
export const RESEARCH_INTELLIGENCE_TABLE = "research_reasoner_runs";

/** UPSERT conflict target = the fingerprint identity (matches the unique index added in
 *  migration 202). Plain columns only, so supabase-js onConflict can name them. */
export const RESEARCH_INTELLIGENCE_IDENTITY = "source_kind,source_id,evidence_fingerprint,prompt_version,schema_version,model";

/** The identity of an artefact for a given source + evidence fingerprint under the CURRENT
 *  methodology (prompt/schema/model). Same evidence + same methodology ⇒ same key. */
export type IntelligenceIdentity = {
  source_kind: ResearchSourceKind;
  source_id: string;
  evidence_fingerprint: string;
  prompt_version: string;
  schema_version: string;
  model: string;
};

export function currentMethodologyIdentity(
  sourceKind: ResearchSourceKind,
  sourceId: string,
  evidenceFingerprint: string,
): IntelligenceIdentity {
  return {
    source_kind: sourceKind,
    source_id: sourceId,
    evidence_fingerprint: evidenceFingerprint,
    prompt_version: REASONER_PROMPT_VERSION,
    schema_version: REASONER_SCHEMA_VERSION,
    model: REASONER_MODEL,
  };
}
