// Enqueue a unit of asynchronous work. This is how every consumer schedules
// background work — never a bespoke after()/setTimeout/queue. The job becomes
// eligible immediately (or at runAt) and is drained by the worker
// (lib/jobs/worker.ts), whether triggered by the pg_cron heartbeat or a
// best-effort after() fast-path at the call site.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/jobs/config";
import type { JobRow } from "@/lib/jobs/types";

export type EnqueueOptions = {
  type: string;
  payload?: Record<string, unknown>;
  /** At most one live (queued|running) job may share a dedupe_key — enforced by
   *  a partial unique index. Re-enqueuing while one is still live is a no-op, so
   *  a double upload / double trigger can never create duplicate work. */
  dedupeKey?: string;
  /** Delay eligibility (ISO string). Omit to run as soon as a worker is free. */
  runAt?: string;
  maxAttempts?: number;
  /** Higher runs first. Default 0. */
  priority?: number;
};

export type EnqueueResult = { job: JobRow | null; deduped: boolean };

/** Insert a job. If an active job with the same dedupe_key already exists the
 *  unique index raises 23505; we treat that as success (deduped), so callers
 *  never have to pre-check. Any other DB error throws. */
export async function enqueueJob(opts: EnqueueOptions): Promise<EnqueueResult> {
  const row = {
    job_type: opts.type,
    payload: opts.payload ?? {},
    dedupe_key: opts.dedupeKey ?? null,
    max_attempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    priority: opts.priority ?? 0,
    ...(opts.runAt ? { run_at: opts.runAt } : {}),
  };

  const { data, error } = await supabaseAdmin
    .from("jobs")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation on the active-dedupe index: an equivalent job is
    // already queued or running. That's the idempotent-enqueue contract, not a
    // failure — nothing new to schedule.
    if (error.code === "23505") return { job: null, deduped: true };
    throw new Error(`enqueueJob(${opts.type}) failed: ${error.message}`);
  }

  return { job: data as JobRow, deduped: false };
}
