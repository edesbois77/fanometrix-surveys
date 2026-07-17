"use client";

// ── Status badges & confidence indicators ────────────────────────────────────
// Passive, informational chips — never buttons, never clickable, no hover
// state. A badge states a fact about state; a confidence indicator states how
// much to trust a result. Both draw from the muted semantic TONE table so the
// whole workspace speaks one colour language.
//
// StatusBadge is API-compatible with the existing ActionPrimitives.StatusBadge
// (same tone names) so either can be used interchangeably during the rollout.

import { TONE, type Tone } from "./tokens";

const DOT_TONE: Record<Tone, string> = {
  neutral: "#98A0AC",
  info:    "#5B7FB4",
  success: "#5C8560",
  warning: "#C79A3E",
  danger:  "#B4694C",
  accent:  "#C7A75E",
};

// `Tone` is re-exported from ./tokens via the barrel; not re-exported here to
// avoid an ambiguous duplicate `export *` name.

// ── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({
  label, tone = "neutral", dot = false, size = "sm", uppercase = false,
}: {
  label: React.ReactNode;
  tone?: Tone;
  /** Leading status dot in the tone's ink colour. */
  dot?: boolean;
  size?: "sm" | "md";
  uppercase?: boolean;
}) {
  const t = TONE[tone];
  const sizeCls = size === "md"
    ? "text-xs px-2.5 py-1 gap-1.5"
    : "text-[11px] px-2 py-0.5 gap-1";
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap border ${sizeCls} ${uppercase ? "uppercase tracking-wide" : ""}`}
      style={{ color: t.ink, background: t.wash, borderColor: t.line }}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT_TONE[tone] }} aria-hidden />
      )}
      {label}
    </span>
  );
}

// ── ConfidenceIndicator ──────────────────────────────────────────────────────
// A three-step trust signal (Low / Medium / High) shown as a filled segment
// meter plus an optional label. Deliberately not a numeric percentage — the
// platform reasons in qualitative bands, and a fabricated precise score would
// overclaim. `basis` (e.g. "real evidence" vs "simulated") reads as the caption.

export type ConfidenceLevel = "low" | "medium" | "high";

const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; tone: Tone; filled: number }> = {
  low:    { label: "Low confidence",    tone: "warning", filled: 1 },
  medium: { label: "Medium confidence", tone: "info",    filled: 2 },
  high:   { label: "High confidence",   tone: "success", filled: 3 },
};

export function ConfidenceIndicator({
  level, label, basis, showLabel = true, size = "sm",
}: {
  level: ConfidenceLevel;
  /** Override the default "<Level> confidence" wording. */
  label?: string;
  /** Small caption after the label, e.g. "based on 3 sources". */
  basis?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}) {
  const meta = CONFIDENCE_META[level];
  const t = TONE[meta.tone];
  const segH = size === "md" ? "h-2" : "h-1.5";
  const segW = size === "md" ? "w-5" : "w-4";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" role="img" aria-label={`${meta.label}${basis ? `, ${basis}` : ""}`}>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className={`${segH} ${segW} rounded-full`}
            style={{ background: i < meta.filled ? DOT_TONE[meta.tone] : "var(--border-default)" }}
          />
        ))}
      </span>
      {showLabel && (
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-xs font-semibold" style={{ color: t.ink }}>{label ?? meta.label}</span>
          {basis && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{basis}</span>}
        </span>
      )}
    </span>
  );
}

// ── Eyebrow ──────────────────────────────────────────────────────────────────
// The small uppercase label used above section titles, on stat tiles and as
// the "The Final Answer"-style kicker. One implementation so tracking/size stay
// identical everywhere.
export function Eyebrow({ children, tone, className = "" }: {
  children: React.ReactNode; tone?: Tone; className?: string;
}) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${className}`}
      style={{ color: tone ? TONE[tone].ink : "var(--text-tertiary)" }}
    >
      {children}
    </p>
  );
}
