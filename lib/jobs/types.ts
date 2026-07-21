// The durable background-job framework — shared types.
//
// This framework is the SINGLE execution engine for all asynchronous work in
// Fanometrix (see supabase-migration-130.sql). A consumer registers a handler
// for a job_type (lib/jobs/registry.ts) and enqueues work (lib/jobs/enqueue.ts);
// the framework owns claiming, leasing, retries, backoff, timeouts and recovery
// so no feature re-implements them.
//
// Two-layer discipline: the `jobs` row is OPERATIONAL infrastructure (how work
// runs). It is never the source of truth for business state — that stays in the
// domain table (e.g. library_documents). A handler reads/writes the domain table
// for product meaning and uses the job only for execution metadata.

/** Job lifecycle. queued → running → one terminal state. Nothing rests in
 *  queued/running: the worker always drives a claimed job to a terminal. */
export type JobStatus = "queued" | "running" | "completed" | "failed" | "requires_review";

/** The outcome the framework decided for one run of a job — passed to a
 *  handler's optional onOutcome hook so the consumer can reflect it onto its
 *  domain table (e.g. set library_documents.status). */
export type JobOutcome = "completed" | "failed" | "requires_review" | "retrying";

/** A row of the `jobs` table, as returned by claim_next_job. */
export type JobRow = {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  priority: number;
  run_at: string;
  lease_until: string | null;
  locked_by: string | null;
  dedupe_key: string | null;
  last_error: string | null;
  last_error_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What a handler receives. `heartbeat()` renews the job's lease — long handlers
 *  (e.g. reading a 100-page PDF) must call it periodically so a sweeper doesn't
 *  reclaim live work as if the worker had died. `attempts` is this run's attempt
 *  number (1 on the first try). */
export type JobContext = {
  job: JobRow;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  heartbeat: () => Promise<void>;
  log: (message: string) => void;
};

/** A handler runs one job. Return = success (job → completed). Throw
 *  PermanentJobError = fail now, no retry. Throw anything else = transient:
 *  retried with backoff until max_attempts, then → requires_review. */
export type JobHandler = (ctx: JobContext) => Promise<void>;

/** A registered job type. `onOutcome` (optional) lets the consumer reflect the
 *  framework's decision onto its own domain table — it runs after the job row
 *  has been moved to its new state, for every outcome including 'retrying'. */
export type JobDefinition = {
  run: JobHandler;
  onOutcome?: (outcome: JobOutcome, job: JobRow) => Promise<void>;
};

/** Throw from a handler to fail a job immediately with no retry — for errors
 *  that re-running cannot fix (bad input, unsupported format, missing record).
 *  Any other thrown error is treated as transient and retried. */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}
