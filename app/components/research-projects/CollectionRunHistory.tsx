"use client";

// Collection run history — every run of a search as an expandable, timestamped
// snapshot: the configuration it used, per-connector status, collection totals,
// the AI-output rollups (sentiment / topics / entities) and any warnings. This
// is the longitudinal record — runs are never overwritten, so change over time
// is always inspectable here.
import { useEffect, useState } from "react";
import { SectionHeading, StatusBadge, type Tone } from "@/app/components/workspace-ui";

type Run = {
  id: string;
  status: "running" | "completed" | "partial" | "failed";
  started_at: string;
  completed_at: string | null;
  connectors: string[];
  config: Record<string, unknown>;
  stats: Record<string, unknown>;
  warnings: string[];
  error: string | null;
  triggered_by: string | null;
};

const STATUS_TONE: Record<Run["status"], Tone> = { running: "info", completed: "success", partial: "warning", failed: "danger" };
const STATUS_LABEL: Record<Run["status"], string> = { running: "Collecting", completed: "Completed", partial: "Partial", failed: "Failed" };

function fmt(ts: string): string {
  return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function num(v: unknown): number { return typeof v === "number" ? v : 0; }

function Chips({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{v}</span>
        ))}
      </div>
    </div>
  );
}

function RunCard({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  const stats = run.stats ?? {};
  const byKind = (stats.by_kind ?? {}) as Record<string, number>;
  const bySent = (stats.by_sentiment ?? {}) as Record<string, number>;
  const byTopic = (stats.by_topic ?? {}) as Record<string, number>;
  const topEntities = (stats.top_entities ?? []) as { name: string; count: number }[];
  const connectorStats = (stats.connectors ?? {}) as Record<string, Record<string, unknown>>;
  const cfg = run.config ?? {};

  const totals = Object.entries(byKind).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`).join(" · ") || "no items";
  const sentTotal = num(bySent.Positive) + num(bySent.Neutral) + num(bySent.Negative);
  const pct = (v: number) => (sentTotal ? Math.round((v / sentTotal) * 100) : 0);
  const topTopics = Object.entries(byTopic).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="border overflow-hidden" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-default)", background: "var(--surface)" }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-hover)]">
        <StatusBadge label={STATUS_LABEL[run.status]} tone={STATUS_TONE[run.status]} dot size="sm" />
        <span className="text-xs font-semibold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{fmt(run.started_at)}</span>
        <span className="text-[11px] hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>{run.connectors.join(" · ")}</span>
        <span className="ml-auto text-[11px] fx-tabular-nums" style={{ color: "var(--text-secondary)" }}>{totals}</span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 py-3 border-t space-y-4" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
          {run.error && <p className="text-xs" style={{ color: "#B4694C" }}>{run.error}</p>}

          {/* Configuration snapshot */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Chips label="Keywords" values={(cfg.keywords as string[]) ?? []} />
            <Chips label="Markets" values={(cfg.markets as string[]) ?? []} />
            <Chips label="Languages" values={(cfg.languages as string[]) ?? []} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Window</p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {cfg.collect_from || cfg.collect_to ? `${cfg.collect_from ?? "…"} → ${cfg.collect_to ?? "…"}` : "Source defaults"}
              </p>
            </div>
          </div>

          {/* Per-connector status */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Connectors</p>
            <div className="flex flex-wrap gap-2">
              {run.connectors.map(cid => {
                const cs = connectorStats[cid] ?? {};
                const parts = Object.entries(cs).filter(([k, v]) => typeof v === "number" && (v as number) > 0 && k !== "warnings").map(([k, v]) => `${v} ${k}`);
                const err = typeof cs.error === "string" ? cs.error : null;
                return (
                  <span key={cid} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface)", color: err ? "#B4694C" : "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
                    <span className="font-semibold">{cid}</span>{err ? `· ${err}` : parts.length ? `· ${parts.join(", ")}` : "· no items"}
                  </span>
                );
              })}
            </div>
          </div>

          {/* AI-output rollups */}
          {sentTotal > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Sentiment</p>
                <p className="text-[11px] fx-tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {pct(num(bySent.Positive))}% positive · {pct(num(bySent.Neutral))}% neutral · {pct(num(bySent.Negative))}% negative
                </p>
                {topTopics.length > 0 && (
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
                    Top topics: {topTopics.map(([t, n]) => `${t} (${n})`).join(", ")}
                  </p>
                )}
              </div>
              {topEntities.length > 0 && (
                <Chips label="Top entities" values={topEntities.map(e => `${e.name} (${e.count})`)} />
              )}
            </div>
          )}

          {/* Warnings */}
          {run.warnings?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Warnings ({run.warnings.length})</p>
              <ul className="space-y-0.5">
                {run.warnings.slice(0, 8).map((w, i) => <li key={i} className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>• {w}</li>)}
                {run.warnings.length > 8 && <li className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>…and {run.warnings.length - 8} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CollectionRunHistory({ searchId, version = 0 }: { searchId: string; version?: number }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/social/searches/${searchId}/runs`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => { if (!cancelled) { setRuns(j.data ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [searchId, version]);

  if (loading) return null;
  if (!runs.length) return null;

  return (
    <div>
      <SectionHeading title="Collection history" description="Every run as a timestamped snapshot — the configuration it used, results and any warnings. Runs are kept, never overwritten." />
      <div className="space-y-2 mt-3">
        {runs.map(run => <RunCard key={run.id} run={run} />)}
      </div>
    </div>
  );
}
