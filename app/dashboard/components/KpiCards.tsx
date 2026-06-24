"use client";

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
  const v = (num / denom) * 100;
  return v < 0.1 ? "<0.1%" : `${v.toFixed(v < 10 ? 1 : 0)}%`;
}

function fmt(n: number): string {
  return n.toLocaleString();
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

// ── Funnel ────────────────────────────────────────────────────────────────────

function FunnelStep({
  label, count, dropPct, isLast,
}: {
  label: string; count: number; dropPct?: string; isLast?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="w-full rounded-lg px-4 py-2.5 flex items-center justify-between"
        style={{ background: "#F8F9FB", border: "1px solid #E5E7EB" }}
      >
        <span className="text-sm font-semibold" style={{ color: "#0B1929" }}>{label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: "#0B1929" }}>
          {fmt(count)}
        </span>
      </div>
      {!isLast && (
        <div className="flex flex-col items-center gap-0" style={{ lineHeight: 1 }}>
          <div style={{ width: 1, height: 8, background: "#CBD5E1" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 1, height: 8, background: "#CBD5E1" }} />
            <span
              className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded"
              style={{ background: "#EFF6FF", color: "#3B82F6", fontSize: 10.5 }}
            >
              {dropPct ?? "—"}
            </span>
            <div style={{ width: 1, height: 8, background: "#CBD5E1" }} />
          </div>
          <div style={{ width: 1, height: 8, background: "#CBD5E1" }} />
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M5 6L0 0h10L5 6z" fill="#CBD5E1" />
          </svg>
        </div>
      )}
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
  const avgTime   = avg(responses.map(r => r.response_duration_seconds));
  const completed = responses.length;

  const renders    = events?.renders    ?? 0;
  const starts     = events?.starts     ?? 0;
  const q2Reached  = events?.q2_reached ?? 0;
  const q3Reached  = events?.q3_reached ?? 0;
  const evCompleted = events?.completed ?? 0;

  const startRate      = pct(starts,      renders);
  const completionRate = pct(evCompleted, starts);
  const responseRate   = pct(evCompleted, renders);

  const hasEvents = !eventsLoading && events !== null;

  // Funnel uses event-based completed count when available, falls back to responses count
  const funnelCompleted = hasEvents ? evCompleted : completed;

  return (
    <div className="space-y-5 mb-6">

      {/* ── DELIVERY ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Delivery</SectionLabel>
        <div className="flex gap-3">
          <DeliveryCard
            label="Survey Renders"
            value={hasEvents ? renders : "—"}
            sub="creatives loaded"
            tooltip="Fanometrix-measured creative loads. Not the same as publisher ad server impressions, reach or frequency."
          />
          <DeliveryCard
            label="Q1 Answered"
            value={hasEvents ? starts : "—"}
            sub="first answer selected"
          />
          <DeliveryCard
            label="Completed Responses"
            value={completed}
            sub="all questions answered"
          />
        </div>
        {!hasEvents && !eventsLoading && (
          <ZeroNotice message="Survey Renders and Q1 Answered require event tracking — no events recorded yet." />
        )}
        {eventsLoading && (
          <p className="text-xs text-gray-400 mt-1">Loading event data…</p>
        )}
      </div>

      {/* ── ENGAGEMENT ────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Engagement</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EngagementCard
            label="Q1 Answer Rate"
            value={hasEvents ? startRate : "—"}
            sub="Q1 Answered ÷ Renders"
            highlight
          />
          {hasEvents ? (
            <EngagementCard
              label="Completion Rate"
              value={completionRate}
              sub="Completed ÷ Q1 Answered"
              highlight
            />
          ) : (
            <EngagementCard
              label="Legacy Completion Rate"
              value={(() => {
                const full = responses.filter(r => r.q1 && r.q2 && r.q3).length;
                return completed > 0 ? `${Math.round((full / completed) * 100)}%` : "—";
              })()}
              sub="All-Q responses ÷ total responses"
              tooltip="Calculated from completed response records, not survey event tracking. Switches to Completed ÷ Q1 Answered automatically once event data is available."
            />
          )}
          <EngagementCard
            label="Response Rate"
            value={hasEvents ? responseRate : "—"}
            sub="Completed ÷ Renders"
            highlight
          />
          <EngagementCard
            label="Avg Response Time"
            value={avgTime > 0 ? `${avgTime}s` : "—"}
            sub="seconds per survey"
          />
        </div>
      </div>

      {/* ── FUNNEL ────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Survey Funnel</SectionLabel>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          {!hasEvents && !eventsLoading ? (
            <div className="py-2">
              <ZeroNotice message="Funnel data will appear once event tracking records its first Survey Render." />
              {completed > 0 && (
                <div className="mt-3">
                  <FunnelStep label="Completed Responses" count={completed} isLast />
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-sm mx-auto space-y-0">
              <FunnelStep
                label="Survey Renders"
                count={renders}
                dropPct={pct(starts, renders)}
              />
              <FunnelStep
                label="Q1 Answered"
                count={starts}
                dropPct={pct(q2Reached, starts)}
              />
              <FunnelStep
                label="Question 2 Reached"
                count={q2Reached}
                dropPct={pct(q3Reached, q2Reached)}
              />
              <FunnelStep
                label="Question 3 Reached"
                count={q3Reached}
                dropPct={pct(funnelCompleted, q3Reached)}
              />
              <FunnelStep
                label="Completed Responses"
                count={funnelCompleted}
                isLast
              />
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
