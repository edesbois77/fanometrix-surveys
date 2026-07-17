"use client";

// A campaign presented in the premium card language of the Survey Research /
// Execution source cards — never the management-table row of the standalone
// Campaigns page. Used only inside the Execution Campaigns workflow.
//
// The whole card is clickable → the campaign's Dashboard (its operational home),
// exactly like the legacy Campaigns module; buttons stopPropagation so they act
// without navigating. Action hierarchy:
//   • Primary (state-driven): Go Live · Pause · Resume · Publish · or, for
//     terminal states, View Dashboard.
//   • Utilities: Preview · Get Tags (the campaign's Deployment section).
//   • Overflow (⋯): Edit · Duplicate · Archive/Restore · Delete.
// No Copy Embed — embeds come only from Get Tags.
//
// State transitions reuse lib/campaign-status + POST /api/campaigns/[id]/actions,
// so this and the standalone page can never disagree.
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, StatusBadge, ProgressBar, TONE, type Tone } from "@/app/components/workspace-ui";
import type { CampaignAction, CampaignStatus } from "@/lib/campaign-status";
import { countryByCode } from "@/lib/countries";
import type { Campaign } from "@/app/components/campaigns/types";

const STATUS_TONE: Record<CampaignStatus, Tone> = {
  draft: "warning", scheduled: "info", live: "success", paused: "warning", closed: "neutral", archived: "neutral",
};
const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft", scheduled: "Scheduled", live: "Live", paused: "Paused", closed: "Closed", archived: "Archived",
};

