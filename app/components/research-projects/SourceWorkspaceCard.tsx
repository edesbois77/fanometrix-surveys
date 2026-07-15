"use client";

// Generic shell every Research Source renders through — Survey,
// Conversation Search, Industry Research today, future evidence types
// (Uploaded Documents, CRM, Ticketing…) later. Every source is designed
// around the same contract: target, current progress, status, config, a
// Run action, an Open action. Source types that aren't fully wired up yet
// render through this exact same shell with placeholder/disabled values
// rather than a reduced one-off layout, so the page never has to explain
// why one card looks structurally different from another, and a new
// source type is a wiring exercise, not new UI.
//
// Deliberately named for the evidence source itself (Survey, Conversation
// Search, Industry Research) — never "X Intelligence": that word is
// reserved for the Intelligence section, the next stage in the lifecycle,
// where AI-reviewed reports get generated from what this card collects.
//
// Collapsible: a project can have any number of Surveys/Conversation
// Searches now (Phase 1 of the multi-source correction), so every card
// defaults to a compact collapsed summary rather than rendering fully
// expanded — the collapse/expand state itself is owned by the caller
// (WorkspaceBody), this component only renders whichever mode it's told.
// Pass no `collapsed` prop (undefined) to opt a card out of collapsing
// entirely — e.g. the static "Coming Soon" Industry Research placeholder,
// which isn't a real interactive source yet.
import type { ReactNode } from "react";
import { SecondaryButton, StatusBadge, type BadgeTone } from "@/app/components/research-projects/ActionPrimitives";

const GOLD = "#D7B87A";

export type CollectionStatus = "not_started" | "collecting" | "generating" | "target_reached" | "coming_soon" | "failed";

const STATUS_META: Record<CollectionStatus, { label: string; tone: BadgeTone }> = {
  not_started:   { label: "Not Started",    tone: "neutral" },
  collecting:    { label: "Collecting",     tone: "warning" },
  // "Run Research" (migration 095, Product Walkthrough only) — visually
  // distinct from "Collecting" (real progress) even though both use the
  // same amber tone, since this is a simulated run in flight, not genuine
  // incoming data.
  generating:    { label: "Generating",     tone: "warning" },
  target_reached:{ label: "Target Reached", tone: "success" },
  coming_soon:   { label: "Coming Soon",    tone: "neutral" },
  failed:        { label: "Research Failed",tone: "danger" },
};

export function deriveCollectionStatus(current: number | null, target: number | null): CollectionStatus {
  if (current === null || target === null) return "not_started";
  if (current <= 0) return "not_started";
  if (target > 0 && current >= target) return "target_reached";
  return "collecting";
}

export function SourceWorkspaceCard({
  badge, simulatedBadge, title, subtitle, status,
  target, current, unitLabel,
  runAction, openAction, secondaryAction, disabled, children,
  collapsed, onToggleCollapse, collapsedMeta,
}: {
  badge: string;
  simulatedBadge?: ReactNode;
  title: string;
  subtitle?: string;
  status: CollectionStatus;
  /** null renders as "—" — a source type (or a real-project field) that
   * doesn't have a target concept yet, not zero progress. */
  target: number | null;
  current: number | null;
  unitLabel: string;
  runAction?: ReactNode;
  openAction?: ReactNode;
  /** A lower-emphasis action (e.g. "Remove from Project") rendered
   * beneath the primary actions rather than competing with them. */
  secondaryAction?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
  /** Omit entirely to opt this card out of collapsing (always renders
   * expanded, no toggle shown) — pass true/false to enable it. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Extra compact info shown only in the collapsed header — e.g. a
   * campaign count for a Survey card. */
  collapsedMeta?: ReactNode;
}) {
  const meta = STATUS_META[status];
  // "Target Reached" is always a full bar, even with no numeric target at
  // all — a completed simulated run (status resolved from run_status, not
  // counts, see ResearchSourcesSection/DashboardSection) is definitionally
  // 100%, not stuck at 0% just because target is null. Same fix as
  // DashboardSourceTile's gauge — this component has its own separate pct
  // calculation for the bar fill, driven by target/current, not by the
  // status label above it, so the two were able to disagree.
  const pct = status === "target_reached"
    ? 100
    : target && target > 0 && current !== null ? Math.min(100, Math.round((current / target) * 100)) : null;
  const collapsible = collapsed !== undefined;

  const progressText = (
    <span className="text-gray-400" style={{ fontVariantNumeric: "tabular-nums" }}>
      {current !== null ? current.toLocaleString() : "—"} {unitLabel}{current === 1 ? "" : "s"}
      {target !== null && <span> of {target.toLocaleString()} target</span>}
    </span>
  );

  return (
    <div className={`border border-gray-100 rounded-xl overflow-hidden ${disabled ? "opacity-60" : ""}`}>
      <div className="px-4 py-3 flex items-start justify-between gap-3 flex-wrap" style={{ background: "#FBF9F4" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{badge}</span>
            {simulatedBadge}
          </div>
          <p className="text-sm font-medium text-gray-800 truncate">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          {collapsed && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              <StatusBadge label={meta.label} tone={meta.tone} />
              {progressText}
              {collapsedMeta}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {collapsible && (
            <SecondaryButton compact onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? "▸ Expand" : "▾ Collapse"}
            </SecondaryButton>
          )}
          {!collapsed && (
            <>
              <div className="flex items-center gap-2">
                {openAction}
                {runAction}
              </div>
              {secondaryAction}
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <StatusBadge label={meta.label} tone={meta.tone} />
              {progressText}
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct ?? 0}%`, background: pct !== null && pct >= 100 ? "#10b981" : GOLD }}
              />
            </div>
          </div>

          {children}
        </div>
      )}
    </div>
  );
}
