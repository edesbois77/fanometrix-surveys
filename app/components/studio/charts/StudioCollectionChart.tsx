"use client";

// ── StudioCollectionChart — Collection over time (multi-series) ───────────────
// Up to TWO metrics (Answers | Impressions | Starts | Completions) × interval
// (Hourly | Daily | Weekly | Monthly) × type (Line | Bars). Switching any control
// changes ONLY representation/aggregation, never a value definition, and totals are
// conserved (see lib/studio/collection-series). Metrics keep a STABLE colour
// identity regardless of selection order. When two metrics differ hugely in scale
// (e.g. Impressions vs Starts) the smaller moves to a clearly-labelled secondary
// axis so it can never become invisible — values are never silently normalised.
// Bars are GROUPED (never stacked — Starts/Completions are funnel stages, not parts
// of a whole). Desktop uses compact segmented controls; mobile uses a deliberately
// different stacked layout with a metric dropdown and full-width segmented controls.

import { useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_INK } from "@/app/components/workspace-ui";
import { FX_PALETTE, metricColor } from "@/lib/studio/chart-palette";
import { aggregateSeries, secondaryAxisMetric, type CollectionPoint, type CollectionMetricKey, type Interval } from "@/lib/studio/collection-series";

export type { CollectionPoint } from "@/lib/studio/collection-series";
type ChartType = "line" | "bars";
const ALL_METRICS: CollectionMetricKey[] = ["answers", "impressions", "starts", "completions"];
const METRIC_LABEL: Record<CollectionMetricKey, string> = { answers: "Answers", impressions: "Impressions", starts: "Starts", completions: "Completions" };
const ALL_INTERVALS: Interval[] = ["hourly", "daily", "weekly", "monthly"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const nf = (n: number) => n.toLocaleString();

function fmtBucket(key: string, interval: Interval): string {
  if (interval === "monthly") { const d = new Date(`${key}-01T00:00:00Z`); return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }); }
  if (interval === "hourly") { const d = new Date(`${key}:00:00Z`); return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }); }
  const d = new Date(`${key}T00:00:00Z`);
  const base = d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  return interval === "weekly" ? `w/c ${base}` : base;
}

// ── Intelligent default interval from the data's span ──
function defaultInterval(series: CollectionPoint[], hourlyOk: boolean): Interval {
  const days = new Set(series.map((p) => p.t.slice(0, 10))).size;
  if (days <= 1 && hourlyOk) return "hourly";
  if (days <= 45) return "daily";
  if (days <= 210) return "weekly";
  return "monthly";
}

type Row = { key: string; _deltas: Record<string, number | null> } & Record<string, number | string | Record<string, number | null>>;

function TooltipCard({ active, payload, interval, metrics }: { active?: boolean; payload?: { payload?: Row }[]; interval: Interval; metrics: CollectionMetricKey[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border px-3 py-2 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border-default)" }}>
      <p className="text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>{fmtBucket(String(d.key), interval)}</p>
      {metrics.map((m) => {
        const v = Number(d[m] ?? 0); const delta = d._deltas[m];
        return (
          <div key={m} className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: metricColor(m) }} />
            <span className="text-xs font-semibold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{nf(v)}</span>
            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{METRIC_LABEL[m].toLowerCase()}</span>
            {delta != null && <span className="text-[11px] fx-tabular-nums ml-auto pl-2" style={{ color: delta > 0 ? FX_PALETTE.positive : delta < 0 ? FX_PALETTE.negative : "var(--text-tertiary)" }}>{delta > 0 ? "+" : ""}{nf(delta)}</span>}
          </div>
        );
      })}
      <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>vs previous {interval === "hourly" ? "hour" : interval === "daily" ? "day" : interval === "weekly" ? "week" : "month"}</p>
    </div>
  );
}

// ── Small metric pill (desktop toggles) — compact chart control, not a form button ──
function MetricPill({ metric, active, disabled, onClick }: { metric: CollectionMetricKey; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} aria-pressed={active}
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md border transition-colors inline-flex items-center gap-1 whitespace-nowrap"
      style={active
        ? { background: "var(--surface)", color: "var(--text-primary)", borderColor: metricColor(metric), boxShadow: "var(--shadow-xs)" }
        : { background: "transparent", color: disabled ? "var(--text-disabled)" : "var(--text-tertiary)", borderColor: "var(--border-subtle)", opacity: disabled ? 0.55 : 1 }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: active ? metricColor(metric) : "var(--border-default)" }} />
      {METRIC_LABEL[metric]}
    </button>
  );
}

