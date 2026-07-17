"use client";

// ── Action vocabulary ────────────────────────────────────────────────────────
// The three button tiers the workspace uses, so the same *kind* of action reads
// the same everywhere. These mirror the semantics of the older
// ActionPrimitives buttons but are sized for the new header/foundation scale
// and draw from the token system.
//
//   Button variant="primary"   — gold-filled. The one main forward action per
//                                 surface (Add Source, Generate, View Report).
//   Button variant="brand"     — navy-filled with gold text. A strong forward
//                                 action that isn't the gold moment (Regenerate,
//                                 Run) — present but not competing.
//   Button variant="secondary" — outlined neutral. Open / Edit / Manage / Back.
//   Button variant="ghost"     — text-only, lowest emphasis.

import Link from "next/link";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

type Variant = "primary" | "brand" | "secondary" | "ghost";
type Size = "sm" | "md";

type Props = {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
};

const SIZE_CLS: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
};

function styleFor(variant: Variant): { className: string; style: React.CSSProperties } {
  switch (variant) {
    case "primary":
      return { className: "font-semibold border border-transparent", style: { background: GOLD, color: NAVY } };
    case "brand":
      return { className: "font-semibold border border-transparent", style: { background: NAVY, color: GOLD } };
    case "secondary":
      return {
        className: "font-semibold border hover:bg-[var(--surface-hover)]",
        style: { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-default)" },
      };
    case "ghost":
      return {
        className: "font-semibold border border-transparent hover:bg-[var(--surface-sunken)]",
        style: { background: "transparent", color: "var(--text-secondary)" },
      };
  }
}

export function Button({
  href, onClick, disabled, title, className = "", type = "button", variant = "secondary", size = "sm", children,
}: Props) {
  const v = styleFor(variant);
  const classes = `inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${SIZE_CLS[size]} ${v.className} ${className}`;
  const style: React.CSSProperties = { ...v.style, borderRadius: "var(--radius-control)" };
  if (href && !disabled) {
    return <Link href={href} title={title} className={classes} style={style}>{children}</Link>;
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={classes} style={style}>
      {children}
    </button>
  );
}

// ── BackLink ─────────────────────────────────────────────────────────────────
// The one "← Back" affordance used everywhere in the Research Project workspace
// (page headers, record editors). Quiet grey, small, consistent icon/height/
// hover — so moving back up a level always looks and behaves the same. A
// leading "← " already in the label is stripped so callers can pass either form.
export function BackLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 text-xs font-semibold transition-colors text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] ${className}`}
    >
      <span aria-hidden>←</span> {label.replace(/^←\s*/, "")}
    </Link>
  );
}
