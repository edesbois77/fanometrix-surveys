"use client";

import { Fragment } from "react";
import type { SurveyResponse } from "@/lib/types";
import { getMetric } from "@/lib/metrics";
import { MetricInfo } from "@/app/components/metrics/MetricInfo";

// A count is `null` when the query behind it could not be computed (e.g. the
// statement timeout cancelled it). That is NOT zero, and the cards must not say
// it is — null renders as "—" with an explanatory note, never as a figure.
export type EventCounts = {
  renders:    number | null;  // SURVEY_RENDER = loads / impressions
  viewable?:  number | null;  // SURVEY_VISIBLE = viewable impressions (from this release)
  starts:     number | null;
  q2_reached: number | null;
  q3_reached: number | null;
  completed:  number | null;
  degraded?:  boolean;        // at least one count above is null
  // Events-based timing (see lib/survey-timing.ts). Completion is full-history;
  // TTFI is forward-only from the SURVEY_VISIBLE release. null = no sample.
  avg_completion_seconds?: number | null;
  avg_ttfi_seconds?:       number | null;
  completion_sample?:      number;
  ttfi_sample?:            number;
};

// Every rate helper takes `number | null`: a null operand means the underlying
// count is unavailable, so the rate is unknown ("—") rather than 0%.
function pct(num: number | null, denom: number | null): string {
  if (num === null || denom === null) return "—";
  if (!denom) return "—";
  if (!num)   return "0%";
  const v = (num / denom) * 100;
  return v < 0.1 ? "<0.1%" : `${v.toFixed(v < 10 ? 1 : 0)}%`;
}

// Same as pct() but with one extra decimal of precision, for low-magnitude
// rates (Q1 Answer Rate, Response Rate) where "0.1%"/"<0.1%" loses signal.
function pctPrecise(num: number | null, denom: number | null): string {
  if (num === null || denom === null) return "—";
  if (!denom) return "—";
  if (!num)   return "0%";
  const v = (num / denom) * 100;
  return v < 0.01 ? "<0.01%" : `${v.toFixed(v < 10 ? 2 : 1)}%`;
}

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

// Drop-off from the previous stage — the inverse of the conversion rate. Shown
// on the subtle connectors between pipeline stages (e.g. "−55%").
function dropOf(num: number | null, denom: number | null): string {
  if (num === null || denom === null) return "—";
  if (!denom) return "—";
  const drop = Math.max(0, 100 - (num / denom) * 100);
  if (drop === 0) return "0%";
  if (drop < 0.1) return "−<0.1%";
  return `−${drop.toFixed(drop < 10 ? 1 : 0)}%`;
}