// ── Reusable full-width segmented (mobile) + compact segmented (desktop) ──
function Segmented<T extends string>({ value, options, onChange, full }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-md ${full ? "w-full" : ""}`} style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} onClick={() => onChange(o.value)}
            className={`text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${full ? "flex-1 py-1.5" : "px-2 py-0.5"}`}
            style={active ? { background: "var(--surface)", color: "var(--text-primary)", boxShadow: "var(--shadow-xs)" } : { background: "transparent", color: "var(--text-tertiary)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StudioCollectionChart({ series, granularity, answersHourly, hasAnswers }: { series: CollectionPoint[]; granularity: "hour" | "day"; answersHourly: boolean; hasAnswers: boolean }) {
  const [metrics, setMetrics] = useState<CollectionMetricKey[]>(hasAnswers ? ["answers"] : ["starts"]);
  const [interval, setIntervalState] = useState<Interval>(() => defaultInterval(series, granularity === "hour" && (hasAnswers ? answersHourly : true)));
  const [type, setType] = useState<ChartType>("line");
  const [menuOpen, setMenuOpen] = useState(false);

  // Hourly is only offered when the underlying data supports it AND the selected
  // metrics can be honestly bucketed hourly (studio Answers are day-resolution).
  const answersSelected = metrics.includes("answers");
  const hourlyOk = granularity === "hour" && (!answersSelected || answersHourly);
  const intervals = ALL_INTERVALS.filter((i) => i !== "hourly" || hourlyOk);
  const effInterval: Interval = interval === "hourly" && !hourlyOk ? "daily" : interval;

  const toggleMetric = (m: CollectionMetricKey) => {
    setMetrics((prev) => {
      if (prev.includes(m)) return prev.length === 1 ? prev : prev.filter((x) => x !== m); // keep ≥1
      if (prev.length >= 2) return prev; // cap at two
      return [...prev, m];
    });
  };

  const secondary = useMemo(() => secondaryAxisMetric(series, metrics), [series, metrics]);
  const rows = useMemo<Row[]>(() => aggregateSeries(series, metrics, effInterval).map((b) => ({ key: b.key, ...b.values, _deltas: b.deltas })), [series, metrics, effInterval]);
  const axisOf = (m: CollectionMetricKey) => (secondary && m === secondary ? "right" : "left");
  const enough = rows.length >= 2;

  const controls = (mobile: boolean) => {
    const metricPills = (
      <div className={`flex items-center gap-1 ${mobile ? "flex-wrap" : ""}`}>
        {ALL_METRICS.map((m) => (
          <MetricPill key={m} metric={m} active={metrics.includes(m)} disabled={(m === "answers" && !hasAnswers) || (!metrics.includes(m) && metrics.length >= 2)} onClick={() => toggleMetric(m)} />
        ))}
      </div>
    );
    if (!mobile) {
      return (
        <div className="hidden md:flex items-center gap-1.5 flex-nowrap justify-end">
          {metricPills}
          <span className="w-px h-4 flex-shrink-0" style={{ background: "var(--border-subtle)" }} />
          <Segmented value={effInterval} options={intervals.map((i) => ({ value: i, label: cap(i) }))} onChange={setIntervalState} />
          <Segmented value={type} options={[{ value: "line" as ChartType, label: "Line" }, { value: "bars" as ChartType, label: "Bars" }]} onChange={setType} />
        </div>
      );
    }
    // Mobile: labelled stacked controls, metric as a dropdown.
    return (
      <div className="md:hidden space-y-3 mt-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Metric{metrics.length === 2 ? "s" : ""} (max 2)</p>
          <div className="relative">
            <button onClick={() => setMenuOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
              <span className="flex items-center gap-1.5 flex-wrap">
                {metrics.map((m) => <span key={m} className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: metricColor(m) }} />{METRIC_LABEL[m]}</span>)}
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>▾</span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute z-20 mt-1 w-full rounded-lg border p-1 shadow-md" style={{ background: "var(--surface)", borderColor: "var(--border-default)" }}>
                  {ALL_METRICS.map((m) => {
                    const on = metrics.includes(m);
                    const disabled = (m === "answers" && !hasAnswers) || (!on && metrics.length >= 2);
                    return (
                      <button key={m} disabled={disabled} onClick={() => toggleMetric(m)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left" style={{ color: disabled ? "var(--text-disabled)" : "var(--text-primary)", opacity: disabled ? 0.55 : 1, background: on ? "var(--surface-sunken)" : "transparent" }}>
                        <span className="inline-block w-3.5 h-3.5 rounded border flex items-center justify-center" style={{ borderColor: on ? metricColor(m) : "var(--border-default)", background: on ? metricColor(m) : "transparent" }}>{on && <span className="text-[9px] leading-none" style={{ color: "#fff" }}>✓</span>}</span>
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: metricColor(m) }} />{METRIC_LABEL[m]}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Interval</p>
          <Segmented full value={effInterval} options={intervals.map((i) => ({ value: i, label: cap(i) }))} onChange={setIntervalState} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1" style={{ color: "var(--text-tertiary)" }}>Chart</p>
          <Segmented full value={type} options={[{ value: "line" as ChartType, label: "Line" }, { value: "bars" as ChartType, label: "Bars" }]} onChange={setType} />
        </div>
      </div>
    );
  };

  const yAxis = (id: "left" | "right", m: CollectionMetricKey | undefined) => (
    <YAxis yAxisId={id} orientation={id === "right" ? "right" : "left"} width={id === "right" ? 48 : 44} allowDecimals={false}
      tick={{ fontSize: 11, fill: m ? metricColor(m) : CHART_INK.label }} tickLine={false} axisLine={false} />
  );

  return (
    <div className="border overflow-hidden" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>Collection over time</h3>
          <p className="text-xs mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: "var(--text-tertiary)" }}>
            {metrics.map((m) => METRIC_LABEL[m]).join(" + ")} · {cap(effInterval)}{secondary ? ` · ${METRIC_LABEL[secondary]} on right axis` : ""}
          </p>
        </div>
        {controls(false)}
      </div>
      {controls(true)}

      {/* Legend with axis attribution */}
      <div className="flex items-center gap-4 px-5 mt-3 flex-wrap">
        {metrics.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <span className="inline-block w-3 h-1.5 rounded-full" style={{ background: metricColor(m) }} />
            {METRIC_LABEL[m]}{secondary && m === secondary ? " (right axis)" : secondary ? " (left axis)" : ""}
          </span>
        ))}
      </div>

      <div className="px-5 py-4">
        <div style={{ height: 260 }} className="relative">
          {!enough ? (
            <div className="absolute inset-0 flex items-center justify-center text-center px-6">
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Not enough data points to plot this interval yet.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              {type === "line" ? (
                <LineChart data={rows} margin={{ top: 8, right: secondary ? 4 : 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                  <XAxis dataKey="key" tickFormatter={(k) => fmtBucket(String(k), effInterval)} minTickGap={28} tick={{ fontSize: 11, fill: CHART_INK.label }} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                  {yAxis("left", secondary ? metrics.find((m) => m !== secondary) : undefined)}
                  {secondary && yAxis("right", secondary)}
                  <Tooltip content={<TooltipCard interval={effInterval} metrics={metrics} />} cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }} />
                  {metrics.map((m) => <Line key={m} yAxisId={axisOf(m)} type="monotone" dataKey={m} stroke={metricColor(m)} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />)}
                </LineChart>
              ) : (
                <BarChart data={rows} margin={{ top: 8, right: secondary ? 4 : 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
                  <XAxis dataKey="key" tickFormatter={(k) => fmtBucket(String(k), effInterval)} minTickGap={28} tick={{ fontSize: 11, fill: CHART_INK.label }} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
                  {yAxis("left", secondary ? metrics.find((m) => m !== secondary) : undefined)}
                  {secondary && yAxis("right", secondary)}
                  <Tooltip content={<TooltipCard interval={effInterval} metrics={metrics} />} cursor={{ fill: "var(--surface-sunken)" }} />
                  {/* Grouped (never stacked): no stackId — Starts/Completions are stages, not additive parts. */}
                  {metrics.map((m) => <Bar key={m} yAxisId={axisOf(m)} dataKey={m} fill={metricColor(m)} radius={[3, 3, 0, 0]} maxBarSize={28} />)}
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {(secondary || (answersSelected && !answersHourly)) && (
        <div className="px-5 py-2.5 border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
          {secondary && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{METRIC_LABEL[secondary]} is shown on a secondary axis — the two series differ too much in scale to share one. Values are not normalised.</span>}
          {answersSelected && !answersHourly && <span className="text-[11px] block" style={{ color: "var(--text-tertiary)" }}>Answers are recorded at daily resolution for studio-native surveys, so hourly is unavailable while Answers is selected.</span>}
        </div>
      )}
    </div>
  );
}
