"use client";

// ── Surface hierarchy & layout primitives ────────────────────────────────────
// The structural building blocks every workspace area composes from. Three
// levels of surface — page wash → card → sunken well — separated by hairline
// borders and whisper-light shadow. Keeping these in one place is what makes an
// Overview card and an Analysis card feel like the same material.

import { Eyebrow } from "./Badges";

// ── PageContainer ────────────────────────────────────────────────────────────
// The standard content column: one width (var(--page-max)), one set of
// gutters, one vertical rhythm. Every area page wraps its body in this so the
// header rule, the nav tabs and the content align to the same edges and no page
// re-declares max-width / padding by hand.
export function PageContainer({
  children, className = "", gap = "lg",
}: {
  children: React.ReactNode;
  className?: string;
  /** Vertical spacing between direct children. */
  gap?: "md" | "lg" | "xl";
}) {
  const gapCls = gap === "xl" ? "space-y-8" : gap === "md" ? "space-y-4" : "space-y-6";
  return (
    <div
      className={`mx-auto w-full px-4 md:px-6 py-6 ${gapCls} ${className}`}
      style={{ maxWidth: "var(--page-max)" }}
    >
      {children}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
// The default surface: white, hairline border, gentle radius, whisper shadow.
// `tone` tints the whole card for the rare case a surface needs to signal state
// (a warning notice, a success confirmation) without a separate callout.
export function Card({
  children, className = "", padding = "lg", interactive = false, tone,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds hover lift + cursor for cards that are whole clickable targets. */
  interactive?: boolean;
  tone?: "warning" | "success" | "info" | "danger";
}) {
  const padCls = padding === "none" ? "" : padding === "sm" ? "p-3" : padding === "md" ? "p-4" : "p-5 md:p-6";
  const toneStyle: React.CSSProperties = tone
    ? { background: `var(--accent-wash)` } // overridden below per tone
    : { background: "var(--surface)" };
  const toneMap: Record<string, { bg: string; border: string }> = {
    warning: { bg: "#FBF7EE", border: "#ECDCB8" },
    success: { bg: "#F1F6F0", border: "#D3E0D0" },
    info:    { bg: "#F1F5FB", border: "#D6E2F1" },
    danger:  { bg: "#F9EFEA", border: "#E8D2C4" },
  };
  const resolved = tone ? toneMap[tone] : null;
  return (
    <div
      className={`border ${interactive ? "transition-shadow transition-colors hover:shadow-[var(--shadow-md)]" : ""} ${padCls} ${className}`}
      style={{
        borderRadius: "var(--radius-panel)",
        background: resolved ? resolved.bg : (toneStyle.background as string),
        borderColor: resolved ? resolved.border : "var(--border-default)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────
// A sunken, borderless well for secondary/reference material inside a Card —
// the "not editorial content" surface (stat rows, previews, metadata blocks).
export function Panel({ children, className = "", padding = "md" }: {
  children: React.ReactNode; className?: string; padding?: "sm" | "md" | "lg";
}) {
  const padCls = padding === "sm" ? "p-3" : padding === "lg" ? "p-5" : "p-4";
  return (
    <div
      className={`border ${padCls} ${className}`}
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface-sunken)", borderColor: "var(--border-subtle)" }}
    >
      {children}
    </div>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ className = "", spacing = "md" }: {
  className?: string; spacing?: "none" | "sm" | "md" | "lg";
}) {
  const my = spacing === "none" ? "" : spacing === "sm" ? "my-3" : spacing === "lg" ? "my-6" : "my-4";
  return <hr className={`border-0 border-t ${my} ${className}`} style={{ borderColor: "var(--border-subtle)" }} />;
}

// ── SectionHeading ───────────────────────────────────────────────────────────
// The lightweight heading for a block *inside* a page — an optional eyebrow, a
// title, an optional description, and an optional trailing action/meta slot.
// (Distinct from WorkspaceHeader, which is the page-level header.)
export function SectionHeading({
  eyebrow, title, description, action, className = "",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
        <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {description && (
          <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

// ── StatTile ─────────────────────────────────────────────────────────────────
// A single metric: eyebrow label, large tabular value, optional delta/caption.
// Compose in a grid for a KPI row. Tabular figures keep digits aligned as they
// tick.
export function StatTile({
  label, value, caption, tone,
}: {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const captionColor = tone === "success" ? "#5C8560" : tone === "warning" ? "#C79A3E" : tone === "danger" ? "#B4694C" : "var(--text-tertiary)";
  return (
    <div className="border p-4" style={{ borderRadius: "var(--radius-tile)", background: "var(--surface)", borderColor: "var(--border-default)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="fx-tabular-nums mt-1.5 text-2xl font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{value}</p>
      {caption && <p className="text-xs mt-1" style={{ color: captionColor }}>{caption}</p>}
    </div>
  );
}
