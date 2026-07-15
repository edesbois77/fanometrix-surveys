// Global document analysis — review/regenerate. Structural mirror of
// app/api/surveys/[id]/insights/route.ts, adapted for library_document_
// analysis (see that table's migration for why it's a separate table from
// research_summaries). GET returns the current version (or null — nothing
// to show while the automatic uploaded→extracting→analysing pipeline is
// still running, see run-extraction.ts/run-analysis.ts). POST is
// "Re-analyse": the automatic pipeline already produces the first draft,
// so this route exists for regenerating on demand, not first generation.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { getCurrentAnalysis } from "@/lib/library-documents/analysis-store";
import { performDocumentAnalysis } from "@/lib/library-documents/run-analysis";
import { IntelligenceError } from "@/lib/intelligence/types";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const data = await getCurrentAnalysis(id);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { id } = await params;
  const { confirm } = await req.json().catch(() => ({ confirm: false }));

  const { data: doc } = await supabaseAdmin
    .from("library_documents")
    .select("id, title, status")
    .eq("id", id)
    .single();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["pending_review", "approved", "failed"].includes(doc.status)) {
    return NextResponse.json({ error: `This document is still ${doc.status} — wait for that to finish before re-analysing.` }, { status: 409 });
  }

  const existing = await getCurrentAnalysis(id);
  if (existing && existing.status !== "draft" && !confirm) {
    return NextResponse.json({
      error: `This analysis is already ${existing.status}. Re-analysing will replace it with a new draft version.`,
      requiresConfirm: true,
    }, { status: 409 });
  }

  try {
    const saved = await performDocumentAnalysis(id, doc.title, session.workEmail);
    await supabaseAdmin
      .from("library_documents")
      .update({ status: "pending_review", error_message: null })
      .eq("id", id);
    return NextResponse.json({ data: saved });
  } catch (err) {
    if (err instanceof IntelligenceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to analyse this document." }, { status: 500 });
  }
}
