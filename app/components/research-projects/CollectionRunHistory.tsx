"use client";

// Collection run history — every run of a search as an expandable, timestamped
// snapshot: the configuration it used, per-connector status, collection totals,
// the AI-output rollups (sentiment / topics / entities) and any warnings. This
// is the longitudinal record — runs are never overwritten, so change over time
// is always inspectable here.
import { useEffect, useState } from "react";
import { SectionHeading, StatusBadge, type Tone } from "@/app/components/workspace-ui";
import { collectionBreakdown, conversationCount } from "@/lib/connectors/content-kinds";

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

function SnapshotFacts({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{items.join(" · ")}</p>
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

  const conversations = conversationCount(byKind);
  // Append-only ledger: what this run added to the evidence base. Legacy runs
  // (pre-migration 118) have no new_count — fall back to the old "collected" view.
  const hasLedger = typeof stats.new_count === "number";
  const newCount = num(stats.new_count);
  const updatedCount = num(stats.updated_count);
  const duplicateCount = num(stats.duplicate_count);
  const totalAfter = typeof stats.total_after === "number" ? (stats.total_after as number) : null;
  const sentTotal = num(bySent.Positive) + num(bySent.Neutral) + num(bySent.Negative);
  const pct = (v: number) => (sentTotal ? Math.round((v / sentTotal) * 100) : 0);
  const topTopics = Object.entries(byTopic).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const hasDetails = (run.warnings?.length ?? 0) > 0 || !!run.error || ((cfg.keywords as string[])?.length ?? 0) > 0;

  return (
    <div className="border p-4" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-default)", background: "var(--surface)" }}>
      {/* Snapshot header — date · status · platforms */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <StatusBadge label={STATUS_LABEL[run.status]} tone={STATUS_TONE[run.status]} dot size="sm" />
        <span className="text-sm font-semibold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{fmt(run.started_at)}</span>
        <span className="ml-auto text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>{run.connectors.join(" · ") || "—"}</span>
      </div>

      {/* Ledger — what this run added to the evidence base (append-only). */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
        {hasLedger ? (
          <>
            <span><span className="font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{newCount.toLocaleString()}</span> new{collectionBreakdown(byKind) && newCount > 0 ? ` · ${collectionBreakdown(byKind)}` : ""}</span>
            {updatedCount > 0 && <span><span className="fx-tabular-nums font-semibold" style={{ color: "var(--text-primary)" }}>{updatedCount.toLocaleString()}</span> updated</span>}
            {duplicateCount > 0 && <span><span className="fx-tabular-nums">{duplicateCount.toLocaleString()}</span> already collected</span>}
            {totalAfter != null && <span>Total evidence <span className="font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{totalAfter.toLocaleString()}</span></span>}
          </>
        ) : (
          <>
            <span><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{collectionBreakdown(byKind)}</span></span>
            <span><span className="font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{conversations.toLocaleString()}</span> conversations</span>
          </>
        )}
      </div>

      {/* Sentiment summary */}
      {sentTotal > 0 && (
        <p className="text-xs mt-2 fx-tabular-nums" style={{ color: "var(--text-secondary)" }}>
          <span className="font-semibold" style={{ color: "var(--text-tertiary)" }}>Sentiment </span>
          {pct(num(bySent.Positive))}% positive · {pct(num(bySent.Neutral))}% neutral · {pct(num(bySent.Negative))}% negative
        </p>
      )}

      {/* Top topics & entities — the scannable research signal */}
      {(topTopics.length > 0 || topEntities.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <SnapshotFacts label="Top topics" items={topTopics.map(([t, n]) => `${t} (${n})`)} />
          <SnapshotFacts label="Top entities" items={topEntities.slice(0, 6).map(e => `${e.name} (${e.count})`)} />
        </div>
      )}

      {/* Optional details — configuration, connector status, warnings */}
      {hasDetails && (
        <>
          <button type="button" onClick={() => setOpen(o => !o)} className="text-[11px] font-semibold mt-3 hover:underline" style={{ color: "var(--accent-ink)" }}>
            {open ? "Hide details" : "Details"}
          </button>
          {open && (
            <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: "var(--border-subtle)" }}>
              {run.error && <p className="text-xs" style={{ color: "#B4694C" }}>{run.error}</p>}
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
              <div className="flex flex-wrap gap-2">
                {run.connectors.map(cid => {
                  const cs = connectorStats[cid] ?? {};
                  const parts = Object.entries(cs).filter(([k, v]) => typeof v === "number" && (v as number) > 0 && k !== "warnings").map(([k, v]) => `${v} ${k}`);
                  const err = typeof cs.error === "string" ? cs.error : null;
                  return (
                    <span key={cid} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: err ? "#B4694C" : "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
                      <span className="font-semibold">{cid}</span>{err ? `· ${err}` : parts.length ? `· ${parts.join(", ")}` : "· no items"}
                    </span>
                  );
                })}
              </div>
              {run.warnings?.length > 0 && (
                <ul className="space-y-0.5">
                  {run.warnings.slice(0, 8).map((w, i) => <li key={i} className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>• {w}</li>)}
                  {run.warnings.length > 8 && <li className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>…and {run.warnings.length - 8} more</li>}
                </ul>
              )}
            </div>
          )}
        </>
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
