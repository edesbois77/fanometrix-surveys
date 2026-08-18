"use client";

// ── StudioFunnel — compact Survey journey (V2) ───────────────────────────────
// A compact, token-bound, dependency-free progression: Q1 → Q2 … QN → Completed,
// as a small row of vertical bars whose height encodes share-of-started, with the
// drop-off between stages. Deliberately low-footprint (a single ~90px band) — the
// journey is a diagnostic, not the hero. Question-level only (exposure lives in the
// collection-health strip), so the scale stays readable. Dynamic 1–5. Flat, no 3D.
// Accessible: an ordered list with real text values; bars are decorative.

import type { JourneyStage } from "@/lib/studio/dashboard-performance";

const pct = (n: number | null): string => (n == null ? "—" : `${Math.round(n * 100)}%`);
const BAR_MAX = 64;

export function StudioFunnel({ stages }: { stages: JourneyStage[] }) {
  const started = stages[0]?.count ?? 0;
  return (
    <div className="overflow-x-auto no-scrollbar">
      <ol className="flex items-end gap-0.5 min-w-max pt-1" aria-label="Survey journey">
        {stages.map((s, i) => {
          const h = s.ofStarted != null ? Math.max(10, s.ofStarted * BAR_MAX) : started === 0 ? BAR_MAX : 10;
          const isCompleted = s.key === "completed";
          const drop = s.droppedCount != null && s.droppedCount > 0;
          return (
            <li key={s.key} className="flex items-end gap-0.5">
              {i > 0 && (
                <div className="flex flex-col items-center justify-end w-9 flex-shrink-0 pb-6" aria-hidden>
                  <span className="text-[10px] fx-tabular-nums" style={{ color: drop ? "#B4694C" : "var(--text-disabled)" }}>
                    {drop ? `−${pct(s.dropFromPrev)}` : ""}
                  </span>
                  <span style={{ color: "var(--text-disabled)" }}>›</span>
                </div>
              )}
              <div className="flex flex-col items-center" style={{ minWidth: 56 }} title={s.question ?? undefined}>
                <span className="text-sm font-bold fx-tabular-nums leading-none mb-1" style={{ color: "var(--text-primary)" }}>{s.count.toLocaleString()}</span>
                <div
                  className="w-12 rounded-t-md transition-[height] duration-500"
                  style={{ height: h, background: isCompleted ? "var(--accent-gold)" : "var(--surface-sunken)", border: `1px solid ${isCompleted ? "#ECDCB8" : "var(--border-subtle)"}`, borderBottom: "none" }}
                />
                <span className="text-[11px] font-semibold mt-1.5 leading-none" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
                <span className="text-[10px] fx-tabular-nums mt-0.5" style={{ color: "var(--text-tertiary)" }}>{pct(s.ofStarted)}</span>
              </div>
              <span className="sr-only">
                {s.label}: {s.count.toLocaleString()} ({pct(s.ofStarted)} of those who started{i > 0 && drop ? `, ${s.droppedCount!.toLocaleString()} lost from the previous stage` : ""})
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
