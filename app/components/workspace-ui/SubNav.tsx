"use client";

// ── SubNav ───────────────────────────────────────────────────────────────────
// The section-level sub-navigation used by multi-page workspace areas (Dashboard,
// Analysis). It mirrors the ProjectShell area nav one level down: a row of
// underlined tabs, the active one carrying the gold rule. It is deliberately
// source-agnostic — a section is just a `base` path plus a list of `{segment,
// label}` items — so a new evidence source (Google Trends, CRM, media…) is added
// by appending one item, never by restructuring the nav.
//
// The active tab is derived from the URL the same way ProjectShell derives the
// active area: the first path segment after `base`. The section home is the item
// with an empty `segment` (href === base).
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SubNavItem = { segment: string; label: string };

export function SubNav({ base, items, ariaLabel = "Section" }: { base: string; items: SubNavItem[]; ariaLabel?: string }) {
  const pathname = usePathname();
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const activeSeg = rest.split("/").filter(Boolean)[0] ?? "";

  return (
    <nav aria-label={ariaLabel} className="flex items-center gap-1 border-b overflow-x-auto" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map(item => {
        const active = activeSeg === item.segment;
        const href = item.segment ? `${base}/${item.segment}` : base;
        return (
          <Link
            key={item.segment || "home"}
            href={href}
            aria-current={active ? "page" : undefined}
            className="text-sm font-medium px-3 py-2 border-b-2 whitespace-nowrap transition-colors"
            style={active
              ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" }
              : { color: "var(--text-tertiary)", borderColor: "transparent" }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
