// Generates and persists a Document's project-specific Intelligence report.
// Structural mirror of app/api/surveys/[id]/insights/route.ts, with one
// deliberate difference: `evidenceId` here is the research_project_evidence
// row's own id, not the source's own id (library_documents.id) — Document
// Intelligence's research_summaries.source_id is that evidence row's id
// (migration 102), since the same document attached to two projects gets
// two independent summaries. `id` (the project) is only used to confirm
// the evidence row actually belongs to the project this route is nested
// under, never to resolve the summary itself.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { analyseDocumentForProject } from "@/lib/intelligence/analysts/analyseDocumentForProject";
import { getSummary, saveDraft } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";

export type { DocumentIntelligenceReport } from "@/lib/intelligence/analysts/analyseDocumentForProject";

async function assertEvidenceBelongsToProject(projectId: string, evidenceId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id")
    .eq("id", evidenceId)
    .eq("research_project_id", projectId)
    .eq("evidence_type", "document")
    .maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; evidenceId: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id, evidenceId } = await params;
  if (!(await assertEvidenceBelongsToProject(id, evidenceId))) {
    return NextResponse.json({ error: "This document isn't attached to this project." }, { status: 404 });
  }

  const data = await getSummary("document_project", evidenceId, "research_summary");
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; evidenceId: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id, evidenceId } = await params;
  if (!(await assertEvidenceBelongsToProject(id, evidenceId))) {
    return NextResponse.json({ error: "This document isn't attached to this project." }, { status: 404 });
  }

  const { confirm } = await req.json().catch(() => ({ confirm: false }));

  // Regenerating replaces the current draft outright, but once an admin
  // has edited/approved/published it, silently discarding that work would
  // be a real loss — require an explicit confirm to overwrite, same rule
  // as every other per-source Intelligence type.
  const existing = await getSummary("document_project", evidenceId, "research_summary");
  if (existing && existing.status !== "draft" && !confirm) {
    return NextResponse.json({
      error: `This summary is already ${existing.status}. Regenerating will replace it and reset it to Draft.`,
      requiresConfirm: true,
    }, { status: 409 });
  }

  try {
    const report = await analyseDocumentForProject(evidenceId);
    const saved  = await saveDraft({
      sourceType:  "document_project",
      sourceId:    evidenceId,
      outputType:  "research_summary",
      content:     report,
      model:       "gpt-4o",
      generatedBy: session.workEmail,
    });
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to generate intelligence." }, { status: 500 });
  }
}
