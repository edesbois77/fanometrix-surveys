"use client";

// ── StudioSidebar — Level 2, the Survey Studio product navigation ────────────
// "Where am I within Survey Studio?" A light-grey contextual sidebar, clearly
// distinct from the navy global header above and the white workspace beside it.
// Five primary destinations (Home / Create / Request / Discover / Manage) at ONE
// flat level — no accordions, no children revealed beneath an item; that lower
// navigation belongs inside the workspace, under the page title.
//
// Responsive:
//   • lg+  — full sidebar: icons + labels.
//   • md   — compact rail: icons only; the label is available via title/aria.
//   • <md  — hidden here; served as a temporary drawer (see StudioShell), so the
//            global header remains the platform frame on mobile.
//
// Permission-aware by construction: it renders visibleStudioNav(role), which
// OMITS destinations a role can't use rather than showing them disabled.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/app/components/SessionProvider";
import { visibleStudioNav, activeStudioKey } from "@/lib/studio-nav";
import { StudioIcon } from "./studio-icons";
import { GLOBAL_HEADER_H } from "./GlobalShell";

const GOLD = "#D7B87A";

// Shared list of links. `variant` controls whether labels show (rail hides them
// on md; the drawer and desktop-full always show them).
function StudioNavList({ variant, onNavigate }: { variant: "responsive" | "full"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  const items = visibleStudioNav(user?.role);
  const activeKey = activeStudioKey(pathname);

  return (
    <nav aria-label="Survey Studio" className="flex flex-col gap-0.5 px-2.5">
      {items.map(item => {
        const Glyph = StudioIcon[item.icon];
        const active = item.key === activeKey;
        // md rail hides labels; lg and the drawer show them.
        const labelCls = variant === "full" ? "inline" : "hidden lg:inline";
        const justify = variant === "full" ? "" : "md:justify-center lg:justify-start";
        return (
          <Link
            key={item.key}
            href={item.href}
            title={item.label}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${justify}`}
            style={{
              color: active ? "var(--accent-ink)" : "var(--text-secondary)",
              background: active ? "var(--accent-wash)" : "transparent",
              boxShadow: active ? `inset 3px 0 0 ${GOLD}` : "inset 3px 0 0 transparent",
            }}
            onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; } }}
            onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; } }}
          >
            <span className="flex-shrink-0" style={{ color: active ? "var(--accent-ink)" : "var(--text-tertiary)" }} aria-hidden>
              <Glyph size={18} />
            </span>
            <span className={`truncate ${labelCls}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// Desktop sidebar — sticky under the header; rail at md, full at lg. Hidden on
// mobile (the drawer takes over).
export function StudioSidebar() {
  return (
    <aside
      className="hidden md:flex md:flex-col flex-shrink-0 md:w-16 lg:w-56 sticky self-start print:hidden"
      style={{
        top: GLOBAL_HEADER_H,
        height: `calc(100vh - ${GLOBAL_HEADER_H})`,
        background: "var(--surface-sunken)",
        borderRight: "1px solid var(--border-default)",
      }}
    >
      <div className="flex-1 overflow-y-auto py-4">
        <StudioNavList variant="responsive" />
      </div>
    </aside>
  );
}

// Mobile drawer — a temporary panel over the workspace, opened from the global
// header's menu button.
export function StudioSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden print:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`fixed left-0 z-50 flex flex-col w-64 md:hidden print:hidden transition-transform duration-200 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          top: GLOBAL_HEADER_H,
          height: `calc(100dvh - ${GLOBAL_HEADER_H})`,
          background: "var(--surface-sunken)",
          borderRight: "1px solid var(--border-default)",
        }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-tertiary)" }}>
            Survey Studio
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: "var(--text-tertiary)" }}
            aria-label="Close navigation"
          >
            <StudioIcon.menu size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          <StudioNavList variant="full" onNavigate={onClose} />
        </div>
      </aside>
    </>
  );
}
