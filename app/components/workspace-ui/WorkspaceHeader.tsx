"use client";

// ── WorkspaceHeader ──────────────────────────────────────────────────────────
// The consistent page-level header every Research Project area inherits. It
// gives each area the same anatomy so navigating between Overview, Research,
// Dashboard, Analysis, Reports and Conclusions feels like one product:
//
//   ┌────────────────────────────────────────────────────────────┐
//   │ ◭ Organisation            (optional identity row, reserved) │
//   │ EYEBROW                                                     │
//   │ Title                              [status]   [ secondary ] │
//   │ Description — one calm sentence.               [ PRIMARY  ] │
//   │ · meta · meta · meta                                       │
//   └────────────────────────────────────────────────────────────┘
//
// It renders no card of its own — it sits at the top of the PageContainer,
// separated from the content below by whitespace, exactly like Linear's or
// Notion's page headers. Only `title` is required; everything else is optional
// so a minimal area (just a title + description) reads the same as a rich one
// (status, primary action, meta row).

import Link from "next/link";
import { Eyebrow, StatusBadge } from "./Badges";
import { BackLink } from "./Actions";
import { Icon } from "./icons";
import { type Tone } from "./tokens";

// ── Breadcrumb ───────────────────────────────────────────────────────────────
// Where am I in Survey Studio, and how do I get back up? A compact, secondary
// ancestor trail. Ancestors (with `href`) are links with a clear hover; the final
// item is the current resource — not a link, slightly stronger. A small chevron
// separates items (never a heavy ">"). Long current names truncate gracefully.
export type Crumb = { label: string; href?: string };

export function Breadcrumb({ items, className = "" }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className}`}>
      <ol className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-xs min-w-0">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="inline-flex items-center gap-x-1 min-w-0">
              {c.href && !last ? (
                <Link href={c.href} className="transition-colors hover:text-[var(--text-primary)] focus-visible:text-[var(--text-primary)] rounded-sm truncate" style={{ color: "var(--text-tertiary)" }}>{c.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate" style={{ color: last ? "var(--text-secondary)" : "var(--text-tertiary)", fontWeight: last ? 600 : 400 }}>{c.label}</span>
              )}
              {!last && <span className="flex-shrink-0" style={{ color: "var(--text-disabled)" }} aria-hidden="true"><Icon.chevronRight size={12} /></span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type WorkspaceHeaderStatus = {
  label: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
};

// Reserved, deliberately data-model-agnostic identity slot. `logo` is any node
// (an <Image>, an <svg>, an initials chip) so adding org branding later needs
// no change here and no assumption about where a logo URL comes from; when no
// logo is supplied we fall back to an initials chip. Nothing renders unless a
// caller passes it — so it costs nothing until org identity actually ships.
export type WorkspaceHeaderOrg = {
  name: string;
  logo?: React.ReactNode;
};

function OrgIdentity({ org }: { org: WorkspaceHeaderOrg }) {
  const initials = org.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "•";
  return (
    <div className="flex items-center gap-2 mb-2.5">
      {org.logo ?? (
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold flex-shrink-0"
          style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
          aria-hidden
        >
          {initials}
        </span>
      )}
      <span className="text-xs font-semibold truncate" style={{ color: "var(--text-secondary)" }}>{org.name}</span>
    </div>
  );
}

export function WorkspaceHeader({
  breadcrumb,
  back,
  organisation,
  eyebrow,
  title,
  description,
  status,
  primaryAction,
  secondaryActions,
  meta,
}: {
  /** Ancestor breadcrumb trail shown above the header. Preferred over `back`;
   *  when set, the `back` link is not rendered (they'd be redundant). */
  breadcrumb?: Crumb[];
  /** A "← Back" link to the parent page, shown above the header. */
  back?: { href: string; label: string };
  /**
   * Optional organisation identity (small logo + name) shown above the eyebrow.
   * Reserved for a future org-branding pass — intentionally understated so it
   * never competes with the page's real hero (the research question). Leave it
   * unset and the header is byte-for-byte what it was before.
   */
  organisation?: WorkspaceHeaderOrg;
  /** Small uppercase kicker above the title (e.g. the area name). */
  eyebrow?: string;
  title: React.ReactNode;
  /** One calm sentence stating what this area is for. */
  description?: React.ReactNode;
  /** Passive status pill shown next to the title. */
  status?: WorkspaceHeaderStatus;
  /** The single main forward action for this area. */
  primaryAction?: React.ReactNode;
  /** Lower-emphasis actions shown before the primary action. */
  secondaryActions?: React.ReactNode;
  /** A row of small facts under the description (counts, dates, owner). */
  meta?: React.ReactNode;
}) {
  const hasActions = primaryAction || secondaryActions;
  return (
    <header className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        {breadcrumb && breadcrumb.length > 0 ? <Breadcrumb items={breadcrumb} className="mb-2.5" />
          : back ? <BackLink href={back.href} label={back.label} className="mb-2" /> : null}
        {organisation && <OrgIdentity org={organisation} />}
        {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>
            {title}
          </h1>
          {status && <StatusBadge label={status.label} tone={status.tone ?? "neutral"} dot={status.dot} size="md" />}
        </div>
        {description && (
          <p className="text-sm mt-1.5 leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            {description}
          </p>
        )}
        {meta && (
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {meta}
          </div>
        )}
      </div>

      {hasActions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </header>
  );
}

// ── HeaderMetaItem ───────────────────────────────────────────────────────────
// A single fact in the header's meta row, with an optional leading label. Use
// several; they space and wrap consistently.
export function HeaderMetaItem({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label && <span style={{ color: "var(--text-disabled)" }}>{label}</span>}
      <span style={{ color: "var(--text-secondary)" }}>{children}</span>
    </span>
  );
}
