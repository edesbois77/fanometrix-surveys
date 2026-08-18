"use client";

// ── Survey Studio Home — presentational cards ────────────────────────────────
// The card and panel vocabulary the adaptive Home composes. Purely presentational
// and stateless: StudioHome owns which sections appear and in what order; these
// own how each one looks. They inherit the workspace-ui token system so the Home
// reads as one product with the rest of the shell.

import Link from "next/link";
import { StudioIcon } from "../studio-icons";
import { Card, StatusBadge, Eyebrow, SectionHeading } from "@/app/components/workspace-ui";
import type { Tone } from "@/app/components/workspace-ui";
import type { ProjectCard, FindingCard as FindingCardT, ReportItem, ActivityItem, AttentionItem, PerformanceRow } from "./types";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

const STATUS_TONE: Record<string, { tone: Tone; label: string }> = {
  live: { tone: "success", label: "Live" },
  scheduled: { tone: "info", label: "Scheduled" },
  paused: { tone: "warning", label: "Paused" },
  draft: { tone: "neutral", label: "Draft" },
  closed: { tone: "neutral", label: "Closed" },
  archived: { tone: "neutral", label: "Archived" },
};

function confidenceTone(c: string | null): Tone {
  switch ((c ?? "").toLowerCase()) {
    case "high": return "success";
    case "moderate": case "medium": return "info";
    case "low": case "tentative": return "warning";
    default: return "neutral";
  }
}

