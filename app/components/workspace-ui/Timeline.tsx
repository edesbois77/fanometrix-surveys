"use client";

// ── Timeline & ActivityFeed ──────────────────────────────────────────────────
// Two takes on chronology. Timeline is the milestone view — a research
// project's lifecycle events, spaced and described. ActivityFeed is the dense
// audit stream — who did what, when — for a side rail or the Activity area.

import { Icon, type IconName } from "./icons";
import { type Tone, TONE } from "./tokens";

// ── Timeline ─────────────────────────────────────────────────────────────────
export function Timeline({
  items, className = "",
}: {
  items: {
    title: React.ReactNode;
    timestamp?: React.ReactNode;
    description?: React.ReactNode;
    icon?: IconName;
    tone?: Tone;
    meta?: React.ReactNode;
  }[];
  className?: string;
}) {
  return (
    <ol className={className}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const t = TONE[it.tone ?? "neutral"];
        const Ico = it.icon ? Icon[it.icon] : null;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{ width: 28, height: 28, background: t.wash, color: t.ink, border: `1px solid ${t.line}` }}
                aria-hidden
              >
                {Ico ? <Ico size={14} /> : <span className="w-2 h-2 rounded-full" style={{ background: t.ink }} />}
              </span>
              {!last && <span className="w-px flex-1 my-1" style={{ background: "var(--border-default)", minHeight: 20 }} />}
            </div>
            <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{it.title}</p>
                {it.timestamp && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{it.timestamp}</span>}
              </div>
              {it.description && <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{it.description}</p>}
              {it.meta && <div className="mt-1.5">{it.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── ActivityFeed ─────────────────────────────────────────────────────────────
// The dense who/what/when stream. Each row is an actor (initials chip), an
// action sentence, and a relative time. Optional typed icon for system events.
function Initials({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 text-[10px] font-bold"
      style={{ width: 26, height: 26, background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function ActivityFeed({
  items, className = "", dividers = true,
}: {
  items: {
    actor?: string;
    action: React.ReactNode;
    target?: React.ReactNode;
    timestamp: React.ReactNode;
    icon?: IconName;
    tone?: Tone;
  }[];
  className?: string;
  dividers?: boolean;
}) {
  return (
    <ul className={className}>
      {items.map((it, i) => {
        const t = it.tone ? TONE[it.tone] : null;
        const Ico = it.icon ? Icon[it.icon] : null;
        return (
          <li
            key={i}
            className="flex items-start gap-3 py-2.5"
            style={dividers && i > 0 ? { borderTop: "1px solid var(--border-subtle)" } : undefined}
          >
            {Ico ? (
              <span
                className="inline-flex items-center justify-center rounded-full flex-shrink-0 mt-0.5"
                style={{ width: 26, height: 26, background: t?.wash ?? "var(--surface-sunken)", color: t?.ink ?? "var(--text-tertiary)" }}
                aria-hidden
              >
                <Ico size={14} />
              </span>
            ) : it.actor ? <Initials name={it.actor} /> : (
              <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2.5" style={{ background: t?.ink ?? "var(--border-strong)" }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
                {it.actor && <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{it.actor} </span>}
                {it.action}
                {it.target && <span className="font-semibold" style={{ color: "var(--text-primary)" }}> {it.target}</span>}
              </p>
            </div>
            <span className="text-xs flex-shrink-0 whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{it.timestamp}</span>
          </li>
        );
      })}
    </ul>
  );
}
