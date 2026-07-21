# Background Jobs

The durable execution engine for **all** asynchronous work in Fanometrix. Its
first consumer is Research Library document processing; conversation collection,
survey analysis, report generation, translation and embeddings are expected to
follow.

> **Governing principle.** This framework is the single execution engine for
> asynchronous work. No feature may implement its own scheduling, retries,
> leasing or recovery. Any async task ⇒ **register a handler + enqueue a job**.
> Bespoke `after()` / cron / retry logic should be rejected in review and routed
> through `lib/jobs/`.

> **Two layers.** The `jobs` table is *operational infrastructure*, not product
> data. Domain tables (e.g. `library_documents`) remain the source of truth for
> business state; a job row is disposable plumbing (deleting completed jobs loses
> no business meaning). Product/UI reads go to the domain table — the job row is
> consulted only for execution metadata (attempts, next retry, last error).

Code lives in [`lib/jobs/`](lib/jobs). Schema and the pg_cron setup are in
[`supabase-migration-130.sql`](supabase-migration-130.sql).

---

## How jobs are created

Enqueue with [`enqueueJob`](lib/jobs/enqueue.ts):

```ts
import { enqueueJob } from "@/lib/jobs/enqueue";

await enqueueJob({
  type: "document.process",              // registered job_type
  payload: { document_id: id },          // arbitrary JSON the handler receives
  dedupeKey: `document.process:${id}`,   // at most one LIVE job per key
  // optional: runAt (ISO string, delay), maxAttempts, priority
});
```

