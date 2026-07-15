"use client";

// The Workspace/Product Walkthrough's shared action vocabulary — three
// primitives so the same *kind* of action reads the same way everywhere
// on this page, without forcing every action to look identical:
//
//   PrimaryButton   — gold-filled. The one main forward/create action in
//                     a section (+ Add Research Source, View Report, an
//                     initial Generate). Never more than one per action
//                     area, so it never has to compete with itself.
//   SecondaryButton — outlined neutral. Opening, reviewing, editing or
//                     managing something that already exists (Open,
//                     Review Findings, Edit, Manage). `compact` matches
//                     the existing Expand/Collapse box exactly, for
//                     wrapping it without making it visually heavier.
//   StatusBadge     — passive. Never a button, never a hover state, never
//                     an onClick — a fact about state, not an action.
//
// Deliberately scoped to this page: standalone routes (the Campaigns
// manager, the standalone report pages) keep their own existing
// components unless this pass needs to touch them directly.
import Link from "next/link";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

type ActionProps = {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
  children: React.ReactNode;
};

export function PrimaryButton({ href, onClick, disabled, title, className = "", type = "button", children }: ActionProps) {
  const classes = `text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${className}`;
  if (href && !disabled) {
    return (
      <Link href={href} title={title} className={classes} style={{ background: GOLD, color: NAVY }}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={classes} style={{ background: GOLD, color: NAVY }}>
      {children}
    </button>
  );
}

// The Workspace's "utility" tier — a real forward action (Regenerate),
// but deliberately not gold: Regenerate always sits in a section that
// already resolved its one gold moment (Generate, View Report, Approve),
// so it stays navy rather than competing with it. Sized to match the
// scale Regenerate already used everywhere it appeared before this pass
// (Conclusion, the standalone report pages) — one size, reused, not
// invented fresh here.
export function UtilityButton({ href, onClick, disabled, title, className = "", type = "button", children }: ActionProps) {
  const classes = `text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 ${className}`;
  if (href && !disabled) {
    return (
      <Link href={href} title={title} className={classes} style={{ background: NAVY, color: GOLD }}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={classes} style={{ background: NAVY, color: GOLD }}>
      {children}
    </button>
  );
}

export function SecondaryButton({
  href, onClick, disabled, title, className = "", type = "button", compact = false, children,
}: ActionProps & { compact?: boolean }) {
  const classes = compact
    // Matches the existing Expand/Collapse box exactly — same padding,
    // same lighter resting color — so wrapping it never makes it heavier.
    ? `text-xs font-semibold text-gray-400 hover:text-gray-600 border border-gray-200 hover:bg-white rounded-lg px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${className}`
    : `text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 ${className}`;
  if (href && !disabled) {
    return <Link href={href} title={title} className={classes}>{children}</Link>;
  }
  return <button type={type} onClick={onClick} disabled={disabled} title={title} className={classes}>{children}</button>;
}

export type BadgeTone = "neutral" | "warning" | "success" | "info" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-500",
  warning: "bg-amber-50 text-amber-700",
  success: "bg-green-50 text-green-700",
  info:    "bg-blue-50 text-blue-700",
  danger:  "bg-red-50 text-red-600",
};

// Passive only — no button, no onClick, no hover state. `dot` reproduces
// the project-level status badge's leading emoji dot for the one context
// that already had it (the Workspace header); every other status pill on
// this page has never had one and doesn't gain one here.
export function StatusBadge({ label, tone, dot, size = "sm" }: {
  label: string; tone: BadgeTone; dot?: string; size?: "sm" | "md";
}) {
  const sizeClasses = size === "md" ? "text-xs px-2.5 py-1 gap-1.5 font-semibold" : "text-xs px-2 py-0.5 gap-1 font-medium";
  return (
    <span className={`inline-flex items-center rounded-full whitespace-nowrap ${sizeClasses} ${TONE_CLASSES[tone]}`}>
      {dot && <span className="text-[9px]">{dot}</span>}
      {label}
    </span>
  );
}
