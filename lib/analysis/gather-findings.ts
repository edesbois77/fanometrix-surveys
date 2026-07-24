// Gathering for the FINAL cross-source Analysis — over APPROVED source findings
// only (the Project Findings architecture: Evidence → Source Findings → Approval
// → Analysis).
//
// This is what makes the final reasoning small and timeout-proof. Instead of
// framing the entire multi-source evidence base per question, it frames a compact
// set of human-approved findings. Each approved finding is one admissible item,
// assigned to the design's requirements by the same declared method mapping the
// raw-evidence path uses (lib/analysis/assignment.ts), so nothing about how a
// claim is graded changes — only how much it has to chew on.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { frameEvidence, type FramedItem } from "@/lib/analysis/framing";
import { assignSource } from "@/lib/analysis/assignment";
import { isApproved, type ResearchDesign } from "@/lib/research-design";
import { asEvidenceRole } from "@/lib/evidence-role";
import {
  methodsForSource, contributionForSource, observationKeyForFinding, SOURCE_KIND_LABEL,
  type SourceKind,
} from "@/lib/analysis/source-findings/types";
import { buildLedger, realExclusions, type LedgerSource } from "@/lib/analysis/ledger";
import type { FlatNeed } from "@/lib/information-needs";
import type { GatherResult } from "@/lib/analysis/gather";

type ApprovedFinding = {
  id: string;
  sourceKind: SourceKind;
  sourceRef: string;
  sourceLabel: string;
  statement: string;
  scope: string | null;
};

/** Build one Evidence Frame per Information Need from the project's APPROVED
 *  source findings. Returns the same shape as gatherFrames so reason.ts is
 *  agnostic to which gatherer ran. */
export async function gatherApprovedFindings(projectId: string): Promise<GatherResult> {
  const unmapped: GatherResult["unmapped"] = [];
  const itemsByNeed = new Map<string, { need: FlatNeed; items: FramedItem[] }>();

  const { data: projectRow } = await supabaseAdmin
    .from("research_projects").select("research_design").eq("id", projectId).maybeSingle();
  const design = (projectRow?.research_design as ResearchDesign | null) ?? null;
  const requirements = design && isApproved(design) ? design.requirements : [];

  const { data: rows } = await supabaseAdmin
    .from("findings")
    .select("id, source_kind, source_ref, requirement_text, statement, scope")
    .eq("research_project_id", projectId)
    .eq("finding_layer", "source")
    .eq("status", "approved");

  const approved: ApprovedFinding[] = (rows ?? []).map(r => ({
    id: r.id as string,
    sourceKind: ((r.source_kind as string | null) ?? "conversation") as SourceKind,
    sourceRef: (r.source_ref as string | null) ?? "",
    sourceLabel: (r.requirement_text as string | null) ?? "",
    statement: r.statement as string,
    scope: (r.scope as string | null) ?? null,
  }));

  // Ledger counters, per source kind: how many approved findings each source
  // contributed, and how many could not be assigned to any requirement.
  const supplied = new Map<SourceKind, number>();
  const unassignable = new Map<SourceKind, number>();

  for (const f of approved) {
    if (requirements.length === 0) {
      unassignable.set(f.sourceKind, (unassignable.get(f.sourceKind) ?? 0) + 1);
      unmapped.push({ evidenceType: `finding:${f.sourceKind}`, evidenceId: f.id, reason: "The project has no approved Research Design, so there is nothing to assign this finding to." });
      continue;
    }
    const { assigned } = assignSource({ fulfils: methodsForSource(f.sourceKind), requirements });
    if (assigned.length === 0) {
      unassignable.set(f.sourceKind, (unassignable.get(f.sourceKind) ?? 0) + 1);
      unmapped.push({ evidenceType: `finding:${f.sourceKind}`, evidenceId: f.id, reason: "The approved design commissioned no requirement this source can answer." });
      continue;
    }
    supplied.set(f.sourceKind, (supplied.get(f.sourceKind) ?? 0) + 1);

    const base: Omit<FramedItem, "methodFit"> = {
      evidenceId: f.id,
      content: f.scope ? `${f.statement} (${f.scope})` : f.statement,
      contribution: contributionForSource(f.sourceKind),
      observationKey: observationKeyForFinding(f.sourceKind, f.sourceRef, f.id),
      observations: 1,
      role: asEvidenceRole("direct"),
      // Approved by a person, but not yet judged for how far it bears on THIS
      // specific need. Null is unknown, never zero — the same discipline the raw
      // path applies to design-assigned evidence.
      bearing: null,
      provenance: f.sourceLabel,
    };

    for (const { need } of assigned) {
      const entry = itemsByNeed.get(need.id) ?? { need, items: [] };
      entry.items.push({ ...base, methodFit: need.method_fit });
      itemsByNeed.set(need.id, entry);
    }
  }

  const kinds = [...new Set<SourceKind>([...supplied.keys(), ...unassignable.keys()])];
  const ledgerSources: LedgerSource[] = kinds.map(kind => ({
    key: kind,
    label: SOURCE_KIND_LABEL[kind],
    lines: [{ label: "approved findings", count: supplied.get(kind) ?? 0 }],
    supplied: supplied.get(kind) ?? 0,
    exclusions: realExclusions([
      { reason: "Approved, but the design commissioned no requirement it can answer", count: unassignable.get(kind) ?? 0 },
    ]),
  }));

  return {
    gathered: [...itemsByNeed.values()].map(({ need, items }) => ({
      need,
      frame: frameEvidence({ needId: need.id, items }),
    })),
    unmapped,
    consumption: buildLedger(ledgerSources, []),
  };
}
