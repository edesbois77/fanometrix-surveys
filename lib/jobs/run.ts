// Executes ONE already-claimed job and drives it to a terminal state. This is
// where the framework's guarantees live: every claimed job ends as completed,
// failed, or requires_review — it can never be left in 'running'.
//
//   handler returns            → completed
//   throws PermanentJobError   → failed        (re-running can't help)
//   throws, attempts < max     → requeued      (transient; backoff then retry)
//   throws, attempts >= max    → requires_review (exhausted safe retries)
//
// The generic core knows nothing about any domain. A consumer reflects the
// outcome onto its own table via the handler's optional onOutcome hook.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getHandler } from "@/lib/jobs/registry";
import { backoffSeconds, DEFAULT_LEASE_SECONDS } from "@/lib/jobs/config";
import { PermanentJobError, type JobRow, type JobOutcome } from "@/lib/jobs/types";

async function markCompleted(id: string): Promise<void> {
  await supabaseAdmin.from("jobs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    lease_until: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

async function markTerminalFailure(id: string, status: "failed" | "requires_review", message: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin.from("jobs").update({
    status,
    completed_at: now,
    last_error: message.slice(0, 2000),
    last_error_at: now,
    lease_until: null,
    updated_at: now,
  }).eq("id", id);
}

async function requeue(id: string, delaySeconds: number, message: string): Promise<void> {
  const now = new Date();
  await supabaseAdmin.from("jobs").update({
    status: "queued",
    run_at: new Date(now.getTime() + delaySeconds * 1000).toISOString(),
    last_error: message.slice(0, 2000),
    last_error_at: now.toISOString(),
    lease_until: null,
    locked_by: null,
    updated_at: now.toISOString(),
  }).eq("id", id);
}

/** Run one claimed job (status already 'running', attempts already incremented
 *  by claim_next_job). Returns the outcome the framework decided. Never throws
 *  for an ordinary handler failure — only re-raises truly unexpected errors from
 *  the bookkeeping itself. */
export async function runJob(job: JobRow): Promise<JobOutcome> {
  const def = getHandler(job.job_type);
  if (!def) {
    // Unknown type: nothing can ever run it, so it's permanently failed rather
    // than left running until its lease expires and it's reclaimed forever.
    await markTerminalFailure(job.id, "failed", `No handler registered for job_type '${job.job_type}'`);
    return "failed";
  }

  const heartbeat = async () => {
    await supabaseAdmin.rpc("renew_job_lease", { p_id: job.id, p_lease_seconds: DEFAULT_LEASE_SECONDS });
  };

  let outcome: JobOutcome;
  let lastError: string | null = null;
  try {
    await def.run({
      job,
      payload: job.payload ?? {},
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      heartbeat,
      log: (m) => console.log(`[job ${job.job_type} ${job.id}] ${m}`),
    });
    await markCompleted(job.id);
    outcome = "completed";
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    if (err instanceof PermanentJobError) {
      await markTerminalFailure(job.id, "failed", lastError);
      outcome = "failed";
    } else if (job.attempts >= job.max_attempts) {
      await markTerminalFailure(job.id, "requires_review", lastError);
      outcome = "requires_review";
    } else {
      await requeue(job.id, backoffSeconds(job.attempts), lastError);
      outcome = "retrying";
    }
  }

  // Let the consumer reflect the decision onto its domain table. Best-effort:
  // a hook failure must not crash the drain loop or corrupt the job's own state.
  // The snapshot is updated to the resolved state/error so the hook sees them.
  if (def.onOutcome) {
    job.status = outcome === "retrying" ? "queued" : outcome;
    job.last_error = lastError;
    try {
      await def.onOutcome(outcome, job);
    } catch (hookErr) {
      console.error(`[job ${job.job_type} ${job.id}] onOutcome(${outcome}) hook failed`, hookErr);
    }
  }

  return outcome;
}
