// Pure evidence-coverage math shared by the Workspace's Reports section,
// the Executive Report page's pre-generation confirm dialog, AND (via
// assertReportReadiness below) the server-side analyst that actually
// enforces it — one function decides "is there enough approved evidence",
// read by the UI to warn/confirm and by the analyst to refuse, instead of
// each side deriving its own count.
//
// Deliberately generic (attachment/approval coverage, not
// Executive-Report-specific) so future report types reuse it unchanged —
// this is a pre-generation gate on *what's attached and approved*, a
// different concept from EvidenceStrength in analyseExecutiveReport.ts,
// which is a post-generation read on how the generated report actually
// turned out (corroboration across the findings the model produced).
import { IntelligenceError } from "@/lib/intelligence/types";
import { getSourceLabel, isKnownEvidenceType, type EvidenceTypeId } from "@/lib/research-sources/registry";

export type ReportEvidenceSourceRef = {
  evidence_type: EvidenceTypeId;
  evidence_id: string;
  label: string;
};

export type ReportEvidenceExcludedRef = ReportEvidenceSourceRef & { reason: string };

export type ReportReadiness = {
  total: number;
  approvedCount: number;
  readiness: "empty" | "partial" | "ready";
  included: ReportEvidenceSourceRef[];
  excluded: ReportEvidenceExcludedRef[];
};

export type ReadinessEvidenceItem = {
  evidence_type: "survey" | "social_search" | "document";
  evidence_id: string;
  survey: { name: string; summary_status: string | null } | null;
  conversationSearch: { name: string; summary_status: string | null } | null;
  document: { name: string; summary_status: string | null } | null;
};

function excludedReason(status: string | null): string {
  if (status === "draft") return "Intelligence still in draft";
  if (status === "edited") return "Intelligence edited but not yet approved";
  return "No Intelligence generated yet";
}

export function computeReportReadiness(evidence: ReadinessEvidenceItem[]): ReportReadiness {
  // Any evidence type not yet in the registry has no Intelligence pipeline
  // yet — excluded from readiness entirely rather than counted as a
  // permanent gap. Adding a type to getEvidenceTypesWithIntelligence() is
  // what makes this function start counting it, with no change needed here.
  const relevant = evidence.filter((e): e is ReadinessEvidenceItem & { evidence_type: EvidenceTypeId } =>
    isKnownEvidenceType(e.evidence_type)
  );

  const included: ReportEvidenceSourceRef[] = [];
  const excluded: ReportEvidenceExcludedRef[] = [];

  for (const item of relevant) {
    const source = item.evidence_type === "survey" ? item.survey
      : item.evidence_type === "social_search" ? item.conversationSearch
      : item.document;
    const label = source?.name ?? getSourceLabel(item.evidence_type);
    const status = source?.summary_status ?? null;
    const ref = { evidence_type: item.evidence_type, evidence_id: item.evidence_id, label };
    if (status === "approved" || status === "published") {
      included.push(ref);
    } else {
      excluded.push({ ...ref, reason: excludedReason(status) });
    }
  }

  const total = relevant.length;
  const approvedCount = included.length;
  const readiness: ReportReadiness["readiness"] =
    approvedCount === 0 ? "empty" : approvedCount === total ? "ready" : "partial";

  return { total, approvedCount, readiness, included, excluded };
}

// Server-side enforcement, not just UI display — call before generation
// so "nothing approved yet" is refused the same way regardless of which
// report type is asking. `entityLabel` slots into the same message
// Executive Report always threw (e.g. "an Executive Report"), so this is
// a behaviour-preserving extraction, not a new rule.
export function assertReportReadiness(readiness: ReportReadiness, entityLabel: string) {
  if (readiness.readiness === "empty") {
    throw new IntelligenceError(
      400,
      `None of this project's attached Research Sources have approved Intelligence yet. Approve at least one Survey, Conversation Search or Document Intelligence report before generating ${entityLabel}.`
    );
  }
}