- **Idempotent.** A partial unique index (`jobs_dedupe_active_idx`) allows at most
  one `queued`/`running` job per `dedupe_key`. Enqueuing again while one is live
  is a no-op (`{ deduped: true }`), so a double upload / double trigger can never
  create duplicate work. Once a job reaches a terminal state the key is free, so
  the same unit can be re-enqueued later (that's what a "Retry" does).
- **Best-effort fast-path.** Trigger sites usually follow the enqueue with a
  fire-and-forget drain so work starts immediately instead of waiting for the
  next cron tick — e.g. in
  [`confirm-upload`](app/api/library-documents/[id]/confirm-upload/route.ts):

  ```ts
  await enqueueJob({ type: DOCUMENT_PROCESS_JOB, payload: { document_id: id }, dedupeKey });
  after(async () => {
    await import("@/lib/jobs/handlers");
    const { drainJobs } = await import("@/lib/jobs/worker");
    await drainJobs({ workerId: `upload-${id}`, types: [DOCUMENT_PROCESS_JOB], budgetMs: 290_000 });
  });
  ```

  The enqueue is the durable part; if `after()` never runs (instance killed),
  the pg_cron worker drains the already-enqueued job. Both paths use the same
  leased claim, so they can never double-process.

---

## How the worker operates

The worker is the route
[`/api/cron/jobs/tick`](app/api/cron/jobs/tick/route.ts) (`runtime = "nodejs"`,
`maxDuration = 300`). It is:

- **Triggered** every minute by **Supabase pg_cron + pg_net**, which POSTs the
  route with an `Authorization: Bearer <CRON_SECRET>` header (see
  `supabase-migration-130.sql` §5). This heartbeat is what makes work resilient
  to Vercel instance termination and to a dead `after()` fast-path — it runs even
  with no user online.
- **Authenticated** by its own bearer check
  ([`isCronAuthorized`](lib/jobs/cron-auth.ts), constant-time, fails closed when
  `CRON_SECRET` is unset). The route is excluded from the *session*-auth
  middleware (`PUBLIC_API_PREFIXES` in [`middleware.ts`](middleware.ts)) — that's
  "no browser session", **not** "public".
- **Draining** via [`drainJobs`](lib/jobs/worker.ts): a loop that repeatedly
  claims and runs the next job until the queue is empty or the wall-clock budget
  (`TICK_BUDGET_MS`, default 250s) is spent, then returns a summary
  `{ claimed, completed, failed, requiresReview, requeued }`.

**Claiming** is a single atomic step,
[`claim_next_job`](supabase-migration-130.sql) (`FOR UPDATE SKIP LOCKED`):

- picks the next eligible job — a `queued` job whose `run_at <= now()`, **or** a
  `running` job whose `lease_until` has passed (its worker died);
- sets `status='running'`, `attempts = attempts + 1`, and a fresh
  `lease_until = now() + lease`.

`SKIP LOCKED` means any number of concurrent ticks drain safely — two ticks never
grab the same row, and a job orphaned by a crashed worker is automatically
reclaimed once its lease lapses. Long handlers call `ctx.heartbeat()` (→
`renew_job_lease`) to extend the lease so genuinely long work isn't mistaken for
a dead worker.

Every claimed job is driven to a terminal state by [`runJob`](lib/jobs/run.ts) —
it can never be left `running`.

---

## Lifecycle & retry behaviour

```
queued ──claim──▶ running ──▶ completed          (handler returned)
                     │
                     ├──▶ failed                  (threw PermanentJobError)
                     ├──▶ queued (backoff)        (threw; attempts < max_attempts)
                     └──▶ requires_review         (threw; attempts >= max_attempts)
```

A handler's outcome decides the transition ([`run.ts`](lib/jobs/run.ts)):

| Handler behaviour | Job outcome | Meaning |
|---|---|---|
| returns normally | `completed` | success |
| throws `PermanentJobError` | `failed` | re-running can't help (bad input, unsupported format) — **not retried** |
| throws anything else, `attempts < max_attempts` | back to `queued` | transient; retried after backoff |
| throws anything else, `attempts >= max_attempts` | `requires_review` | exhausted safe retries — an ops bucket for a human to inspect/retry |

- **Backoff** ([`config.ts`](lib/jobs/config.ts) `backoffSeconds`): exponential in
  the attempt just completed (base 30s), capped at 1h, with jitter; written to
  `run_at` so the job becomes eligible again after the delay.
- **Stuck recovery**: a `running` job whose `lease_until` expires (crash, timeout,
  instance kill) is reclaimed by the next `claim_next_job` and retried — no
  separate reaper needed.
- **Terminal guarantee**: every job ends `completed`, `failed`, or
  `requires_review`. Nothing rests in `queued`/`running` forever.

**Config** (env-overridable, `config.ts`):

| Env | Default | Meaning |
|---|---|---|
| `JOBS_MAX_ATTEMPTS` | 4 | retry ceiling before `requires_review` (per-enqueue override via `maxAttempts`) |
| `JOBS_LEASE_SECONDS` | 300 | lease granted on claim; matches the route's `maxDuration` |
| `JOBS_TICK_BUDGET_MS` | 250000 | wall-clock budget for one drain (< `maxDuration`) |
| `CRON_SECRET` | — | bearer token the pg_cron worker must send (also stored in Supabase Vault) |
| `OPENAI_TIMEOUT_MS` | 60000 | per-request timeout for AI calls (a timeout is a transient error → retried) |

---

## How to add a new job type

Three steps, no new table / route / cron / retry logic:

**1. Write a handler** — `lib/jobs/handlers/<name>.ts`:

```ts
import { registerHandler } from "@/lib/jobs/registry";
import { PermanentJobError, type JobContext, type JobOutcome, type JobRow } from "@/lib/jobs/types";

async function run(ctx: JobContext) {
  const { some_id } = ctx.payload as { some_id: string };
  // Lazy-import heavy deps INSIDE run() so registering the handler stays cheap
  // and any load failure is caught as a job error, not a worker crash:
  const { doTheWork } = await import("@/lib/whatever");
  await ctx.heartbeat();                 // call periodically during long work
  await doTheWork(some_id);
  // return  -> completed
  // throw new PermanentJobError("bad input")  -> failed (no retry)
  // throw new Error("timeout")               -> retried, then requires_review
}

// Optional: reflect the terminal decision onto YOUR domain table (two-layer model).
async function onOutcome(outcome: JobOutcome, job: JobRow) {
  // e.g. set my_table.status based on outcome; never store business state on the job.
}

registerHandler("my_feature.do_thing", { run, onOutcome });
```

**2. Register it** — add one import to
[`lib/jobs/handlers/index.ts`](lib/jobs/handlers/index.ts):

```ts
import "@/lib/jobs/handlers/my-feature";
```

**3. Enqueue** at the trigger site with a stable `dedupeKey` (and optionally an
`after()` fast-path drain). Done — it now runs on the same worker, retries,
lease-recovers, and appears in the Admin console automatically.

Rules of thumb: **the payload references the domain row; business state lives in
the domain table.** Keep handler modules light at import time (lazy-load heavy
dependencies inside `run()`). Throw `PermanentJobError` only for failures a retry
cannot fix.

Reference implementation:
[`lib/jobs/handlers/document-process.ts`](lib/jobs/handlers/document-process.ts).

---

## How to debug failures

1. **Admin → Background Jobs** (`/background-jobs`) — the first stop. See counts
   and per-job `attempts`, `runtime`, and `last_error`; **Retry** failed /
   needs-review jobs. See the next section.

2. **The `jobs` table directly** (Supabase SQL editor):

   ```sql
   -- current queue by state
   select status, count(*) from jobs group by status;

   -- what's failing and why
   select job_type, status, attempts || '/' || max_attempts as attempts,
          last_error, last_error_at, run_at, lease_until, updated_at
   from jobs
   where status in ('failed','requires_review','running')
   order by updated_at desc
   limit 50;
   ```

   - `last_error` — the exception message from the most recent attempt.
   - `run_at` in the future on a `queued` job — it's waiting out a retry backoff.
   - `lease_until` in the past on a `running` job — its worker died; the next tick
     will reclaim it.

3. **Is the worker even running?** The pg_cron heartbeat records every POST:

   ```sql
   select status_code, content, created from net._http_response order by created desc limit 5;
   ```

   `200` with `{"ok":true,…}` = healthy. `401` = `CRON_SECRET` mismatch (Vercel env
   vs Vault). `404` = route not deployed. Also check the cron schedule itself:

   ```sql
   select jobname, schedule, active from cron.job where jobname = 'drain-jobs';
   ```

4. **Vercel Runtime Logs** for `/api/cron/jobs/tick` — a caught drain failure logs
   `[cron/jobs/tick] failed …`; a handler can emit progress via `ctx.log(...)`
   (logged as `[job <type> <id>] …`).

5. **Domain side** — remember the two layers. A document job that `completed`
   should leave `library_documents.status = 'approved'`; a `requires_review` job
   leaves the document in `requires_review` with an `error_message`.

---

## The Admin → Background Jobs console

Route [`/background-jobs`](app/background-jobs/page.tsx) (admin-only; appears in
the sidebar's **Developer** group). A read-only operational view over the whole
queue, refreshing every 5s:

- **Summary tiles** — Queued · Running · Failed · Needs review · Completed.
- **Filters** — All active (the four operational states) · each status · Completed.
- **Per-job rows** — `job_type`, a status pill, a payload hint (e.g.
  `document a1b2c3d4`), **Attempts** (`n/max`), **Runtime**, the last-updated time,
  and the **last error**.
- **Retry** — on `failed` / `requires_review` jobs. Re-queues via
  [`retryJob`](lib/jobs/retry.ts) (resets the terminal job to `queued`, clears
  attempts/lease/error); the next drain runs it. Because each handler's `run()`
  owns its idempotent clean-start, retry needs no per-type logic — it works for
  every job type, so new features get Retry for free.

Backing API: [`GET /api/background-jobs`](app/api/background-jobs/route.ts)
(counts + filtered list) and
[`POST /api/background-jobs/[id]/retry`](app/api/background-jobs/[id]/retry/route.ts).

---

## Operational setup (one-time, per environment)

1. Apply `supabase-migration-130.sql` (jobs table + `claim_next_job` /
   `renew_job_lease` + the `library_documents.requires_review` status).
2. Set `CRON_SECRET` in Vercel **and** store the identical value in Supabase Vault.
3. Enable `pg_cron` + `pg_net` and schedule `drain-jobs` to POST
   `/api/cron/jobs/tick` every minute (migration §5).

Verify: `net._http_response` shows `200`, and a test document uploaded to the
Research Library reaches `approved`.
