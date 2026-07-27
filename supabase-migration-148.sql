-- Migration 148 — Fanometrix Report framework: view counter
--
-- One row per report open, mirroring partner_report_visits but keyed by the
-- framework report's string id (ReportConfig.access.id) rather than a
-- partner_reports uuid. Displayed views = a per-report seed (in config) + the
-- rows here, so a freshly published report never reads "0 views" while the real
-- count still only grows truthfully.
--
-- Writes come exclusively from the service-role key in the framework view route
-- (app/api/reports/framework/[id]/view), which itself only records a visit for a
-- browser that has already answered the report password. RLS is enabled with no
-- policies so the anon/authenticated keys cannot read or write it; the service
-- role bypasses RLS. Safe to run more than once.

create table if not exists public.framework_report_views (
  id          uuid primary key default gen_random_uuid(),
  report_id   text        not null,
  visitor_id  text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists framework_report_views_report_id_idx
  on public.framework_report_views (report_id);

alter table public.framework_report_views enable row level security;
