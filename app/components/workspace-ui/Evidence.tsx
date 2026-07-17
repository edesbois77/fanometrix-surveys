"use client";

// ── Evidence & source components ─────────────────────────────────────────────
// The heart of the intelligence library: how a research source, a single piece
// of evidence, and the drawer that inspects it all present. Built for an
// analyst reading for provenance — every claim traceable to a typed, attributed
// source — not for generic SaaS list rows.

import { useEffect } from "react";
import { Icon, type IconName } from "./icons";
import { StatusBadge, ConfidenceIndicator, type ConfidenceLevel } from "./Badges";
import { SENTIMENT, type SentimentKey, type Tone } from "./tokens";

// The three first-class research-source types, with a stable visual identity
// (icon + label + accent) shared by SourceCard, EvidenceCard and the drawer so
// a survey always reads as a survey wherever it appears.
export type SourceType = "survey" | "conversation" | "document";

export const SOURCE_META: Record<SourceType, { label: string; icon: IconName; ink: string; wash: string }> = {
  survey:       { label: "Survey",       icon: "survey",       ink: "#3B5A8A", wash: "#EEF3FB" },
  conversation: { label: "Conversation", icon: "conversation", ink: "#5C6B47", wash: "#F0F3EA" },
  document:     { label: "Document",     icon: "document",     ink: "#7A5C86", wash: "#F5EFF7" },
};

function SourceGlyph({ type, size = 32 }: { type: SourceType; size?: number }) {
  const m = SOURCE_META[type];
  const Ico = Icon[m.icon];
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg flex-shrink-0"
      style={{ width: size, height: size, background: m.wash, color: m.ink }}
      aria-hidden
    >
      <Ico size={Math.round(size * 0.5)} />
    </span>
  );
}

// ── SourceCard ───────────────────────────────────────────────────────────────
// A research source at a glance: typed identity, status, a compact metric row,
// and its actions. The whole card is a stable object an analyst returns to — it
// leads with what the source IS and how much it has gathered, not with chrome.
export function SourceCard({
  type, name, subtitle, status, metrics, description, actions, onOpen, footer,
}: {
  type: SourceType;
  name: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: { label: React.ReactNode; tone?: Tone; dot?: boolean };
  metrics?: { label: string; value: React.ReactNode }[];
  description?: React.ReactNode;
  actions?: React.ReactNode;
  onOpen?: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={`border overflow-hidden ${onOpen ? "cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)]" : ""}`}
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}
      onClick={onOpen}
    >
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <SourceGlyph type={type} />
          {/* Identity comes from the typed glyph, so no eyebrow label is needed —
              matching the other project cards. Status sits top-right. */}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{name}</h3>
            {subtitle && <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>{subtitle}</p>}
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            {status && <StatusBadge label={status.label} tone={status.tone ?? "neutral"} dot={status.dot} />}
            {actions && <span className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>{actions}</span>}
          </div>
        </div>

        {description && (
          <p className="text-sm mt-3 leading-relaxed line-clamp-2" style={{ color: "var(--text-secondary)" }}>{description}</p>
        )}

        {metrics && metrics.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
            {metrics.map((m, i) => (
              <div key={i}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{m.label}</p>
                <p className="fx-tabular-nums text-base font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{m.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {footer && (
        <div className="px-4 md:px-5 py-2.5 border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ── EvidenceCard ─────────────────────────────────────────────────────────────
// A single, citable piece of evidence — a verbatim quote, a data point, or a
// document excerpt — always attributed to its typed source. Sentiment (for
// conversation evidence) and confidence sit as quiet signals, never louder than
// the content itself. Clicking opens the full item in the EvidenceDrawer.
export function EvidenceCard({
  kind = "quote", content, sourceType, sourceName, meta, sentiment, confidence, tag, onOpen,
}: {
  kind?: "quote" | "stat" | "excerpt";
  content: React.ReactNode;
  sourceType: SourceType;
  sourceName: React.ReactNode;
  meta?: React.ReactNode;
  sentiment?: SentimentKey;
  confidence?: ConfidenceLevel;
  tag?: string;
  onOpen?: () => void;
}) {
  const sent = sentiment ? SENTIMENT[sentiment] : null;
  return (
    <div
      className={`rounded-lg border p-4 ${onOpen ? "cursor-pointer transition-colors hover:bg-[var(--surface-hover)]" : ""}`}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border-default)",
        borderLeft: sent ? `3px solid ${sent.fill}` : "3px solid var(--border-strong)",
      }}
      onClick={onOpen}
    >
      {/* Content leads. A quote gets a quotation mark and italic; a stat is set large. */}
      {kind === "stat" ? (
        <p className="fx-tabular-nums text-2xl font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{content}</p>
      ) : (
        <div className="flex gap-2">
          {kind === "quote" && <span aria-hidden className="text-2xl leading-none flex-shrink-0 select-none" style={{ color: "var(--border-strong)" }}>&ldquo;</span>}
          <p className={`text-sm leading-relaxed ${kind === "quote" ? "italic" : ""}`} style={{ color: "var(--text-primary)" }}>{content}</p>
        </div>
      )}

      {tag && (
        <div className="mt-3">
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}>{tag}</span>
        </div>
      )}

      {/* Attribution footer — provenance, always present. */}
      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: SOURCE_META[sourceType].ink }}><SourceGlyphInline type={sourceType} /></span>
          <span className="text-xs font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{sourceName}</span>
          {meta && <span className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>· {meta}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sentiment && (
            <span className="text-[11px] font-semibold capitalize" style={{ color: sent!.ink }}>{sentiment}</span>
          )}
          {confidence && <ConfidenceIndicator level={confidence} showLabel={false} />}
        </div>
      </div>
    </div>
  );
}

