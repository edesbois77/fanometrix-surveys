// Admin "Retry" for a document whose processing failed or landed in
// requires_review (exhausted automatic retries). Resets the document to a clean
// 'uploaded' start and enqueues a fresh document.process job — the same durable
// path a normal upload uses, so recovery here is identical to first-run
// processing (pg_cron will pick it up even if the after() fast-path below dies).
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { DOCUMENT_PROCESS_JOB, documentProcessDedupeKey } from "@/lib/jobs/handlers/document-process.constants";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { data: doc, error } = await supabaseAdmin
    .from("library_documents")
    .select("id, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reset to a clean start. Safe from any non-approved state; if it's already
  // approved there's nothing to reprocess.
  if (doc.status === "approved") {
    return NextResponse.json({ data: { status: "approved" }, message: "Document already processed." });
  }

  await supabaseAdmin
    .from("library_documents")
    .update({ status: "uploaded", pages_done: null, error_message: null })
    .eq("id", id);

  await enqueueJob({
    type: DOCUMENT_PROCESS_JOB,
    payload: { document_id: id },
    dedupeKey: documentProcessDedupeKey(id),
  });

  // Best-effort low-latency kick; pg_cron is the guarantee if this doesn't run.
  after(async () => {
    try {
      await import("@/lib/jobs/handlers");
      const { drainJobs } = await import("@/lib/jobs/worker");
      await drainJobs({ workerId: `reprocess-${id}`, types: [DOCUMENT_PROCESS_JOB], budgetMs: 290_000 });
    } catch (err) {
      console.error("[reprocess] drain failed", err);
    }
  });

  return NextResponse.json({ data: { status: "uploaded" } });
}
