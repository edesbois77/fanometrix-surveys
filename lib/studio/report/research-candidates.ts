// ── Stage C2 — Research Intelligence → Report review CANDIDATES (server-only) ─
// Derives candidate Report findings from ALREADY-PERSISTED, verified Research Intelligence
// artefacts (Study + its member Surveys) at review time. It NEVER calls o3 and NEVER
// writes — candidates are a read-time projection of existing artefacts. Nothing here
// accepts or publishes: a human must explicitly accept a candidate (createFindingFrom
// ResearchInsight) for it to become even a DRAFT finding, and publishing stays a separate
// human action. Rejected/withheld insights never appear (the artefact only holds verified,
// tier-labelled insights; recommendations/overreach were already dropped by the verifier).
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { canCurateStudies } from "@/lib/studio/study";
import { getCurrentResearchArtefact } from "@/lib/research-intelligence/read";
import { studyResearchSource, surveyResearchSource } from "@/lib/research-intelligence/source";
import type { ProductInsight, ProductIntelligence, AuthorityTier, EvidenceLine } from "@/lib/research-intelligence/product";

export type CandidateSourceKind = "survey" | "study";
/** Server-side candidate — carries evidenceRefs for dedup + provenance; the API strips
 *  refs before returning to the client (internal ids are never exposed to the UI). */
export type ResearchCandidate = {
  sourceKind: CandidateSourceKind; sourceId: string; sourceTitle: string;
  evidenceFingerprint: string; insightId: string;
  authority: AuthorityTier; section: "key_insight" | "consideration";
  takeaway: string; statement: string; whyItMatters: string; caveat: string; confidence: string;
  evidence: EvidenceLine[]; counterEvidence: EvidenceLine[];
  evidenceRefs: string[];
  /** Post-C2 artefacts carry original refs and can freeze governed evidence; pre-C2 cannot. */
  canFreeze: boolean;
  /** An RI finding for this exact (source, fingerprint, insight) identity already exists. */
  alreadyAccepted: boolean;
};

type Result<T> = { ok: boolean; status: number; data?: T; error?: string };

/** Canonical-question keys an insight rests on, parsed from its governed refs (…|q#<key>|…). */
export function questionKeysOf(refs: string[]): Set<string> {
  const keys = new Set<string>();
  for (const r of refs) { const m = /\|q#([^|]+)/.exec(r); if (m) keys.add(m[1]); }
  return keys;
}
const identityKey = (sourceKind: string, sourceId: string, fp: string, insightId: string) => `${sourceKind}|${sourceId}|${fp}|${insightId}`;

function toCandidates(
  art: { evidenceFingerprint: string; product: ProductIntelligence }, sourceKind: CandidateSourceKind, sourceId: string, sourceTitle: string,
): ResearchCandidate[] {
  const mk = (i: ProductInsight, section: "key_insight" | "consideration"): ResearchCandidate => {
    const refs = Array.isArray(i.evidenceRefs) ? i.evidenceRefs : [];
    return {
      sourceKind, sourceId, sourceTitle, evidenceFingerprint: art.evidenceFingerprint, insightId: i.id,
      authority: i.authority, section,
      takeaway: i.takeaway, statement: i.explanation, whyItMatters: i.whyItMatters, caveat: i.caveat, confidence: i.confidence,
      evidence: i.evidence, counterEvidence: i.counterEvidence, evidenceRefs: refs,
      canFreeze: refs.length > 0, alreadyAccepted: false,
    };
  };
  return [
    ...(art.product.keyInsights ?? []).map((i) => mk(i, "key_insight")),
    ...(art.product.toConsider ?? []).map((i) => mk(i, "consideration")),
  ];
}

/** The set of RI-insight identities already accepted as findings for this study (any status),
 *  so an accepted insight is never re-offered. Fingerprint-specific: a finding from an OLDER
 *  fingerprint does NOT suppress the CURRENT candidate (changed evidence is genuinely new). */
async function acceptedIdentities(studyId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from("study_findings")
    .select("ri_source_kind, ri_source_id, ri_evidence_fingerprint, ri_insight_id")
    .eq("study_id", studyId).eq("origin_type", "research_intelligence");
  const set = new Set<string>();
  for (const r of (data ?? []) as { ri_source_kind: string; ri_source_id: string; ri_evidence_fingerprint: string; ri_insight_id: string }[]) {
    if (r.ri_source_kind && r.ri_source_id && r.ri_evidence_fingerprint && r.ri_insight_id) set.add(identityKey(r.ri_source_kind, r.ri_source_id, r.ri_evidence_fingerprint, r.ri_insight_id));
  }
  return set;
}

/** Derive Report review candidates for a Study from persisted verified RI artefacts.
 *  Policy (deterministic, conservative): PREFER the highest legitimate reasoning level —
 *  Study-level insights lead; a member Survey's insight is surfaced only when it rests on a
 *  canonical question the Study artefact does NOT already reason over (so we never duplicate
 *  the underlying surveys, but we don't lose survey-only findings). No model decides dupes. */
export async function deriveStudyReportCandidates(session: AuthedUser, studyId: string): Promise<Result<{ candidates: ResearchCandidate[] }>> {
  if (!canCurateStudies(session)) return { ok: false, status: 403, error: "Forbidden" };
  const { data: study } = await supabaseAdmin.from("studies").select("id, name").eq("id", studyId).single();
  if (!study) return { ok: false, status: 404, error: "Study not found" };
  const studyTitle = (study as { name?: string }).name ?? "This study";

  // Study-level (primary).
  const studyArt = await getCurrentResearchArtefact(studyResearchSource(studyId));
  const studyCands = studyArt ? toCandidates(studyArt, "study", studyId, studyTitle) : [];
  const studyKeys = new Set<string>();
  for (const c of studyCands) for (const k of questionKeysOf(c.evidenceRefs)) studyKeys.add(k);

  // Member-survey supplement (only questions the Study did not cover).
  const { data: svRows } = await supabaseAdmin.from("surveys").select("id, name").eq("study_id", studyId).is("deleted_at", null);
  const surveyCands: ResearchCandidate[] = [];
  for (const sv of (svRows ?? []) as { id: string; name: string | null }[]) {
    const art = await getCurrentResearchArtefact(surveyResearchSource(sv.id));
    if (!art) continue;
    for (const c of toCandidates(art, "survey", sv.id, sv.name ?? "Survey")) {
      const ks = questionKeysOf(c.evidenceRefs);
      // Keep a survey candidate only if it touches a question the Study artefact does not cover.
      if (ks.size > 0 && ![...ks].every((k) => studyKeys.has(k))) surveyCands.push(c);
    }
  }

  const accepted = await acceptedIdentities(studyId);
  const candidates = [...studyCands, ...surveyCands].map((c) => ({ ...c, alreadyAccepted: accepted.has(identityKey(c.sourceKind, c.sourceId, c.evidenceFingerprint, c.insightId)) }));
  return { ok: true, status: 200, data: { candidates } };
}