// ── Live Research (operational) ──────────────────────────────────────────────
export function LiveResearchCard({ p }: { p: ProjectCard }) {
  const st = STATUS_TONE[p.status] ?? { tone: "neutral" as Tone, label: p.status };
  const pct = p.completionPct != null ? Math.min(100, Math.max(0, p.completionPct)) : null;
  return (
    <Link href={p.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
      <Card interactive className="h-full flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <StatusBadge label={st.label} tone={st.tone} dot />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{timeAgo(p.lastResponseAt)}</span>
        </div>
        <h3 className="mt-2.5 text-[15px] font-bold leading-snug tracking-[-0.01em] line-clamp-2" style={{ color: "var(--text-primary)" }}>
          {p.name}
        </h3>
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <span className="fx-tabular-nums text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {p.totalResponses.toLocaleString()}
              {p.target ? <span className="font-normal" style={{ color: "var(--text-tertiary)" }}> / {p.target.toLocaleString()}</span> : null}
            </span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{pct != null ? `${pct}%` : "responses"}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct ?? (p.totalResponses > 0 ? 100 : 0)}%`, background: GOLD }} />
          </div>
        </div>
        <div className="mt-auto pt-3 flex items-center gap-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {p.publisherCount > 0 && <span>{p.publisherCount} publisher{p.publisherCount === 1 ? "" : "s"}</span>}
          {p.countryCount > 0 && <span>{p.countryCount} market{p.countryCount === 1 ? "" : "s"}</span>}
          <span className="ml-auto inline-flex items-center gap-1 font-semibold" style={{ color: "var(--accent-ink)" }}>
            Open <StudioIcon.arrowRight size={13} />
          </span>
        </div>
      </Card>
    </Link>
  );
}

// ── Latest Intelligence — a published finding (the flagship editorial card) ──
export function FindingResultCard({ f }: { f: FindingCardT }) {
  return (
    <Link href={f.href} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
      <article
        className="h-full flex flex-col rounded-[var(--radius-panel)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-default)", borderTop: `3px solid ${GOLD}` }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: GOLD }} aria-hidden><StudioIcon.discover size={15} /></span>
          <Eyebrow>{f.aspect ? f.aspect : "Finding"}</Eyebrow>
        </div>
        <h3 className="mt-2.5 text-[17px] font-bold leading-snug tracking-[-0.015em] line-clamp-4" style={{ color: "var(--text-primary)" }}>
          {f.headline}
        </h3>
        {f.detail && (
          <p className="mt-2 text-[13px] leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)" }}>
            {f.detail}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {f.confidence && <StatusBadge label={`${f.confidence} confidence`} tone={confidenceTone(f.confidence)} />}
          {f.base != null && f.base > 0 && (
            <span className="fx-tabular-nums text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>
              n = {f.base.toLocaleString()}
            </span>
          )}
        </div>
        <div className="mt-auto pt-3 flex items-center gap-2 text-xs border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="truncate" style={{ color: "var(--text-tertiary)" }}>{f.projectName}</span>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold whitespace-nowrap" style={{ color: "var(--accent-ink)" }}>
            View finding <StudioIcon.arrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </article>
    </Link>
  );
}

// ── Your Research — a study you can access, routed into Discover → Research ──
export function ResearchCard({ p }: { p: ProjectCard }) {
  const st = STATUS_TONE[p.status] ?? { tone: "neutral" as Tone, label: p.status };
  return (
    <Link href={p.discoverHref} className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
      <Card interactive className="h-full flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <StatusBadge label={st.label} tone={st.tone} />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{timeAgo(p.lastResponseAt)}</span>
        </div>
        <h3 className="mt-2.5 text-[15px] font-bold leading-snug tracking-[-0.01em] line-clamp-2" style={{ color: "var(--text-primary)" }}>
          {p.name}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          {p.totalResponses > 0 ? `${p.totalResponses.toLocaleString()} responses` : "No responses yet"}
          {p.publisherCount > 0 ? ` · ${p.publisherCount} publisher${p.publisherCount === 1 ? "" : "s"}` : ""}
          {p.countryCount > 0 ? ` · ${p.countryCount} market${p.countryCount === 1 ? "" : "s"}` : ""}
        </p>
        <span className="mt-auto pt-4 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
          Open research <StudioIcon.arrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </Card>
    </Link>
  );
}

// ── Recent Reports — a compact list panel (only rendered when non-empty) ─────
export function ReportsPanel({ items }: { items: ReportItem[] }) {
  return (
    <Card className="h-full">
      <SectionHeading eyebrow="Recent" title="Reports" description="Recently published reports available to you." />
      <ul className="mt-3 space-y-1">
        {items.map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-[var(--surface-hover)] group">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 mt-0.5" style={{ background: "var(--accent-wash)", color: "var(--accent-ink)" }} aria-hidden>
                <StudioIcon.discover size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.projectName}</span>
                <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>{r.label}{r.at ? ` · ${timeAgo(r.at)}` : ""}</span>
              </span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity self-center" style={{ color: "var(--accent-ink)" }} aria-hidden><StudioIcon.arrowRight size={14} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Performance — responses by research, related to the live studies ─────────
export function PerformancePanel({ data }: { data: PerformanceRow[] }) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  return (
    <Card className="h-full">
      <SectionHeading eyebrow="Performance" title="Responses by research" description="Where fan responses are concentrated across your live studies." />
      <div className="mt-4 space-y-3">
        {data.map((d) => (
          <div key={d.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm truncate inline-flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                {d.live && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--tone-success-ink, #1a7f52)" }} aria-hidden />}
                {d.name}
              </span>
              <span className="fx-tabular-nums text-sm font-semibold flex-shrink-0" style={{ color: "var(--text-primary)" }}>{d.value.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round((d.value / max) * 100))}%`, background: d.live ? GOLD : "var(--border-strong, #c9cdd3)" }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Recent Activity (compact, low priority) ──────────────────────────────────
const ACTIVITY_ICON = { survey: StudioIcon.create, campaign: StudioIcon.manage, project: StudioIcon.discover } as const;

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="h-full">
      <SectionHeading eyebrow="Recent" title="Activity" />
      <ul className="mt-3 space-y-1">
        {items.map((a) => {
          const Glyph = ACTIVITY_ICON[a.kind];
          return (
            <li key={a.key}>
              <Link href={a.href} className="flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-[var(--surface-hover)]">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 mt-0.5" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }} aria-hidden>
                  <Glyph size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{a.title}</span>
                  <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>{a.label}{a.at ? ` · ${timeAgo(a.at)}` : ""}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── Needs Attention (only when actionable; sits at the very top) ─────────────
// A restrained attention surface (warning tone, not an error state). Each row is
// a whole clickable target that resolves to a DIRECT action — continue a draft,
// open the operational workspace — with a persistent action affordance so it
// reads as something to do, never as passive explanatory text.
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <Card tone="warning" padding="md">
      <div className="flex items-center gap-2">
        <span style={{ color: "#8A6A2F" }} aria-hidden><StudioIcon.bell size={16} /></span>
        <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Needs attention</h2>
      </div>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {items.map((a) => (
          <li key={a.key}>
            <Link
              href={a.href}
              className="flex items-start gap-3 rounded-lg p-3 -m-0 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
              style={{ background: "rgba(255,255,255,0.55)", border: "1px solid #ECDCB8" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.9)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.55)"; }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</span>
                <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{a.detail}</span>
                <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
                  {a.action} <StudioIcon.arrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Section band header with an optional link ────────────────────────────────
export function Band({ eyebrow, title, description, link }: {
  eyebrow: string; title: string; description?: string; link?: { label: string; href: string };
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div className="min-w-0">
        <Eyebrow className="mb-1">{eyebrow}</Eyebrow>
        <h2 className="text-lg font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {description && <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{description}</p>}
      </div>
      {link && (
        <Link href={link.href} className="flex-shrink-0 inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap" style={{ color: "var(--accent-ink)" }}>
          {link.label} <StudioIcon.arrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

export { NAVY, GOLD };
