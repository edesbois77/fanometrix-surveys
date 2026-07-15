"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { useState, useEffect } from "react";
import type { UserRole } from "@/lib/auth";

// ── Nav items derived from shared config ──────────────────────────────────────
// Importing here keeps AdminShell in sync with the homepage automatically.
import {
  getMainNavItems,
  getHomeNavItems,
  getDeveloperNavItems,
  getFooterNavItems,
  getNavGroupItems,
  ADMIN_SIDEBAR_SECTIONS,
} from "@/lib/nav-config";

type NavItem = { href: string; label: string; icon: string; external?: boolean };

const DEVELOPER_HREFS = getDeveloperNavItems().map(i => i.href);

const SKELETON_NAV = Array.from({ length: 4 }, (_, i) => i);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path   = usePathname();
  const router = useRouter();
  const { user, loading } = useSession();
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [devOpen,      setDevOpen]      = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    surveys: true, "social-listening": true,
  });

  function toggleSection(group: string) {
    setOpenSections(s => ({ ...s, [group]: !s[group] }));
  }

  const homeNav     = user ? getHomeNavItems(user.role as UserRole) : [];
  const nav         = user ? getMainNavItems(user.role as UserRole) : []; // compat alias
  const footerLinks = user ? getFooterNavItems(user.role as UserRole) : [];
  const isAdmin = user?.role === "admin";

  // Auto-close sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [path]);

  // Ping last_seen_at on every navigation — server rate-limits writes to once per 5 min
  useEffect(() => {
    fetch("/api/auth/ping", { method: "POST" }).catch(() => {/* non-fatal */});
  }, [path]);

  // Auto-expand Developer section when navigating to a developer route
  useEffect(() => {
    if (DEVELOPER_HREFS.some(h => path === h || path.startsWith(h + "/"))) {
      setDevOpen(true);
    }
  }, [path]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="flex min-h-screen">

      {/* ── Mobile backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      {/*
        Mobile:  fixed, slides in from left, z-50 above backdrop
        Desktop: sticky, always visible, standard layout flow
      */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex flex-col h-screen w-64",
          "transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:relative lg:z-auto lg:w-52 lg:flex-shrink-0 lg:sticky lg:top-0",
          "lg:translate-x-0",
          "print:hidden",
        ].join(" ")}
        style={{ backgroundColor: "#0B1929" }}
      >
        {/* Logo area */}
        <div className="px-5 py-5 flex items-start justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="min-w-0 flex-1">
            <Link href="/home">
              <Image
                src="/Fanometrix_Logo.png"
                alt="Fanometrix"
                width={140} height={32}
                className="mb-2"
                style={{ objectFit: "contain", objectPosition: "left" }}
              />
            </Link>
            <p className="text-xs tracking-wide" style={{ color: "#B0B7C3", letterSpacing: "0.04em" }}>
              Fan Insight Platform
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            className="lg:hidden flex-shrink-0 ml-2 p-2 text-white/50 hover:text-white rounded-lg
                       hover:bg-white/10 transition-colors"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        {/*
          Single scrollable column, nav items + footer.
          On desktop: footer sits at the bottom naturally (mt-auto).
          On mobile: the whole column scrolls so Sign out is always reachable.
        */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

          {/* Navigation */}
          <nav className="px-3 py-4">

            {/* HOME section — always shown */}
            {loading ? (
              <div className="space-y-0.5">
                {SKELETON_NAV.map(i => (
                  <div key={i} className="h-9 rounded-lg mx-0.5 my-0.5 animate-pulse"
                    style={{ backgroundColor: "rgba(255,255,255,0.05)" }} />
                ))}
              </div>
            ) : (
              <>
                <NavLink href="/home" label="Home" icon="⌂" activePath={path} />
                {homeNav.map(item => (
                  <NavLink key={item.href} {...item} activePath={path} />
                ))}
              </>
            )}

            {/* Surveys + Social Listening — collapsible sections, filtered to
                whatever the current role can see (empty groups render nothing) */}
            {!loading && user && ADMIN_SIDEBAR_SECTIONS.map(({ heading, group }) => {
              const items   = getNavGroupItems(group, user.role as UserRole);
              const isOpen  = openSections[group] ?? true;
              if (!items.length) return null;
              return (
                <div key={group} className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  <button
                    onClick={() => toggleSection(group)}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg
                               text-xs font-semibold uppercase tracking-widest transition-colors
                               hover:bg-white/5 select-none"
                    style={{ color: "rgba(176,183,195,0.6)", letterSpacing: "0.1em" }}
                  >
                    <span>{heading}</span>
                    <span className="text-[10px] transition-transform duration-150"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                      ▾
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-0.5 mt-1">
                      {items.map(item => (
                        <NavLink key={item.href} {...item} activePath={path} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Developer section — admin only, collapsible, alphabetical */}
            {!loading && isAdmin && (
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <button
                  onClick={() => setDevOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg
                             text-xs font-semibold uppercase tracking-widest transition-colors
                             hover:bg-white/5 select-none"
                  style={{ color: "rgba(176,183,195,0.6)", letterSpacing: "0.1em" }}
                >
                  <span>Developer</span>
                  <span className="text-[10px] transition-transform duration-150"
                    style={{ transform: devOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    ▾
                  </span>
                </button>
                {devOpen && (
                  <div className="space-y-0.5 mt-1">
                    {getDeveloperNavItems().map(item => (
                      <NavLink key={item.href} {...item} activePath={path} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Footer — mt-auto pushes it to bottom on desktop; scrolls into view on mobile.
              padding-bottom uses env(safe-area-inset-bottom) so the last item clears
              the Chrome/Safari browser navigation bar on mobile. */}
          <div className="mt-auto px-3 pt-4 space-y-0.5"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
            }}>
            {/* Privacy always shown; footer nav items from shared config */}
            {[
              { href: "/privacy", label: "ⓘ Privacy Policy", external: true },
              ...footerLinks.map(i => ({ href: i.href, label: `${i.icon} ${i.label}`, external: true })),
            ].map(({ href, label, external }) =>
              external ? (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors"
                  style={{ color: "#B0B7C3" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF"; (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#B0B7C3"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  {label}<span className="text-[10px] opacity-40">↗</span>
                </a>
              ) : (
                <Link key={href} href={href}
                  className="flex items-center px-3 py-2 rounded-lg text-xs transition-colors"
                  style={{ color: "#B0B7C3" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF"; (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#B0B7C3"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  {label}
                </Link>
              )
            )}

            {!loading && user && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="px-3 text-xs mb-1.5 truncate" style={{ color: "#B0B7C3" }}>
                  {user.organisationName || user.workEmail}
                </p>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium
                             transition-colors text-left"
                  style={{ color: "#B0B7C3" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF"; (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#B0B7C3"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                >
                  <span className="text-xs w-4 text-center">→</span>
                  Sign out
                </button>
              </div>
            )}
          </div>

        </div>
      </aside>

      {/* ── Main workspace ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile top bar — hamburger + logo */}
        <header
          className="lg:hidden print:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-30 flex-shrink-0"
          style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Open navigation"
          >
            {/* Hamburger icon */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="2.5"  width="20" height="2.5" rx="1.25"/>
              <rect y="8.75" width="20" height="2.5" rx="1.25"/>
              <rect y="15"   width="20" height="2.5" rx="1.25"/>
            </svg>
          </button>
          <Link href="/home">
            <Image
              src="/Fanometrix_Logo.png"
              alt="Fanometrix"
              width={110} height={24}
              style={{ objectFit: "contain", objectPosition: "left" }}
            />
          </Link>
        </header>

        {/* No overflow-auto here — the outer shell is min-h-screen (not
            h-screen), so main always grows to fit its content rather than
            scrolling internally; overflow-auto would still mark it as a
            scroll container in CSS terms and silently break `sticky`
            positioning for anything inside it, pinning descendants to
            main's own (never-scrolling) box instead of the real window
            scroll. */}
        <main className="flex-1 bg-gray-50 print:bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({ href, label, icon, activePath, external }: NavItem & { activePath: string }) {
  const active = !external && (activePath === href || activePath.startsWith(href + "/"));

  const sharedStyle: React.CSSProperties = {
    color:           active ? "#D7B87A" : "#B0B7C3",
    backgroundColor: active ? "rgba(215,184,122,0.12)" : "transparent",
    borderLeft:      active ? "3px solid #D7B87A" : "3px solid transparent",
    paddingLeft:     "9px",
  };

  const sharedProps = {
    className: "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
    style: sharedStyle,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (!active) {
        (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)";
        (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
      }
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      if (!active) {
        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
        (e.currentTarget as HTMLElement).style.color = "#B0B7C3";
      }
    },
  };

  const content = (
    <>
      <span className="text-xs w-4 text-center flex-shrink-0">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {external && <span className="text-[10px] opacity-40 flex-shrink-0 ml-auto">↗</span>}
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...sharedProps}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} {...sharedProps}>
      {content}
    </Link>
  );
}
