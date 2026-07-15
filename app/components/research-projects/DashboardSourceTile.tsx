"use client";

// One card per Research Source on the Dashboard stage. While a source is
// still collecting, the ring is the whole point — progress is the only
// thing worth saying. Once it's complete, the ring gives way to a
// checkmark and the space it freed up is spent on the more useful
// research context a permanent 100% circle never earned its keep showing:
// campaign/publisher/market reach for a Survey, or markets/platforms/
// sentiment for a Conversation Search — see DashboardSection.tsx for how
// `breakdown`/`sentiment` are built per source type.
import type { CollectionStatus } from "@/app/components/research-projects/SourceWorkspaceCard";
import { SecondaryButton, StatusBadge, type BadgeTone } from "@/app/components/research-projects/ActionPrimitives";

const GOLD = "#D7B87A";
const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STATUS_META: Record<CollectionStatus, { label: string; tone: BadgeTone }> = {
  not_started:    { label: "Not Started",    tone: "neutral" },
  collecting:     { label: "Collecting",     tone: "warning" },
  generating:     { label: "Generating",     tone: "warning" },
  target_reached: { label: "Target Reached", tone: "success" },
  coming_soon:    { label: "Coming Soon",    tone: "neutral" },
  failed:         { label: "Research Failed",tone: "danger" },
};

export function DashboardSourceTile({
  badge, title, status, target, current, unitLabel, href, hrefLabel, breakdown, sentiment, showProgressBar,
}: {
  badge: string;
  title: string;
  status: CollectionStatus;
  target: number | null;
  current: number | null;
  unitLabel: string;
  href: string;
  hrefLabel: string;
  // Shown only once collection is complete, in place of the ring — a
  // short list of compact stats (e.g. campaign/publisher/market counts).
  breakdown?: { label: string; value: string }[];
  // Conversation Search's sentiment mix — a thin three-segment bar,
  // shown alongside breakdown once there's at least one mention to split.
  sentiment?: { positive_pct: number; neutral_pct: number; negative_pct: number };
  // Survey's response-completion bar — the same % the ring already shows,
  // just carried into this lower section too. Unlike breakdown/sentiment
  // above, not gated on `complete`: in a real Research Project it fills in
  // dynamically as responses arrive; in a Product Walkthrough, where a
  // simulated run generates all its data in one shot, it simply appears
  // green at 100% the moment that run finishes.
  showProgressBar?: boolean;
}) {
  const meta = STATUS_META[status];
  const complete = status === "target_reached";
  // "Target Reached" is always full, even with no numeric target at all —
  // a completed simulated run (status resolved from run_status, not
  // counts) is definitionally 100%, not "—", same reasoning as the status
  // pill fix in ResearchSourcesSection/DashboardSection.
  const pct = complete
    ? 100
    : target && target > 0 && current !== null ? Math.min(100, Math.round((current / target) * 100)) : null;
  const dashoffset = CIRCUMFERENCE * (1 - (pct ?? 0) / 100);
  const ringColor = pct !== null && pct >= 100 ? "#10b981" : GOLD;

  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="flex items-center gap-4">
        {complete ? (
          <div className="flex-shrink-0 w-[72px] h-[72px] rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
            <span className="text-green-600 text-2xl leading-none">✓</span>
          </div>
        ) : (
          <svg width={72} height={72} viewBox="0 0 72 72" className="flex-shrink-0 -rotate-90">
            <circle cx={36} cy={36} r={RADIUS} fill="none" stroke="#F3F4F6" strokeWidth={7} />
            {pct !== null && (
              <circle
                cx={36} cy={36} r={RADIUS} fill="none" stroke={ringColor} strokeWidth={7} strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashoffset}
                style={{ transition: "stroke-dashoffset 500ms ease" }}
              />
            )}
            <text x={36} y={36} transform="rotate(90 36 36)" textAnchor="middle" dominantBaseline="central"
              className="fill-gray-700" style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {pct !== null ? `${pct}%` : "—"}
            </text>
          </svg>
        )}
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-1">{badge}</span>
          <p className="text-sm font-medium text-gray-800 truncate">{title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge label={meta.label} tone={meta.tone} />
            <span className="text-xs text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
              {current !== null ? current.toLocaleString() : "—"} {unitLabel}{current === 1 ? "" : "s"}
              {!complete && target !== null && ` / ${target.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>

      {((complete && ((breakdown && breakdown.length > 0) || sentiment)) || (showProgressBar && pct !== null)) && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {complete && breakdown && breakdown.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {breakdown.map(b => (
                <span key={b.label}><span className="font-semibold text-gray-700">{b.value}</span> {b.label}</span>
              ))}
            </div>
          )}
          {showProgressBar && pct !== null && (
            <div className="h-1.5 rounded-full overflow-hidden bg-gray-100" title={`${pct}% of target`}>
              <div style={{ width: `${pct}%`, background: pct >= 100 ? "#10b981" : GOLD, transition: "width 500ms ease" }} className="h-full rounded-full" />
            </div>
          )}
          {complete && sentiment && (current ?? 0) > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100" title={`${sentiment.positive_pct}% positive · ${sentiment.neutral_pct}% neutral · ${sentiment.negative_pct}% negative`}>
              <div style={{ width: `${sentiment.positive_pct}%`, background: "#22C55E" }} />
              <div style={{ width: `${sentiment.neutral_pct}%`, background: "#9CA3AF" }} />
              <div style={{ width: `${sentiment.negative_pct}%`, background: "#EF4444" }} />
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <SecondaryButton href={href}>{hrefLabel} →</SecondaryButton>
      </div>
    </div>
  );
}
