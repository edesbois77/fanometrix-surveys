// First consumer of the job framework: Research Library document ingestion.
//
// The job ('document.process', payload { document_id }) is the OPERATIONAL
// record of how the work runs (attempts/lease/retries). library_documents
// remains the source of truth for domain state — the handler drives the
// existing pipeline (runExtraction → runVisualAnalysis → runAnalysis, which
// updates library_documents.status through its stages) and the onOutcome hook
// reflects the framework's terminal decision back onto that column.
//
// Idempotent by construction: each attempt resets the document to a clean
// 'uploaded' start, and every downstream write is delete-then-insert, so a retry
// after a crash mid-run never leaves half-processed state. An attempt on an
// already-'approved' document is a no-op.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registerHandler } from "@/lib/jobs/registry";
import { PermanentJobError, type JobContext, type JobOutcome, type JobRow } from "@/lib/jobs/types";
import { UnprocessableDocumentError } from "@/lib/library-documents/errors";
import { DOCUMENT_PROCESS_JOB } from "@/lib/jobs/handlers/document-process.constants";
// NOTE: runExtraction is imported lazily inside run() — see the comment there.
// Registering a handler must never eagerly load its heavy dependencies.

function documentId(payload: Record<string, unknown>): string {
  const id = payload.document_id;
  if (typeof id !== "string" || !id) {
    throw new PermanentJobError("document.process job is missing a string 'document_id'");
  }
  return id;
}

async function run(ctx: JobContext): Promise<void> {
  const id = documentId(ctx.payload);

  const { data: doc, error } = await supabaseAdmin
    .from("library_documents")
    .select("id, status, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load document ${id}: ${error.message}`); // transient
  if (!doc || doc.deleted_at) throw new PermanentJobError(`Document ${id} no longer exists`);
  if (doc.status === "approved") return; // already completed — nothing to do

  // Clean start for this attempt. Reset to 'uploaded' so runExtraction's own
  // atomic claim (WHERE status='uploaded') matches even after a prior partial
  // run left the document mid-stage. Never clobber an 'approved' document.
  await supabaseAdmin
    .from("library_documents")
    .update({ status: "uploaded", pages_done: null, error_message: null })
    .eq("id", id)
    .neq("status", "approved");

  // Lazy-import the pipeline so merely REGISTERING this handler (done at worker
  // startup, and inside the cron route's request) never loads the heavy PDF/
  // vision stack (pdfjs et al., which does worker setup at module load). That
  // stack is pulled in only when a document job actually runs — and any failure
  // to load or execute it is caught below as a normal job error, never an
  // unhandled crash of the whole worker/route.
  const { runExtraction } = await import("@/lib/library-documents/run-extraction");
  try {
    await runExtraction(id, { heartbeat: ctx.heartbeat });
  } catch (err) {
    // Permanent domain failures (unsupported format, no readable content) must
    // not be retried — map them to the framework's no-retry terminal.
    if (err instanceof UnprocessableDocumentError) throw new PermanentJobError(err.message);
    throw err; // transient — the framework retries with backoff
  }

  // Verify the pipeline actually reached the success terminal. Guards against a
  // silent no-op (e.g. a claim that didn't match) completing the job falsely.
  const { data: after } = await supabaseAdmin
    .from("library_documents")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (after?.status !== "approved") {
    throw new Error(`Document ${id} did not reach 'approved' (status=${after?.status ?? "missing"})`);
  }
}

/** Reflect the job's terminal decision onto library_documents.status — the
 *  domain side of the two-layer model. Never overwrites an 'approved' document
 *  (a late-arriving outcome after a concurrent success must not undo it). */
async function onOutcome(outcome: JobOutcome, job: JobRow): Promise<void> {
  const id = typeof job.payload?.document_id === "string" ? job.payload.document_id : null;
  if (!id) return;

  const patch: Record<string, unknown> | null =
    outcome === "failed"          ? { status: "failed",          error_message: job.last_error ?? "Processing failed." }
    : outcome === "requires_review" ? { status: "requires_review", error_message: job.last_error ?? "Exhausted automatic retries." }
    // Between retries, show the neutral "Queued" state rather than a frozen
    // mid-pipeline stage, so the loader reflects that work will resume.
    : outcome === "retrying"      ? { status: "uploaded",        error_message: job.last_error ?? null, pages_done: null }
    // completed: the document is already 'approved' via runAnalysis — nothing to do.
    : null;
  if (!patch) return;

  await supabaseAdmin
    .from("library_documents")
    .update(patch)
    .eq("id", id)
    .neq("status", "approved");
}

registerHandler(DOCUMENT_PROCESS_JOB, { run, onOutcome });
