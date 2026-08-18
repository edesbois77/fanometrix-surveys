"use client";

// ── StageTabs — the Create workspace local navigation ────────────────────────
// The horizontal About | Creative | Survey | Campaigns | Deploy row, inside the
// workspace. Navigation is free EXCEPT where a forward stage is gated: a stage
// listed in `gates` with a non-null reason is not yet reachable and renders as a
// disabled tab with a lock + an explanatory tooltip (the reason is also surfaced
// as visible text by the workspace). This is the single progression surface — the
// gate extends it rather than adding a second mechanism. The chosen Survey ID is
// preserved because each tab links to the same route, changing only ?stage=.

import Link from "next/link";
import { CREATE_STAGES, stageHref, type CreateStageKey } from "./create-stages";

function Lock() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "inline", verticalAlign: "-1px", marginLeft: 4 }}>
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function StageTabs({ surveyId, active, gates }: {
  surveyId: string;
  active: CreateStageKey;
  /** A stage with a non-null reason here is gated (not reachable); the reason is
   *  shown as the disabled tab's tooltip. */
  gates?: Partial<Record<CreateStageKey, string | null>>;
}) {
  return (
    <nav
      aria-label="Create stages"
      className="mt-5 flex items-center gap-1 overflow-x-auto no-scrollbar"
      style={{ borderBottom: "1px solid var(--border-default)" }}
    >
      {CREATE_STAGES.map((s) => {
        const isActive = s.key === active;
        const gateReason = gates?.[s.key] ?? null;
        // A gated stage that isn't the current one is not navigable.
        if (gateReason && !isActive) {
          return (
            <span
              key={s.key}
              aria-disabled="true"
              title={gateReason}
              className="whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 -mb-px cursor-not-allowed select-none inline-flex items-center"
              style={{ color: "var(--text-quaternary, var(--text-tertiary))", opacity: 0.55, borderColor: "transparent" }}
            >
              {s.label}<Lock />
            </span>
          );
        }
        return (
          <Link
            key={s.key}
            href={stageHref(surveyId, s.key)}
            aria-current={isActive ? "page" : undefined}
            // Active treatment is ONLY the gold underline — the same on desktop
            // and mobile, never a boxed/outlined tab.
            className="whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none hover:text-[color:var(--text-secondary)]"
            style={isActive
              ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" }
              : { color: "var(--text-tertiary)", borderColor: "transparent" }}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
