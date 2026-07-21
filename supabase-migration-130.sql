-- Migration 130 — durable background-job framework (generic execution engine)
-- Run in: supabase.com → SQL Editor → New query → Run
--
-- The single execution engine for ALL asynchronous work in Fanometrix. First
-- consumer: Research Library document processing (job_type 'document.process',
-- lib/jobs/handlers/document-process.ts). Fixes documents stranded forever in
-- 'uploaded' when the fire-and-forget after() trigger never ran: every job now
-- reaches a terminal state (completed / failed / requires_review), stuck work is
-- reclaimed by a lease timeout, and a pg_cron heartbeat drives recovery
-- independent of Vercel or of any user being online.
--
-- The jobs table is OPERATIONAL INFRASTRUCTURE, not product data: domain tables
-- (e.g. library_documents) remain the source of truth for business state. A job
-- row is disposable plumbing — deleting completed jobs loses no business meaning.

-- ── 1. jobs table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type       text        NOT NULL,
  payload        jsonb       NOT NULL DEFAULT '{}',
  status         text        NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','completed','failed','requires_review')),
  attempts       integer     NOT NULL DEFAULT 0,
  max_attempts   integer     NOT NULL DEFAULT 4,
  priority       integer     NOT NULL DEFAULT 0,
  run_at         timestamptz NOT NULL DEFAULT now(),   -- eligibility / backoff gate
  lease_until    timestamptz,                          -- running-job lease; reclaimed once past
  locked_by      text,                                 -- worker id (observability only)
  dedupe_key     text,                                 -- idempotent enqueue key
  last_error     text,
  last_error_at  timestamptz,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Claim scan: next eligible queued job, oldest first within a priority band.
CREATE INDEX IF NOT EXISTS jobs_claim_idx
  ON jobs (priority DESC, run_at)
  WHERE status = 'queued';

-- Reclaim scan: running jobs whose lease has expired (a crashed / killed worker).
CREATE INDEX IF NOT EXISTS jobs_lease_idx
  ON jobs (lease_until)
  WHERE status = 'running';

-- Idempotent enqueue: at most ONE live (queued|running) job per logical unit of
-- work. A terminal job leaves the key free, so the same unit can be re-enqueued
-- later (e.g. an admin "Retry").
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_active_idx
  ON jobs (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');

-- Dashboard / ops filtering by type + state.
CREATE INDEX IF NOT EXISTS jobs_type_status_idx ON jobs (job_type, status);

-- Operational infrastructure — never touched by the browser. Enable RLS with NO
-- policies so the anon/authenticated PostgREST roles are denied entirely; all
-- legitimate access is server-side via the service role, which bypasses RLS.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- ── 2. claim_next_job ────────────────────────────────────────────────────────
-- Atomically leases the next runnable job: a queued job that is due, OR a running
-- job whose lease expired (its worker died mid-run). FOR UPDATE SKIP LOCKED lets
-- many concurrent workers / cron ticks drain in parallel without ever grabbing
-- the same row — this is the idempotent claim that makes retries safe. Increments
-- attempts and stamps a fresh lease, so a crash mid-run is recovered after
-- p_lease_seconds without a duplicate ever running concurrently.
CREATE OR REPLACE FUNCTION claim_next_job(
  p_worker        text,
  p_lease_seconds integer DEFAULT 300,
  p_types         text[]  DEFAULT NULL
)
RETURNS SETOF jobs
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM jobs
  WHERE (
      (status = 'queued'  AND run_at <= now())
      OR (status = 'running' AND lease_until < now())
    )
    AND (p_types IS NULL OR job_type = ANY(p_types))
  ORDER BY priority DESC, run_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE jobs
  SET status      = 'running',
      attempts    = attempts + 1,
      started_at  = COALESCE(started_at, now()),
      lease_until = now() + make_interval(secs => p_lease_seconds),
      locked_by   = p_worker,
      updated_at  = now()
  WHERE id = v_id
  RETURNING *;
END;
$$;

-- ── 3. renew_job_lease (heartbeat) ───────────────────────────────────────────
-- Long-running handlers (e.g. reading a 100-page PDF) call this periodically so
-- their lease never expires mid-work and a concurrent tick doesn't reclaim live
-- work as if the worker had died.
CREATE OR REPLACE FUNCTION renew_job_lease(p_id uuid, p_lease_seconds integer DEFAULT 300)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE jobs
  SET lease_until = now() + make_interval(secs => p_lease_seconds),
      updated_at  = now()
  WHERE id = p_id AND status = 'running';
$$;

-- ── 4. library_documents: 'requires_review' terminal ─────────────────────────
-- The domain reflection of a job that exhausted safe automatic retries — an ops
-- bucket for an admin to inspect / retry. There is NO human review gate; a
-- document still auto-approves on success. Adds to the existing status vocabulary.
ALTER TABLE library_documents DROP CONSTRAINT IF EXISTS library_documents_status_check;
ALTER TABLE library_documents
  ADD CONSTRAINT library_documents_status_check
  CHECK (status IN ('uploaded','extracting','analysing','pending_review','approved','failed','requires_review'));

NOTIFY pgrst, 'reload schema';

-- ── 5. ONE-TIME cron setup (run separately, once per environment) ─────────────
-- The durable heartbeat. pg_cron fires every minute and pg_net POSTs the generic
-- worker route, which drains all registered job types. Independent of Vercel's
-- plan tier and of any user being online. Fill in <APP_URL>; store the shared
-- CRON_SECRET in Supabase Vault (do NOT inline the secret into the schedule).
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   -- store the secret once (same value as the app's CRON_SECRET env var):
--   -- select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
--
--   select cron.schedule('drain-jobs', '* * * * *', $CRON$
--     select net.http_post(
--       url     := '<APP_URL>/api/cron/jobs/tick',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
--       ),
--       timeout_milliseconds := 5000
--     );
--   $CRON$);
--
-- pg_net's http_post is fire-and-forget (returns immediately); the worker route
-- itself runs up to its own maxDuration. To change / remove:
--   select cron.unschedule('drain-jobs');

-- Rollback:
--   select cron.unschedule('drain-jobs');
--   DROP FUNCTION IF EXISTS claim_next_job(text, integer, text[]);
--   DROP FUNCTION IF EXISTS renew_job_lease(uuid, integer);
--   DROP TABLE IF EXISTS jobs;
--   ALTER TABLE library_documents DROP CONSTRAINT IF EXISTS library_documents_status_check;
--   ALTER TABLE library_documents ADD CONSTRAINT library_documents_status_check
--     CHECK (status IN ('uploaded','extracting','analysing','pending_review','approved','failed'));
