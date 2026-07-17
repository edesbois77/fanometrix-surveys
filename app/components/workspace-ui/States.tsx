"use client";

// ── Standard states: loading · empty · error ─────────────────────────────────
// Every area currently re-declares its own inline "Loading research project…"
// and error blocks. These three components replace that duplication with one
// consistent, calm treatment so a slow Analysis page and a slow Dashboard look
// identical while they resolve.

import Link from "next/link";

// ── Skeleton primitives ──────────────────────────────────────────────────────
// Prefer skeletons over spinners for content areas — they preserve layout and
// read as "the page is arriving", not "something is stuck".
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`fx-skeleton rounded-md ${className}`} style={style} aria-hidden />;
}

// A skeleton shaped like a WorkspaceHeader + a couple of cards — the default
// loading state for a whole area page.
export function PageLoadingState({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-none" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {/* Header */}
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-6 w-64 mb-2.5" />
      <Skeleton className="h-4 w-96 max-w-full" />
      {/* Cards */}
      <div className="mt-8 space-y-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="rounded-xl border p-5 md:p-6" style={{ borderColor: "var(--border-default)", background: "var(--surface)" }}>
            <Skeleton className="h-4 w-40 mb-4" />
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-3 w-5/6 mb-2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────
// The considered "nothing here yet" surface — an optional icon, a title, one
// supporting line, and an optional call to action. Not an error; an invitation.
export function EmptyState({
  icon, title, description, action, compact = false,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center rounded-xl border border-dashed ${compact ? "py-8 px-6" : "py-14 px-6"}`}
      style={{ borderColor: "var(--border-default)", background: "var(--surface)" }}
    >
      {icon && (
        <div
          className="flex items-center justify-center w-11 h-11 rounded-full mb-3 text-lg"
          style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
      {description && (
        <p className="text-sm mt-1.5 max-w-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── ErrorState ───────────────────────────────────────────────────────────────
// A recoverable failure. Defaults to the project-not-found case every area
// shared, with a Back link; override title/description/action for anything else.
export function ErrorState({
  title = "Something went wrong",
  description,
  action,
  backHref = "/research-projects",
  backLabel = "Back to Research Projects",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  backHref?: string | null;
  backLabel?: string;
}) {
  return (
    <div
      className="flex flex-col items-center text-center rounded-xl border py-14 px-6"
      style={{ borderColor: "var(--border-default)", background: "var(--surface)" }}
      role="alert"
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-full mb-3 text-lg"
        style={{ background: "#F7ECE6", color: "#8A4B33" }}
        aria-hidden
      >
        !
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
      {description && (
        <p className="text-sm mt-1.5 max-w-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{description}</p>
      )}
      <div className="mt-4 flex items-center gap-3">
        {action}
        {backHref && (
          <Link href={backHref} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>
            ← {backLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

// ── InlineEmpty ──────────────────────────────────────────────────────────────
// The lightweight one-liner for an empty region inside a card (replaces the
// old Shell.EmptyState). Not a full framed state.
export function InlineEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm py-2" style={{ color: "var(--text-tertiary)" }}>{children}</p>;
}
