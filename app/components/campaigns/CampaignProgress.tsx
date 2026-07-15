import type { Campaign } from "./types";

// A campaign with no target override inherits the Research Project's one
// master Research Target — every campaign contributes toward that single
// total, so it shows a plain contribution count here, never a fraction
// (the fraction belongs at the project level). Only an explicit per-
// campaign override (a deliberate, different goal) earns its own fractional
// progress bar.
export function CampaignProgress({ c }: { c: Campaign }) {
  const hasOwnTarget = c.target_responses !== null && c.target_responses > 0;
  const pct = hasOwnTarget ? Math.min(100, Math.round((c.response_count / c.target_responses!) * 100)) : null;
  const daysLeft = c.end_date
    ? Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86_400_000)
    : null;

  if (!hasOwnTarget && c.response_count === 0 && !c.end_date && !c.is_auto_transition) return null;

  return (
    <div className="mt-2.5 space-y-1.5">
      {hasOwnTarget && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{c.response_count.toLocaleString()} / {c.target_responses!.toLocaleString()} responses</span>
            <span className="font-semibold text-gray-700">{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: pct! >= 100 ? "#10b981" : pct! >= 75 ? "#D7B87A" : "#0B1929" }} />
          </div>
        </>
      )}
      {!hasOwnTarget && c.response_count > 0 && (
        <p className="text-xs text-gray-400">{c.response_count.toLocaleString()} responses contributed</p>
      )}
      {daysLeft !== null && c.effective_status === "live" && (
        <p className="text-xs text-gray-400">
          {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining` : "Ending today"}
        </p>
      )}
      {c.is_auto_transition && c.status_reason && (
        <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
          <span>⚠</span><span>{c.status_reason}</span>
        </p>
      )}
    </div>
  );
}
