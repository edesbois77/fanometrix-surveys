"use client";

import { Fragment } from "react";
import type { SurveyResponse } from "@/lib/types";

export type EventCounts = {
  renders:    number;
  starts:     number;
  q2_reached: number;
  q3_reached: number;
  completed:  number;
};

function avg(nums: (number | null)[]): number {
  const valid = nums.filter((n): n is number => n !== null);
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
}

function pct(num: number, denom: number): string {
  if (!denom) return "—";
  if (!num)   return "0%";
  const v = (num / denom) * 100;
  return v < 0.1 ? "<0.1%" : `${v.toFixed(v < 10 ? 1 : 0)}%`;
}

// Same as pct() but with one extra decimal of precision, for low-magnitude
// rates (Q1 Answer Rate, Response Rate) where "0.1%"/"<0.1%" loses signal.
function pctPrecise(num: number, denom: number): string {
  if (!denom) return "—";
  if (!num)   return "0%";
  const v = (num / denom) * 100;
  return v < 0.01 ? "<0.01%" : `${v.toFixed(v < 10 ? 2 : 1)}%`;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

// Drop-off from the previous stage — the inverse of the conversion rate. Shown
// on the subtle connectors between pipeline stages (e.g. "−55%").
function dropOf(num: number, denom: number): string {
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

// ── Delivery card ─────────────────────────────────────────────────────────────

function DeliveryCard({
  label, value, sub, tooltip,
}: {
  label: string; value: string | number; sub: string; tooltip?: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex-1 min-w-0">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide flex items-center gap-1">
        {label}
        {tooltip && (
          <span
            title={tooltip}
            aria-label={tooltip}
            style={{ cursor: "help", fontSize: 11, opacity: 0.6, lineHeight: 1 }}
          >
            ⓘ
          </span>
        )}
      </p>
      <p className="text-2xl font-bold mt-1" style={{ color: "#0B1929" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

// ── Engagement card ───────────────────────────────────────────────────────────

function EngagementCard({
  label, value, sub, highlight, tooltip,
}: {
  label: string; value: string; sub: string; highlight?: boolean; tooltip?: string;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex-1 min-w-0">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide flex items-center gap-1">
        {label}
        {tooltip && (
          <span
            title={tooltip}
            aria-label={tooltip}
            style={{ cursor: "help", fontSize: 11, opacity: 0.6, lineHeight: 1 }}
          >
            ⓘ
          </span>
        )}
      </p>
      <p
        className="text-2xl font-bold mt-1"
        style={{ color: highlight ? "#D7B87A" : "#0B1929" }}
      >
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

// ── Conversion pipeline ─────────────────────────────────────────────────────
// A compact horizontal journey from Survey Render to Completed Response. Each
// stage is a small card (name · count · share of the previous stage); between
// stages a subtle connector carries the drop-off. Occupies ~⅓ of the height the
// old vertical funnel needed while keeping all five stages.

type PipelineStage = {
  label: string;
  count: number;
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
// How far the current sample can be trusted, stated in plain statistics: the
// number of completed responses and the resulting 95% margin of error. The label
// is tied to DEFINED margin-of-error thresholds (not a vague adjective):
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

function ResearchConfidence({ n }: { n: number }) {
  const moe  = marginOfError(n);
  const band = bandFor(moe);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Research Confidence</p>
        <span className="text-[10px] text-gray-400">95% confidence level</span>
      </div>
      <p className="text-2xl font-bold mt-1" style={{ color: band.color }}>{band.label}</p>
      {moe !== null ? (
        <>
          <p className="text-sm font-semibold mt-1.5" style={{ color: "#0B1929" }}>
            {fmt(n)} completed {n === 1 ? "response" : "responses"} · ±{moe}% margin of error
          </p>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{band.meaning(moe)}</p>
        </>
      ) : (
        <p className="text-xs text-gray-400 mt-1.5">{band.meaning(0)}</p>
      )}
    </div>
  );
}

// ── Collection Status ─────────────────────────────────────────────────────────
// Is the research actively collecting? Volume today / this week, recency of the
// last response, and how many publishers and countries are currently live
// (seen in the last 24h). Purely derived from the response records in view.

const DAY_MS  = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

type StatusBand = { label: string; color: string; dot: string };

function CollectionStatus({ responses }: { responses: SurveyResponse[] }) {
  const now = Date.now();

  let lastTs = 0;
  let today = 0;
  let week = 0;
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

  const age = lastTs ? now - lastTs : Infinity;
  const status: StatusBand =
    !lastTs         ? { label: "No responses",        color: "#9CA3AF", dot: "#D1D5DB" } :
    age <= DAY_MS   ? { label: "Actively collecting", color: "#15803D", dot: "#22C55E" } :
    age <= WEEK_MS  ? { label: "Slowing",             color: "#B45309", dot: "#F59E0B" } :
                      { label: "Paused",              color: "#9CA3AF", dot: "#D1D5DB" };

  const stat = (label: string, value: string | number) => (
    <div>
      <p className="text-lg font-bold tabular-nums leading-none" style={{ color: "#0B1929" }}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
        {stat("responses today", fmt(today))}
        {stat("this week", fmt(week))}
        {stat("publishers live", fmt(livePubs.size))}
        {stat("countries collecting", fmt(liveCountries.size))}
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

const LEGACY_TOOLTIP = "Survey event tracking was introduced after these responses were collected.";

export function KpiCards({ responses, events, eventsLoading }: KpiCardsProps) {
  const avgTime   = avg(responses.map(r => r.response_duration_seconds));
  const completed = responses.length;

  const renders     = events?.renders    ?? 0;
  const starts      = events?.starts     ?? 0;
  const q2Reached   = events?.q2_reached ?? 0;
  const q3Reached   = events?.q3_reached ?? 0;
  const evCompleted = events?.completed  ?? 0;

  const hasEvents = !eventsLoading && events !== null;

  // When events are loaded but renders=0 and starts=0 yet responses exist,
  // the data predates event tracking. Show — instead of misleading zeros.
  const isLegacyData = hasEvents && renders === 0 && starts === 0 && completed > 0;

  const showEventValue = hasEvents && !isLegacyData;

  const startRate      = pctPrecise(starts,      renders);
  const completionRate = pct(evCompleted, starts);
  const responseRate   = pctPrecise(evCompleted, renders);
  const funnelCompleted = showEventValue ? evCompleted : completed;

  const legacyFullCount = responses.filter(r => r.q1 && r.q2 && r.q3).length;
  const legacyCompRate  = completed > 0 ? `${Math.round((legacyFullCount / completed) * 100)}%` : "—";

  const pipelineStages: PipelineStage[] = [
    { label: "Survey Renders",      count: renders,         conv: null,                                     drop: null                       },
    { label: "Q1 Answered",         count: starts,          conv: `${pct(starts, renders)} of previous`,    drop: dropOf(starts, renders)    },
    { label: "Question 2 Reached",  count: q2Reached,       conv: `${pct(q2Reached, starts)} of previous`,  drop: dropOf(q2Reached, starts)  },
    { label: "Question 3 Reached",  count: q3Reached,       conv: `${pct(q3Reached, q2Reached)} of previous`, drop: dropOf(q3Reached, q2Reached) },
    { label: "Completed Responses", count: funnelCompleted, conv: `${pct(funnelCompleted, q3Reached)} of previous`, drop: dropOf(funnelCompleted, q3Reached) },
  ];

  return (
    <div className="space-y-5 mb-6">

      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Collection Health</h2>

      {/* ── DELIVERY METRICS ──────────────────────────────────────────── */}
      <div>
        <SectionLabel>Delivery Metrics</SectionLabel>
        <div className="flex gap-3">
          <DeliveryCard
            label="Survey Renders"
            value={showEventValue ? renders : "—"}
            sub="creatives loaded"
            tooltip={isLegacyData
              ? LEGACY_TOOLTIP
              : "Fanometrix-measured creative loads. Not the same as publisher ad server impressions, reach or frequency."}
          />
          <DeliveryCard
            label="Q1 Answered"
            value={showEventValue ? starts : "—"}
            sub="first answer selected"
            tooltip={isLegacyData ? LEGACY_TOOLTIP : undefined}
          />
          <DeliveryCard
            label="Completed Responses"
            value={completed}
            sub="all questions answered"
          />
        </div>
        {eventsLoading && (
          <p className="text-xs text-gray-400 mt-1">Loading event data…</p>
        )}
        {isLegacyData && (
          <ZeroNotice message="Survey Renders and Q1 Answered are not available for historical responses collected before event tracking was enabled." />
        )}
        {!hasEvents && !eventsLoading && (
          <ZeroNotice message="Survey Renders and Q1 Answered require event tracking, no events recorded yet." />
        )}
      </div>

      {/* ── ENGAGEMENT METRICS ────────────────────────────────────────── */}
      <div>
        <SectionLabel>Engagement Metrics</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EngagementCard
            label="Q1 Answer Rate"
            value={showEventValue ? startRate : "—"}
            sub="Q1 Answered ÷ Renders"
            highlight={showEventValue}
            tooltip={isLegacyData ? LEGACY_TOOLTIP : undefined}
          />
          {showEventValue ? (
            <EngagementCard
              label="Completion Rate"
              value={completionRate}
              sub="Completed ÷ Q1 Answered"
              highlight
            />
          ) : (
            <EngagementCard
              label="Legacy Completion Rate"
              value={legacyCompRate}
              sub="All-Q responses ÷ total responses"
              tooltip="Calculated from completed response records, not survey event tracking. Switches to Completed ÷ Q1 Answered automatically once event data is available."
            />
          )}
          <EngagementCard
            label="Response Rate"
            value={showEventValue ? responseRate : "—"}
            sub="Completed ÷ Renders"
            highlight={showEventValue}
            tooltip={isLegacyData ? LEGACY_TOOLTIP : undefined}
          />
          <EngagementCard
            label="Avg Response Time"
            value={avgTime > 0 ? `${avgTime}s` : "—"}
            sub="seconds per survey"
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
              : "Pipeline stages will appear once event tracking records its first Survey Render."} />
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

      {/* ── RESEARCH CONFIDENCE + COLLECTION STATUS ────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ResearchConfidence n={completed} />
        <CollectionStatus responses={responses} />
      </div>

    </div>
  );
}