// The state-driven primary. Terminal states (closed/archived) have no lifecycle
// toggle, so their primary is View Dashboard (which the whole card also opens).
type Primary = { kind: "dashboard" } | { kind: "action"; action: CampaignAction; label: string };
function principalAction(c: Campaign): Primary {
  const st = c.effective_status;
  if (st === "live") return { kind: "action", action: "pause", label: "Pause" };
  if (st === "paused") return { kind: "action", action: "resume", label: "Resume" };
  if (st === "scheduled") return { kind: "action", action: "go_live", label: "Go Live" };
  if (st === "draft") {
    const futureStart = c.start_date ? new Date(`${c.start_date}T00:00:00`) > new Date() : false;
    return futureStart
      ? { kind: "action", action: "publish", label: "Publish" }
      : { kind: "action", action: "go_live", label: "Go Live" };
  }
  return { kind: "dashboard" }; // closed / archived
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type MenuItem = { label: string; onClick: () => void; disabled?: boolean; title?: string; danger?: boolean };

// The menu renders in a portal (document.body) so the card's `overflow-hidden`
// (needed for its rounded corners + status accent) can't clip it — the options
// overlay the interface instead of expanding beneath the card.
function OverflowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  }

  return (
    <div className="flex-shrink-0">
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label="More actions"
        className="inline-flex items-center justify-center w-8 h-7 rounded-md border text-base leading-none hover:bg-[var(--surface-hover)]"
        style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)", background: "var(--surface)" }}
      >
        ⋯
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-[61] min-w-[10rem] py-1 border"
            style={{ top: pos.top, right: pos.right, borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-md)" }}
          >
            {items.map((it, i) => (
              <button
                key={i}
                disabled={it.disabled}
                title={it.title}
                onClick={() => { setOpen(false); it.onClick(); }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-hover)]"
                style={{ color: it.danger ? "#B4694C" : "var(--text-secondary)" }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export function ExecutionCampaignCard({
  campaign: c, basePath, orgName,
  actioning, onAction, onPreview, onDuplicate, onDelete,
  selected, onToggleSelect,
}: {
  campaign: Campaign;
  /** The survey's Campaigns page path; campaign sub-pages hang off it. */
  basePath: string;
  orgName: (id: string | null) => string;
  actioning: string | null;
  onAction: (c: Campaign, action: CampaignAction) => void;
  onPreview: (c: Campaign) => void;
  onDuplicate: (c: Campaign) => void;
  onDelete: (c: Campaign) => void;
  /** Multi-select for bulk operations — a checkbox appears when provided. */
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const router = useRouter();
  const st = c.effective_status;
  const tone: Tone = STATUS_TONE[st] ?? "danger";
  const ink = TONE[tone].ink;
  const primary = principalAction(c);
  const target = c.effective_target_responses ?? c.target_responses;
  const pct = target && target > 0 ? Math.min(100, Math.round((c.response_count / target) * 100)) : null;
  const isLiveOrPaused = st === "live" || st === "paused";
  const country = c.market || (c.country_code ? countryByCode(c.country_code)?.name ?? c.country_code : null);
  // Operational identifiers only — publisher and market. Brand/agency belong to
  // the project, not the deployment, so they'd only add administrative noise.
  const chips = [orgName(c.publisher_org_id), country].filter(Boolean) as string[];
  const busy = primary.kind === "action" && actioning === c.id + primary.action;

  const dashboardHref = `${basePath}/campaign/${c.id}`;
  const tagsHref = `${dashboardHref}?section=deployment`;
  const editHref = `${dashboardHref}/edit`;

  const overflow: MenuItem[] = [
    { label: "Duplicate", onClick: () => onDuplicate(c) },
  ];
  if (st === "closed") overflow.push({ label: "Archive", onClick: () => onAction(c, "archive") });
  if (st === "archived") overflow.push({ label: "Restore", onClick: () => onAction(c, "restore") });
  overflow.push({
    label: "Delete", onClick: () => onDelete(c), danger: true,
    disabled: isLiveOrPaused, title: isLiveOrPaused ? "Pause or close this campaign before deleting it." : undefined,
  });

  return (
    <div
      onClick={() => router.push(dashboardHref)}
      className="overflow-hidden border cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)]"
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: selected ? "var(--accent-gold)" : "var(--border-default)", boxShadow: selected ? "0 0 0 1px var(--accent-gold), var(--shadow-sm)" : "var(--shadow-sm)", borderLeft: `3px solid ${ink}` }}
    >
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={!!selected}
              onClick={e => e.stopPropagation()}
              onChange={onToggleSelect}
              aria-label={`Select ${c.campaign_name}`}
              className="mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer"
              style={{ accentColor: "#0B1929" }}
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{c.campaign_name}</h3>
            <p className="text-[11px] mt-0.5 fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              Campaign #{String(c.campaign_number).padStart(6, "0")}
            </p>
          </div>
          <StatusBadge label={STATUS_LABEL[st] ?? st} tone={tone} dot size="md" />
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {chips.map((ch, i) => (
              <span key={i} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{ch}</span>
            ))}
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Response progress</span>
            <span className="text-xs font-semibold fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {target ? `${c.response_count.toLocaleString()} of ${target.toLocaleString()} responses` : `${c.response_count.toLocaleString()} responses · no target`}
            </span>
          </div>
          {target && <ProgressBar value={pct ?? 0} tone={st === "live" ? "success" : "accent"} showValue={false} />}
          {(c.start_date || c.end_date) && (
            <p className="text-[11px] mt-1.5 fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : "ongoing"}
            </p>
          )}
        </div>
      </div>

      {/* Actions — stopPropagation so buttons act without opening the Dashboard. */}
      <div
        onClick={e => e.stopPropagation()}
        className="px-4 md:px-5 py-2.5 border-t flex items-center justify-between gap-2 flex-wrap"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {primary.kind === "dashboard" ? (
            <Button variant="primary" size="sm" href={dashboardHref}>View Dashboard →</Button>
          ) : (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => onAction(c, primary.action)}>
              {busy ? "…" : primary.label}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onPreview(c)}>Preview</Button>
          <Button variant="secondary" size="sm" href={tagsHref}>Get Tags</Button>
          <Button variant="secondary" size="sm" href={editHref}>Edit</Button>
        </div>
        <OverflowMenu items={overflow} />
      </div>
    </div>
  );
}