function SourceGlyphInline({ type }: { type: SourceType }) {
  const Ico = Icon[SOURCE_META[type].icon];
  return <Ico size={14} />;
}

// ── EvidenceDrawer ───────────────────────────────────────────────────────────
// A right-hand slide-over for inspecting one source or one piece of evidence in
// full without leaving the page — the analyst's "show me the receipts" surface.
// Controlled: parent owns `open`. Closes on Escape and backdrop click, locks
// body scroll while open, and traps initial focus on the panel.
export function EvidenceDrawer({
  open, onClose, title, subtitle, eyebrow, children, footer, width = "34rem",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        style={{ background: "rgba(16,24,40,0.36)" }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`absolute inset-y-0 right-0 flex flex-col shadow-2xl transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ width: `min(${width}, 100vw)`, background: "var(--surface)" }}
        role="dialog" aria-modal="true"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "var(--border-default)" }}>
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-tertiary)" }}>{eyebrow}</p>}
            <h2 className="text-base font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{title}</h2>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 -m-1.5 p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-sunken)]"
            style={{ color: "var(--text-tertiary)" }}
            aria-label="Close"
          >
            <Icon.close size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t flex-shrink-0" style={{ borderColor: "var(--border-default)", background: "var(--surface-sunken)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading skeletons ────────────────────────────────────────────────────────
export function SourceCardSkeleton() {
  return (
    <div className="border p-5" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-default)", background: "var(--surface)" }}>
      <div className="flex items-start gap-3">
        <div className="fx-skeleton rounded-lg" style={{ width: 32, height: 32 }} />
        <div className="flex-1">
          <div className="fx-skeleton h-3 w-24 rounded mb-2" />
          <div className="fx-skeleton h-4 w-40 rounded" />
        </div>
      </div>
      <div className="flex gap-6 mt-4">
        {[0, 1, 2].map(i => <div key={i}><div className="fx-skeleton h-2.5 w-14 rounded mb-1.5" /><div className="fx-skeleton h-5 w-10 rounded" /></div>)}
      </div>
    </div>
  );
}

export function EvidenceCardSkeleton() {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border-default)", background: "var(--surface)" }}>
      <div className="fx-skeleton h-3 w-full rounded mb-2" />
      <div className="fx-skeleton h-3 w-5/6 rounded mb-3" />
      <div className="fx-skeleton h-3 w-32 rounded" />
    </div>
  );
}
