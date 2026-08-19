// ── Research source adapter (source-agnostic intelligence) ───────────────────
// The reasoning stack (evidence-package → o3 → verifier → shaper) is already snapshot-
// agnostic: it reasons over a governed evidence snapshot and knows nothing about where
// that snapshot came from. THIS is the only piece that knows a source's shape. A
// ResearchSource resolves the AUTHORITATIVE governed evidence for one research object —
// today a Survey; a Study / Report / cross-survey comparison can add its own adapter
// later WITHOUT touching the engine, the verifier, the persistence identity, or the read.
//
// Two facts define research intelligence and are kept deliberately distinct:
//   • IDENTITY   = the evidence FINGERPRINT (evidence_hash). Same governed evidence +
//                  same methodology version ⇒ the same reusable intelligence. This is
//                  what the persistence key and the read are keyed on.
//   • PROVENANCE = the analysis RUN that produced/last-confirmed that evidence. Retained
//                  for audit (which run, when) but NOT the identity — re-running analysis
//                  over unchanged evidence yields a NEW run id but the SAME fingerprint,
//                  so it must reuse, never regenerate.
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Research object kinds. Only 'survey' is wired in Stage A; the others are reserved so
 *  the identity/persistence/read are already source-agnostic when their adapters land. */
export type ResearchSourceKind = "survey" | "study" | "report" | "comparison";

/** The full authoritative evidence for one analysis run — everything the engine needs to
 *  reason, plus the two identity/provenance facts. `snapshot` is the IMMUTABLE governed
 *  evidence snapshot stored on the run (never live results). */
export type AuthoritativeEvidence = {
  sourceKind: ResearchSourceKind;
  sourceId: string;
  /** Provenance: the analysis run this evidence was read from. */
  analysisRunId: string;
  /** Identity: same governed evidence ⇒ same fingerprint. */
  evidenceFingerprint: string;
  snapshot: { evidence?: unknown[] } & Record<string, unknown>;
};

/** Lightweight identity of the CURRENT authoritative evidence — the read never needs the
 *  (potentially large) snapshot, only which run is current and its fingerprint. */
export type CurrentEvidenceIdentity = { analysisRunId: string; evidenceFingerprint: string };

export interface ResearchSource {
  readonly kind: ResearchSourceKind;
  readonly sourceId: string;
  /** Identity of the current authoritative evidence (latest completed analysis), or null
   *  when there is none / it has no fingerprint yet. Cheap — no snapshot fetched. */
  resolveCurrent(): Promise<CurrentEvidenceIdentity | null>;
  /** Full authoritative evidence for a SPECIFIC run (used by the job to reason), or null
   *  when the run is missing or carries no usable governed evidence. */
  resolveRun(analysisRunId: string): Promise<AuthoritativeEvidence | null>;
}

// ── Survey source ────────────────────────────────────────────────────────────
// Authoritative evidence for a Survey = its survey_analysis_runs row: the immutable
// evidence_snapshot + the evidence_hash fingerprint. resolveCurrent picks the latest
// COMPLETED run; resolveRun fixes tenant identity + snapshot from a trusted stored record
// (never a job payload).
export function surveyResearchSource(surveyId: string): ResearchSource {
  return {
    kind: "survey",
    sourceId: surveyId,
    async resolveCurrent() {
      const { data } = await supabaseAdmin
        .from("survey_analysis_runs")
        .select("id, evidence_hash")
        .eq("survey_id", surveyId).eq("status", "completed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const row = data as { id?: string; evidence_hash?: string | null } | null;
      if (!row?.id || !row.evidence_hash) return null; // no run, or no fingerprint → nothing reusable
      return { analysisRunId: row.id, evidenceFingerprint: row.evidence_hash };
    },
    async resolveRun(analysisRunId: string) {
      const { data, error } = await supabaseAdmin
        .from("survey_analysis_runs")
        .select("id, survey_id, evidence_snapshot, evidence_hash")
        .eq("id", analysisRunId).single();
      if (error || !data) return null;
      const row = data as {
        id: string;
        survey_id: string;
        evidence_snapshot?: ({ evidence?: unknown[] } & Record<string, unknown>) | null;
        evidence_hash?: string | null;
      };
      const snapshot = row.evidence_snapshot ?? null;
      if (!snapshot || !Array.isArray(snapshot.evidence) || snapshot.evidence.length === 0) return null;
      if (!row.evidence_hash) return null; // no fingerprint ⇒ no stable identity ⇒ do not persist
      return {
        sourceKind: "survey",
        sourceId: row.survey_id,
        analysisRunId: row.id,
        evidenceFingerprint: row.evidence_hash,
        snapshot,
      };
    },
  };
}

// ── Study source ─────────────────────────────────────────────────────────────
// Authoritative evidence for a Study = its study_analysis_runs row: the immutable
// evidence_snapshot (which spreads the same StudyAnalysisEvidence payload — evidence[] /
// derived[] / segmentDerived[] / study meta — that surveys produce) + the evidence_hash
// fingerprint (sha256 of the canonical governed evidence, stable across the narrative/
// themes update). Structurally identical to the survey adapter; the only differences are
// the table and that source_id is the study id. It fabricates NO semantics: the same
// evidence-package builder + reasoner + verifier + shaper consume it unchanged, and the
// builder's combined-only filter means Study reasoning sees the governed cross-survey
// COMBINED evidence, never incomparable per-survey rows.
export function studyResearchSource(studyId: string): ResearchSource {
  return {
    kind: "study",
    sourceId: studyId,
    async resolveCurrent() {
      const { data } = await supabaseAdmin
        .from("study_analysis_runs")
        .select("id, evidence_hash")
        .eq("study_id", studyId).eq("status", "completed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const row = data as { id?: string; evidence_hash?: string | null } | null;
      if (!row?.id || !row.evidence_hash) return null; // no run, or no fingerprint → nothing reusable
      return { analysisRunId: row.id, evidenceFingerprint: row.evidence_hash };
    },
    async resolveRun(analysisRunId: string) {
      const { data, error } = await supabaseAdmin
        .from("study_analysis_runs")
        .select("id, study_id, evidence_snapshot, evidence_hash")
        .eq("id", analysisRunId).single();
      if (error || !data) return null;
      const row = data as {
        id: string;
        study_id: string;
        evidence_snapshot?: ({ evidence?: unknown[] } & Record<string, unknown>) | null;
        evidence_hash?: string | null;
      };
      const snapshot = row.evidence_snapshot ?? null;
      if (!snapshot || !Array.isArray(snapshot.evidence) || snapshot.evidence.length === 0) return null;
      if (!row.evidence_hash) return null; // no fingerprint ⇒ no stable identity ⇒ do not persist
      return {
        sourceKind: "study",
        sourceId: row.study_id,
        analysisRunId: row.id,
        evidenceFingerprint: row.evidence_hash,
        snapshot,
      };
    },
  };
}

/** Build the ResearchSource for a given kind. Stage A/C1 wire 'survey' and 'study'; the
 *  remaining reserved kinds return null so callers fail safe rather than guess. */
export function researchSourceFor(kind: ResearchSourceKind, sourceId: string): ResearchSource | null {
  if (kind === "survey") return surveyResearchSource(sourceId);
  if (kind === "study") return studyResearchSource(sourceId);
  return null; // report / comparison — reserved, not wired yet
}
