// Drains the job queue. Called by the pg_cron-triggered worker route (the
// durability guarantee) and, best-effort, by an after() fast-path at enqueue
// sites (for low latency). Both use claim_next_job, whose FOR UPDATE SKIP LOCKED
// lease makes any number of concurrent drains safe — two ticks never process the
// same job, and a job orphaned by a dead worker is reclaimed once its lease
// lapses.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runJob } from "@/lib/jobs/run";
import { DEFAULT_LEASE_SECONDS, TICK_BUDGET_MS } from "@/lib/jobs/config";
import type { JobRow } from "@/lib/jobs/types";

export type DrainOptions = {
  /** Identifies the worker in jobs.locked_by (observability only). */
  workerId: string;
  /** Wall-clock budget for this drain. Defaults to TICK_BUDGET_MS. */
  budgetMs?: number;
  /** Restrict to specific job types (e.g. an after() fast-path draining only the
   *  type it just enqueued). Omit to drain everything. */
  types?: string[];
  /** Hard cap on jobs processed in one drain, independent of the time budget. */
  maxJobs?: number;
};

export type DrainSummary = {
  claimed: number;
  completed: number;
  failed: number;
  requiresReview: number;
  requeued: number;
};

async function claimNext(workerId: string, types?: string[]): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin.rpc("claim_next_job", {
    p_worker: workerId,
    p_lease_seconds: DEFAULT_LEASE_SECONDS,
    p_types: types ?? null,
  });
  if (error) throw new Error(`claim_next_job failed: ${error.message}`);
  // SETOF jobs comes back as an array (empty when nothing is claimable).
  const rows = (data ?? []) as JobRow[];
  return rows.length ? rows[0] : null;
}

export async function drainJobs(opts: DrainOptions): Promise<DrainSummary> {
  const budgetMs = opts.budgetMs ?? TICK_BUDGET_MS;
  const started = Date.now();
  const summary: DrainSummary = { claimed: 0, completed: 0, failed: 0, requiresReview: 0, requeued: 0 };

  while (Date.now() - started < budgetMs) {
    if (opts.maxJobs != null && summary.claimed >= opts.maxJobs) break;

    const job = await claimNext(opts.workerId, opts.types);
    if (!job) break; // queue drained

    summary.claimed++;
    const outcome = await runJob(job);
    if (outcome === "completed") summary.completed++;
    else if (outcome === "failed") summary.failed++;
    else if (outcome === "requires_review") summary.requiresReview++;
    else summary.requeued++;
  }

  return summary;
}
