"use client";

// Shared Deploy helpers used by both the Campaigns card actions and the Deploy
// stage: the campaign status pill (existing STATUS_META palette), a same-origin
// preview link, and the deliberate-Deploy confirmation modal (shows the exact
// server-decided outcome — Live now vs Scheduled — per campaign).

import { useState, useEffect } from "react";
import { Button } from "@/app/components/workspace-ui";
import { STATUS_META, type CampaignStatus } from "@/lib/campaign-status";
import { GO_LIVE_UNDO_GRACE_MS } from "@/lib/studio/campaign-lifecycle";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${Number(d)} ${MONTHS[Number(m) - 1] ?? "?"} ${y}`; };

// In Studio a closed campaign is surfaced as "Ended" (the author-facing word for
// "stopped collecting"); the underlying status/palette is unchanged.
const STUDIO_STATUS_LABEL: Partial<Record<CampaignStatus, string>> = { closed: "Ended" };

export function StatusPill({ status }: { status: string }) {
  const key = status as CampaignStatus;
  const m = STATUS_META[key] ?? STATUS_META.draft;
  const label = STUDIO_STATUS_LABEL[key] ?? m.label;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${m.bg} ${m.text}`}>{label}</span>;
}

// ── Go-live undo, with a live red countdown ──────────────────────────────────
// Shown on a just-Live campaign: the "Return to Draft" undo plus a red mm:ss
// countdown of the grace window remaining ("… before it locks in"). Self-contained
// so it ticks every second WITHOUT re-rendering the whole campaign list, and it
// removes itself the instant the window closes (the server enforces the same
// boundary, so the button can never outlive the window it promises). Render it only
// for a Live campaign; the timing/visibility is handled here.
export function GoLiveUndo({ statusUpdatedAt, busy, onUndo }: {
  statusUpdatedAt: string | null | undefined; busy: boolean; onUndo: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const compute = () => {
      const t = statusUpdatedAt ? Date.parse(statusUpdatedAt) : NaN;
      const rem = Number.isFinite(t) ? Math.max(0, GO_LIVE_UNDO_GRACE_MS - (Date.now() - t)) : 0;
      setRemainingMs(rem);
      if (rem <= 0 && id) { clearInterval(id); id = null; } // stop ticking once locked
    };
    compute();
    id = setInterval(compute, 1000);
    return () => { if (id) clearInterval(id); };
  }, [statusUpdatedAt]);

  if (remainingMs == null || remainingMs <= 0) return null; // pre-mount or window closed

  const totalSec = Math.ceil(remainingMs / 1000);
  const clock = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="brand" size="sm" disabled={busy} onClick={onUndo} title="Undo an accidental go-live">Return to Draft</Button>
      <span className="text-[11px] font-semibold fx-tabular-nums" style={{ color: "#C0392B" }} role="timer" aria-live="off">
        {clock} to return to Draft before it locks in
      </span>
    </span>
  );
}

/** Same-origin preview link (preview=1 bypasses the serve gate; read-only, never
 *  activates a campaign). */
export function previewHref(slug: string, lang: string, country: string | null | undefined): string {
  const c = country ? `&country=${encodeURIComponent(country)}` : "";
  return `/embed?campaign=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}${c}&preview=1`;
}

export interface DeployItem {
  label: string;
  outcome: "live" | "scheduled";
  startDate: string | null;
}

export function DeployConfirmModal({ items, busy, onConfirm, onClose }: {
  items: DeployItem[]; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const n = items.length;
  const liveNow = items.filter((i) => i.outcome === "live").length;
  const scheduled = n - liveNow;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.45)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Confirm deploy" className="w-full max-w-md rounded-[var(--radius-card)] p-5" style={{ background: "var(--surface)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div className="text-[15px] font-bold mb-1" style={{ color: "var(--text-primary)" }}>Deploy {n} campaign{n === 1 ? "" : "s"}?</div>
        <p className="text-[12px] mb-3" style={{ color: "var(--text-tertiary)" }}>
          This is the deliberate activation. {liveNow > 0 && <>{liveNow} will go <strong>Live</strong> now. </>}{scheduled > 0 && <>{scheduled} will be <strong>Scheduled</strong> and start automatically at its market-local start date.</>} Collection then follows the settled runtime rules; you cannot undo activation here.
        </p>
        <ul className="max-h-48 overflow-y-auto -mx-1 px-1 mb-3 space-y-1">
          {items.map((i, k) => (
            <li key={k} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="truncate" style={{ color: "var(--text-primary)" }}>{i.label}</span>
              <span className="shrink-0" style={{ color: "var(--text-secondary)" }}>
                {i.outcome === "live" ? "Live now" : `Scheduled${i.startDate ? ` · ${fmtDate(i.startDate)}` : ""}`}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={busy}>{busy ? "Deploying…" : `Deploy ${n === 1 ? "campaign" : "all"}`}</Button>
        </div>
      </div>
    </div>
  );
}
