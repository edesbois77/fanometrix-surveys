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
  // Hover feedback per tier.
  //   • Filled tiers (primary/brand) carry their colour as an INLINE style, which a
  //     Tailwind `hover:bg-*` cannot override — so they shift with a brightness
  //     filter (works over any inline background) plus a small lift.
  //   • Outlined tiers (secondary/ghost) take their colours from CLASSES, not inline
  //     style. This is deliberate: an inline `style` background/border/color beats a
  //     `hover:` class, so setting them inline would make the hover invisible (the
  //     original bug). Secondary gets an unmistakable rollover — a gold wash fill,
  //     gold border, darkened ink, a shadow and a 1px lift.
  switch (variant) {
    case "primary":
      return { className: "font-semibold border border-transparent hover:brightness-95 hover:shadow-sm hover:-translate-y-px", style: { background: GOLD, color: NAVY } };
    case "brand":
      return { className: "font-semibold border border-transparent hover:brightness-125 hover:shadow-sm hover:-translate-y-px", style: { background: NAVY, color: GOLD } };
    case "secondary":
      return {
        className:
          "font-semibold border bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border-default)] " +
          "hover:bg-[var(--accent-wash)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-ink)] hover:shadow-md hover:-translate-y-px",
        style: {},
      };
    case "ghost":
      return {
        className:
          "font-semibold border border-transparent text-[var(--text-secondary)] " +
          "hover:bg-[var(--accent-wash)] hover:text-[var(--accent-ink)]",
        style: {},
      };
  }
}

export function Button({
  href, onClick, disabled, title, className = "", type = "button", variant = "secondary", size = "sm", children,
}: Props) {
  const v = styleFor(variant);
  // transition covers colour AND the filter/shadow/transform used across tiers, so
  // the rollover animates smoothly. Disabled + active reset the lift/shadow/filter
  // so a non-clickable or pressed button doesn't appear to hover.
  const classes = `inline-flex items-center justify-center gap-1.5 cursor-pointer transition-[color,background-color,border-color,filter,box-shadow,transform] duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none disabled:hover:translate-y-0 active:translate-y-0 active:shadow-none flex-shrink-0 ${SIZE_CLS[size]} ${v.className} ${className}`;
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
