// Called by the client immediately after its direct-to-Storage upload
// (see lib/library-documents/storage.ts) completes — this app never sees
// the file's bytes, so it has no other way to know the upload actually
// landed. Confirms the object exists at the row's own storage_path, then
// ENQUEUES a durable processing job (lib/jobs) rather than firing extraction
// fire-and-forget.
//
// This is the fix for documents stranded forever at 'uploaded': the enqueued
// document.process job is the source of truth for "this needs processing", and
// the pg_cron worker (app/api/cron/jobs/tick) drains it even if the best-effort
// after() kick below never runs or dies mid-way. Both paths go through the same
// idempotent, leased claim, so they can never double-process.
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { objectExists } from "@/lib/library-documents/storage";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { DOCUMENT_PROCESS_JOB, documentProcessDedupeKey } from "@/lib/jobs/handlers/document-process.constants";

// The after() kick below drives processing (PDF render + vision + AI analysis),
// which can take well over a minute — the function must stay alive for it. If it
// dies anyway, pg_cron picks up the already-enqueued job; the document is never
// lost. Vercel keeps after() alive up to maxDuration.
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  try {
    const { data: doc } = await supabaseAdmin
      .from("library_documents")
      .select("id, status, storage_path")
      .eq("id", id)
      .single();

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (doc.status !== "uploaded") {
      return NextResponse.json({ data: { status: doc.status } });
    }

    const exists = await objectExists(doc.storage_path);
    if (!exists) {
      return NextResponse.json({ error: "Upload did not complete — the file wasn't found in storage. Try uploading again." }, { status: 409 });
    }

    // Durable enqueue first — this is what makes the work recoverable. Idempotent
    // via the dedupe key, so a retried confirm can't create a second job.
    await enqueueJob({
      type: DOCUMENT_PROCESS_JOB,
      payload: { document_id: id },
      dedupeKey: documentProcessDedupeKey(id),
    });

    // Best-effort low-latency kick AFTER the response, so processing usually
    // starts immediately instead of waiting for the next cron tick. Import the
    // worker lazily (not at module top) so this route never carries — or crashes
    // on — the pipeline's heavy PDF-rendering dependencies at load time. If this
    // never runs (instance killed), pg_cron drains the enqueued job regardless.
    after(async () => {
      try {
        await import("@/lib/jobs/handlers");
        const { drainJobs } = await import("@/lib/jobs/worker");
        await drainJobs({ workerId: `upload-${id}`, types: [DOCUMENT_PROCESS_JOB], budgetMs: 290_000 });
      } catch (err) {
        console.error("[confirm-upload] drain failed", err);
      }
    });

    return NextResponse.json({ data: { status: "uploaded" } });
  } catch (err) {
    // Never let this route answer with an HTML 500 — the client parses JSON.
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to confirm the upload." }, { status: 500 });
  }
}
