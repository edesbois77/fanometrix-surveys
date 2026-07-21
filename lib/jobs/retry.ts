// Generic "retry a terminal job" — used by the Admin → Background Jobs console
// for any job type. Re-queues a failed / requires_review job by resetting its
// execution counters; the next drain runs it exactly like a fresh job. Because
// every handler's run() is responsible for its own idempotent clean start (e.g.
// document.process resets the document to 'uploaded'), simply re-queuing is
// enough — the framework never needs domain-specific knowledge to retry.
import { supabaseAdmin } from "@/lib/supabase-admin";

export type RetryResult = { ok: boolean; reason?: "not_found" | "not_terminal" | "duplicate_active" | string };

/** Reset a failed / requires_review job back to 'queued' (attempts cleared, lease
 *  and error wiped, eligible immediately). Completed jobs are never retried here
 *  — re-running finished work would be a footgun; enqueue a fresh job instead. */
export async function retryJob(id: string): Promise<RetryResult> {
  const { data: job, error: loadErr } = await supabaseAdmin
    .from("jobs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return { ok: false, reason: loadErr.message };
  if (!job) return { ok: false, reason: "not_found" };
  if (job.status !== "failed" && job.status !== "requires_review") return { ok: false, reason: "not_terminal" };

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("jobs")
    .update({
      status: "queued",
      run_at: now,
      attempts: 0,
      lease_until: null,
      locked_by: null,
      last_error: null,
      last_error_at: null,
      completed_at: null,
      updated_at: now,
    })
    .eq("id", id)
    // Guard against a concurrent transition since we read the row.
    .in("status", ["failed", "requires_review"]);

  if (error) {
    // 23505: another live job already holds this dedupe_key — work is already
    // scheduled, so treat it as "nothing more to do" rather than an error.
    if (error.code === "23505") return { ok: false, reason: "duplicate_active" };
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}