// Human-friendly "time since" for the Collection Status panel.
function relTime(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── Metric card ───────────────────────────────────────────────────────────────
// One card shape for every headline metric. The (i) icon pulls its Definition /
// Formula / Why-it-matters from the canonical registry (lib/metrics) via
// MetricInfo — pass `metricId` and the label + tooltip come for free. `note` is
// for card-state context that isn't part of the metric's definition (e.g. a
// legacy-data caveat); it renders as a plain secondary marker.
function MetricCard({
  metricId, label, value, sub, highlight, valueColor, note, infoAlign = "left",
}: {
  metricId?: string;
  label?: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
  valueColor?: string;
  note?: string;
  infoAlign?: "left" | "right";
}) {
  const name  = label ?? (metricId ? getMetric(metricId)?.name : undefined) ?? "";
  const color = valueColor ?? (highlight ? "#D7B87A" : "#0B1929");
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm min-w-0">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wide flex items-center gap-1">
        <span className="truncate">{name}</span>
        {metricId && <span className="flex-shrink-0"><MetricInfo metricId={metricId} align={infoAlign} /></span>}
        {note && (
          <span
            className="flex-shrink-0"
            title={note}
            aria-label={note}
            style={{ cursor: "help", fontSize: 11, opacity: 0.6, lineHeight: 1 }}
          >
            ⓘ
          </span>
        )}
      </div>
      <p className="text-2xl font-bold mt-1" style={{ color }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Conversion pipeline ─────────────────────────────────────────────────────
// A compact horizontal journey from Impression to Completed Response. Each
// stage is a small card (name · count · share of the previous stage); between
// stages a subtle connector carries the drop-off.

type PipelineStage = {
  label: string;
  count: number | null;  // null = the count for this stage is unavailable
  conv:  string | null;  // "45% of previous" — null for the first stage
  drop:  string | null;  // "−55%" — shown on the connector before this stage
};

function ConversionPipeline({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-stretch overflow-x-auto pb-1">
        {stages.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && (
              <div className="flex items-center flex-shrink-0 px-1" style={{ minWidth: 54 }}>
                <div className="flex-1 h-px bg-gray-200" />
                <span className="mx-1 text-[10px] font-semibold tabular-nums text-gray-500 whitespace-nowrap">
                  {s.drop}
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            )}
            <div
              className="flex-1 min-w-[92px] rounded-lg px-3 py-2"
              style={{ background: "#F8F9FB", border: "1px solid #E5E7EB" }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 leading-tight"
                style={{ minHeight: 26 }}
                title={s.label}
              >
                {s.label}
              </p>
              <p className="text-lg font-bold tabular-nums leading-none mt-1" style={{ color: "#0B1929" }}>
                {fmt(s.count)}
              </p>
              <p className="text-[10px] text-gray-400 mt-1 truncate" title={s.conv ?? "starting point"}>
                {s.conv ?? "starting point"}
              </p>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Research Confidence ───────────────────────────────────────────────────────
// How far the current sample can be trusted, stated in plain statistics. The
// Sample Quality band is tied to DEFINED margin-of-error thresholds:
//   ≤ ±5%   → High Confidence  (n ≳ 385 — the industry ±5% survey standard)
//   ≤ ±10%  → Reliable         (n ≳ 96)
//   ≤ ±15%  → Directional      (n ≳ 43)
//   > ±15%  → Early            (fewer — anecdotal only)

// 95% margin of error for a proportion, worst case p=0.5:  1.96·√(0.25/n).
function marginOfError(n: number): number | null {
  return n > 0 ? Math.round((0.98 / Math.sqrt(n)) * 1000) / 10 : null;
}

type ConfBand = { label: string; color: string; meaning: (moe: number) => string };

const CONF_BANDS: Record<"none" | "early" | "directional" | "reliable" | "high", ConfBand> = {
  none: {
    label: "No data", color: "#9CA3AF",
    meaning: () => "Awaiting completed responses.",
  },
  early: {
    label: "Early", color: "#9CA3AF",
    meaning: (m) => `Too few responses to generalise — treat these as anecdotal signals, not representative figures (±${m}%).`,
  },
  directional: {
    label: "Directional", color: "#B45309",
    meaning: (m) => `Shows the direction of opinion, but each figure could vary by ±${m}% — read the trend, not the exact number.`,
  },
  reliable: {
    label: "Reliable", color: "#B8935A",
    meaning: (m) => `Solid enough to act on — each figure is accurate to within ±${m}% at a 95% confidence level.`,
  },
  high: {
    label: "High Confidence", color: "#15803D",
    meaning: (m) => `Representative sample — figures are accurate to within ±${m}% (meets the ±5% survey standard) at 95% confidence.`,
  },
};

// Band chosen directly from the margin of error, so the label always matches the
// statistic shown beneath it.
function bandFor(moe: number | null): ConfBand {
  if (moe === null) return CONF_BANDS.none;
  if (moe <= 5)  return CONF_BANDS.high;
  if (moe <= 10) return CONF_BANDS.reliable;
  if (moe <= 15) return CONF_BANDS.directional;
  return CONF_BANDS.early;
}

// ── Collection Status ─────────────────────────────────────────────────────────
// Is the research actively collecting? Volume today / this week and recency of
// the last response. Live publisher / country breadth now lives under Exposure.

const DAY_MS  = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

type Activity = { today: number; week: number; lastTs: number; livePubs: number; liveCountries: number };

// Single pass over the responses in view: recent volume, recency, and the
// distinct publishers / countries seen in the last 24h (surfaced under Exposure).
function computeActivity(responses: SurveyResponse[], now: number): Activity {
  let lastTs = 0, today = 0, week = 0;
  const livePubs = new Set<string>();
  const liveCountries = new Set<string>();
  for (const r of responses) {
    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t > lastTs) lastTs = t;
    const age = now - t;
    if (age <= WEEK_MS) week++;
    if (age <= DAY_MS) {
      today++;
      if (r.publisher) livePubs.add(r.publisher);
      if (r.country)   liveCountries.add(r.country);
    }
  }
  return { today, week, lastTs, livePubs: livePubs.size, liveCountries: liveCountries.size };
}

type StatusBand = { label: string; color: string; dot: string };

function CollectionStatus({ activity, now }: { activity: Activity; now: number }) {
  const { today, week, lastTs, livePubs, liveCountries } = activity;
  const age = lastTs ? now - lastTs : Infinity;
  const status: StatusBand =
    !lastTs         ? { label: "No responses",        color: "#9CA3AF", dot: "#D1D5DB" } :
    age <= DAY_MS   ? { label: "Actively collecting", color: "#15803D", dot: "#22C55E" } :
    age <= WEEK_MS  ? { label: "Slowing",             color: "#B45309", dot: "#F59E0B" } :
                      { label: "Paused",              color: "#9CA3AF", dot: "#D1D5DB" };

  // Compact stat with its canonical (i) definition from the registry.
  const stat = (metricId: string, value: string | number, infoAlign: "left" | "right" = "left") => (
    <div>
      <p className="text-lg font-bold tabular-nums leading-none" style={{ color: "#0B1929" }}>{value}</p>
      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
        <span className="truncate">{getMetric(metricId)?.name ?? metricId}</span>
        <span className="flex-shrink-0"><MetricInfo metricId={metricId} align={infoAlign} /></span>
      </span>
    </div>
  );

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Collection Status</p>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: status.color }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
          {status.label}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 mt-3">
        {stat("publishers_live",      fmt(livePubs))}
        {stat("countries_collecting", fmt(liveCountries))}
        {stat("responses_today",      fmt(today))}
        {stat("responses_this_week",  fmt(week), "right")}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        {lastTs ? `Last response ${relTime(lastTs, now)}` : "No responses collected yet"}
      </p>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>
      {children}
    </p>
  );
}

// ── No-data placeholder ───────────────────────────────────────────────────────

function ZeroNotice({ message }: { message: string }) {
  return (
    <p className="text-xs text-gray-400 italic py-1">{message}</p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface KpiCardsProps {
  responses:     SurveyResponse[];
  events:        EventCounts | null;
  eventsLoading: boolean;
}

export function KpiCards({ responses, events, eventsLoading }: KpiCardsProps) {
  const completed = responses.length;

  // eslint-disable-next-line react-hooks/purity -- render-time clock read for "live in last 24h" / recency; stable enough for a dashboard snapshot
  const now = Date.now();
  const activity = computeActivity(responses, now);

  // Events-based timing (single source of truth; see lib/survey-timing.ts).
  // Completion is correct across ALL history; TTFI is forward-only from the
  // SURVEY_VISIBLE release, so a zero sample renders as "available from launch".
  const avgCompletion    = events?.avg_completion_seconds ?? null;
  const completionSample = events?.completion_sample ?? 0;
  const avgTtfi          = events?.avg_ttfi_seconds ?? null;
  const ttfiSample       = events?.ttfi_sample ?? 0;
  const completionValue  = avgCompletion != null && completionSample > 0 ? `${avgCompletion}s` : "—";
  const ttfiValue        = avgTtfi != null && ttfiSample > 0 ? `${avgTtfi}s` : "—";

  // `?? null`, never `?? 0` — an absent or failed count is unknown, not zero.
  const renders     = events?.renders    ?? null;  // loads / impressions
  const viewable    = events?.viewable   ?? null;  // viewable impressions (from this release)
  const starts      = events?.starts     ?? null;
  const q2Reached   = events?.q2_reached ?? null;
  const q3Reached   = events?.q3_reached ?? null;
  const evCompleted = events?.completed  ?? null;

  // Viewability = viewable ÷ loads. SURVEY_VISIBLE is forward-only, so a zero
  // viewable count means "no viewable data yet" (render "—") rather than 0%.
  const viewabilityValue = viewable !== null && viewable > 0 ? pctPrecise(viewable, renders) : "—";

  const hasEvents = !eventsLoading && events !== null;

  // One or more counts came back unavailable (query cancelled server-side).
  const degraded = hasEvents && (events?.degraded === true ||
    [renders, starts, q2Reached, q3Reached, evCompleted].some(v => v === null));

  // When events are loaded but renders=0 and starts=0 yet responses exist,
  // the data predates event tracking. Show — instead of misleading zeros.
  // A null count is not 0, so a failed query never masquerades as legacy data.
  const isLegacyData = hasEvents && renders === 0 && starts === 0 && completed > 0;

  const showEventValue = hasEvents && !isLegacyData;

  const startRate      = pctPrecise(starts,      renders);
  const completionRate = pct(evCompleted, starts);
  const responseRate   = pctPrecise(evCompleted, renders);
  // Fall back to the response-row count when the event count is unavailable —
  // completed responses are a reliable figure independent of survey_events.
  const funnelCompleted = showEventValue && evCompleted !== null ? evCompleted : completed;

  const legacyFullCount = responses.filter(r => r.q1 && r.q2 && r.q3).length;
  const legacyCompRate  = completed > 0 ? `${Math.round((legacyFullCount / completed) * 100)}%` : "—";

  const moe  = marginOfError(completed);
  const band = bandFor(moe);

  const pipelineStages: PipelineStage[] = [
    { label: "Impressions (Loads)", count: renders,         conv: null,                                     drop: null                       },
    { label: "Q1 Answered",         count: starts,          conv: `${pct(starts, renders)} of previous`,    drop: dropOf(starts, renders)    },
    { label: "Question 2 Reached",  count: q2Reached,       conv: `${pct(q2Reached, starts)} of previous`,  drop: dropOf(q2Reached, starts)  },
    { label: "Question 3 Reached",  count: q3Reached,       conv: `${pct(q3Reached, q2Reached)} of previous`, drop: dropOf(q3Reached, q2Reached) },
    { label: "Completed Responses", count: funnelCompleted, conv: `${pct(funnelCompleted, q3Reached)} of previous`, drop: dropOf(funnelCompleted, q3Reached) },
  ];

  return (
    <div className="space-y-5 mb-6">

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Collection Health</h2>

      {/* ── EXPOSURE ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Exposure</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard
            metricId="impressions_loads"
            value={showEventValue && renders !== null ? renders : "—"}
            sub={renders === null && hasEvents ? "count unavailable" : "every ad load served"}
          />
          <MetricCard
            metricId="impressions_viewable"
            value={showEventValue && viewable !== null && viewable > 0 ? viewable : "—"}
            sub={viewable !== null && viewable > 0 ? "scrolled into view" : "available from this release"}
          />
          <MetricCard
            metricId="viewability_rate"
            value={showEventValue ? viewabilityValue : "—"}
            sub={viewable !== null && viewable > 0 ? "Viewable ÷ Loads" : "available from this release"}
            highlight={showEventValue && viewable !== null && viewable > 0}
            infoAlign="right"
          />
        </div>
      </div>

      {/* ── ENGAGEMENT ────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Engagement</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricCard
            metricId="q1_answered"
            value={showEventValue && starts !== null ? starts : "—"}
            sub={starts === null && hasEvents ? "count unavailable" : "first answer selected"}
          />
          <MetricCard
            metricId="q1_answer_rate"
            value={showEventValue ? startRate : "—"}
            sub="Q1 Answered ÷ Impressions"
            highlight={showEventValue}
          />
          <MetricCard
            metricId="avg_time_to_first_interaction"
            value={ttfiValue}
            sub={ttfiSample > 0 ? "survey visible → first answer" : "available from this release"}
            infoAlign="right"
          />
        </div>
        {eventsLoading && (
          <p className="text-xs text-gray-400 mt-1">Loading event data…</p>
        )}
        {degraded && (
          <ZeroNotice message="Some event counts could not be computed in time and are shown as —. The figures that did load are accurate. Use Refresh to try again, or narrow the date range." />
        )}
        {isLegacyData && (
          <ZeroNotice message="Impressions and Q1 metrics are not available for historical responses collected before event tracking was enabled." />
        )}
        {!hasEvents && !eventsLoading && (
          <ZeroNotice message="Impressions and Q1 metrics require event tracking, no events recorded yet." />
        )}
      </div>

      {/* ── COMPLETION ────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Completion</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            metricId="completed_responses"
            value={completed}
            sub="all questions answered"
          />
          {showEventValue ? (
            <MetricCard
              metricId="completion_rate"
              value={completionRate}
              sub="Completed ÷ Q1 Answered"
              highlight
            />
          ) : (
            <MetricCard
              label="Completion Rate"
              value={legacyCompRate}
              sub="all-Q responses ÷ total (legacy)"
              note="Calculated from completed response records, not survey event tracking. Switches to Completed ÷ Q1 Answered automatically once event data is available."
            />
          )}
          <MetricCard
            metricId="overall_conversion_rate"
            value={showEventValue ? responseRate : "—"}
            sub="Completed ÷ Impressions"
            highlight={showEventValue}
          />
          <MetricCard
            metricId="avg_completion_time"
            value={completionValue}
            sub="first answer → completion"
            infoAlign="right"
          />
        </div>
      </div>

      {/* ── CONVERSION PIPELINE ───────────────────────────────────────── */}
      <div>
        <SectionLabel>Conversion Pipeline</SectionLabel>
        {isLegacyData || (!hasEvents && !eventsLoading) ? (
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <ZeroNotice message={isLegacyData
              ? "Pipeline stages are not available for responses collected before event tracking was introduced."
              : "Pipeline stages will appear once event tracking records its first impression."} />
            {completed > 0 && (
              <p className="text-sm mt-2">
                <span className="font-bold tabular-nums" style={{ color: "#0B1929" }}>{fmt(completed)}</span>
                <span className="text-gray-400"> completed responses</span>
              </p>
            )}
          </div>
        ) : (
          <ConversionPipeline stages={pipelineStages} />
        )}
      </div>

      {/* ── RESEARCH CONFIDENCE ───────────────────────────────────────── */}
      <div>
        <SectionLabel>Research Confidence</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MetricCard
            metricId="confidence_level"
            value="95%"
            sub="statistical standard"
          />
          <MetricCard
            metricId="margin_of_error"
            value={moe !== null ? `±${moe}%` : "—"}
            sub={`n = ${fmt(completed)} completed`}
          />
          <MetricCard
            metricId="sample_quality"
            value={band.label}
            valueColor={band.color}
            sub={moe !== null ? "based on margin of error" : "awaiting responses"}
            infoAlign="right"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          {moe !== null ? band.meaning(moe) : band.meaning(0)}
        </p>
      </div>

      {/* ── COLLECTION STATUS ─────────────────────────────────────────── */}
      <CollectionStatus activity={activity} now={now} />

    </div>
  );
}
