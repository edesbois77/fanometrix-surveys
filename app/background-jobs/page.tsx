"use client";

// Admin → Background Jobs. A central operational console over the generic job
// framework (lib/jobs) — the one place to see what's queued, running, failed or
// awaiting review across every consumer (document processing today; conversation
// intelligence, reports, translation, embeddings as they adopt the framework).
// Read-only except for a per-job Retry. Admin-gated by the API (401/403).
import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Job = {
  id: string;
  job_type: string;
  status: "queued" | "running" | "completed" | "failed" | "requires_review";
  attempts: number;
  max_attempts: number;
  run_at: string | null;
  lease_until: string | null;
  locked_by: string | null;
  last_error: string | null;
  last_error_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown> | null;
};

type Counts = Record<Job["status"], number>;

const STATUS_META: Record<Job["status"], { label: string; bg: string; fg: string }> = {
  queued:          { label: "Queued",       bg: "#F1F3F5", fg: "#565E6B" },
  running:         { label: "Running",      bg: "#EEF3FB", fg: "#3B5A8A" },
  completed:       { label: "Completed",    bg: "#EEF3EC", fg: "#3F5D42" },
  failed:          { label: "Failed",       bg: "#F7ECE6", fg: "#8A4B33" },
  requires_review: { label: "Needs review", bg: "#FBF3E1", fg: "#8A6A2F" },
};

// The filter chips. "All" = the operational set (everything except completed).
const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All active" },
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "failed", label: "Failed" },
  { key: "requires_review", label: "Needs review" },
  { key: "completed", label: "Completed" },
];

function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Runtime: how long the current/last run took. Running jobs measure to "now"
// (advances as the page auto-refreshes); finished jobs to their completion.
function runtimeLabel(job: Job, now: number): string {
  if (!job.started_at) {
    if (job.status === "queued" && job.run_at) {
      const due = new Date(job.run_at).getTime();
      if (due > now) return `runs in ${fmtDuration(due - now)}`;
      return "due now";
    }
    return "—";
  }
  const start = new Date(job.started_at).getTime();
  const end = job.completed_at ? new Date(job.completed_at).getTime()
    : job.status === "running" ? now
    : new Date(job.updated_at).getTime();
  return fmtDuration(end - start);
}

// A compact human hint at what the job is about, from its generic payload —
// prefers a *_id field, else the first primitive value, else the type alone.
function payloadHint(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const idKey = Object.keys(payload).find(k => k.endsWith("_id") && typeof payload[k] === "string");
  if (idKey) return `${idKey.replace(/_id$/, "")} ${String(payload[idKey]).slice(0, 8)}`;
  const firstPrimitive = Object.entries(payload).find(([, v]) => typeof v === "string" || typeof v === "number");
  return firstPrimitive ? `${firstPrimitive[0]}: ${String(firstPrimitive[1]).slice(0, 24)}` : null;
}

function StatusPill({ status }: { status: Job["status"] }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: m.bg, color: m.fg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.fg }} />
      {m.label}
    </span>
  );
}

function Tile({ label, value, status }: { label: string; value: number; status?: Job["status"] }) {
  const m = status ? STATUS_META[status] : null;
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm" style={{ borderColor: "#E3E6EA" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: m?.fg ?? "#565E6B" }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: "#0B1929" }}>{value}</p>
    </div>
  );
}

export default function BackgroundJobsPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch(`/api/background-jobs?status=${filter}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setCounts(json.data.counts);
        setJobs(json.data.jobs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // `loading` starts true, so the first fetch needn't set it synchronously here
  // (which would trigger cascading renders) — it only clears loading when done.
  useEffect(() => { load(false); }, [load]);

  // Poll so running jobs advance and states progress without a manual refresh.
  useEffect(() => {
    const t = setInterval(() => { load(false); setNow(Date.now()); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function onRetry(id: string) {
    setRetrying(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/background-jobs/${id}/retry`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ text: json.error ?? "Couldn't retry the job.", ok: false }); return; }
      setMsg({ text: "Job re-queued.", ok: true });
      await load(false);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <h1 className="text-xl font-bold" style={{ color: "#0B1929" }}>Background Jobs</h1>
          <button onClick={() => load(true)} className="text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: "#E3E6EA", color: "#565E6B" }}>Refresh</button>
        </div>
        <p className="text-sm mb-5" style={{ color: "#565E6B" }}>
          The durable execution engine for all asynchronous work. Diagnose stuck or failing jobs across every feature here.
        </p>

        {/* Summary tiles — the four operational buckets, plus completed. */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <Tile label="Queued" value={counts?.queued ?? 0} status="queued" />
          <Tile label="Running" value={counts?.running ?? 0} status="running" />
          <Tile label="Failed" value={counts?.failed ?? 0} status="failed" />
          <Tile label="Needs review" value={counts?.requires_review ?? 0} status="requires_review" />
          <Tile label="Completed" value={counts?.completed ?? 0} status="completed" />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
                style={active ? { background: "#0B1929", color: "#D7B87A", borderColor: "#0B1929" } : { background: "#fff", color: "#565E6B", borderColor: "#E3E6EA" }}>
                {f.label}
              </button>
            );
          })}
        </div>

        {msg && (
          <div className="text-sm mb-4 px-3 py-2 rounded-lg" style={msg.ok ? { background: "#EEF3EC", color: "#3F5D42" } : { background: "#F7ECE6", color: "#8A4B33" }}>
            {msg.text}
          </div>
        )}

        {loading ? (
          <div className="bg-white border rounded-xl p-8 text-center text-sm shadow-sm" style={{ borderColor: "#E3E6EA", color: "#565E6B" }}>Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="bg-white border rounded-xl p-8 text-center text-sm shadow-sm" style={{ borderColor: "#E3E6EA", color: "#565E6B" }}>
            No {filter === "all" ? "active" : STATUS_META[filter as Job["status"]]?.label.toLowerCase() ?? ""} jobs.
          </div>
        ) : (
          <div className="space-y-2.5">
            {jobs.map(job => {
              const canRetry = job.status === "failed" || job.status === "requires_review";
              const hint = payloadHint(job.payload);
              return (
                <div key={job.id} className="bg-white border rounded-xl p-4 shadow-sm" style={{ borderColor: "#E3E6EA" }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold" style={{ color: "#0B1929" }}>{job.job_type}</span>
                        <StatusPill status={job.status} />
                      </div>
                      {hint && <p className="text-xs mt-1 font-mono" style={{ color: "#565E6B" }}>{hint}</p>}
                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-1.5 text-xs" style={{ color: "#7A828C" }}>
                        <span>Attempts <span style={{ color: "#0B1929", fontWeight: 600 }}>{job.attempts}/{job.max_attempts}</span></span>
                        <span>Runtime <span style={{ color: "#0B1929", fontWeight: 600 }}>{runtimeLabel(job, now)}</span></span>
                        <span>Updated {new Date(job.updated_at).toLocaleString("en-GB")}</span>
                      </div>
                      {job.last_error && (
                        <p className="text-xs mt-2 px-2.5 py-1.5 rounded-lg break-words" style={{ background: "#FAF6F4", color: "#8A4B33" }}>
                          {job.last_error}
                        </p>
                      )}
                    </div>
                    {canRetry && (
                      <button onClick={() => onRetry(job.id)} disabled={retrying === job.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex-shrink-0 disabled:opacity-50"
                        style={{ borderColor: "#E3E6EA", color: "#0B1929" }}>
                        {retrying === job.id ? "Retrying…" : "Retry"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
