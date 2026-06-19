"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import type { UserRole } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: string };

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  admin: [
    { href: "/dashboard",           label: "Dashboard",           icon: "▦"   },
    { href: "/survey-templates",    label: "Survey Templates",    icon: "◫"   },
    { href: "/campaigns",           label: "Campaigns",           icon: "◎"   },
    { href: "/campaign-deployment", label: "Campaign Deployment", icon: "</>" },
    { href: "/reporting",           label: "Reporting",           icon: "↗"   },
    { href: "/looker-templates",    label: "Looker Templates",    icon: "◈"   },
    { href: "/demo-data",           label: "Demo Data",           icon: "⚗"   },
    { href: "/user-management",     label: "User Management",     icon: "◉"   },
  ],
  brand: [
    { href: "/dashboard",        label: "Dashboard",        icon: "▦" },
    { href: "/campaign-reports", label: "Campaign Reports", icon: "↗" },
    { href: "/exports",          label: "Exports",          icon: "⬇" },
    { href: "/insights",         label: "Insights",         icon: "◈" },
  ],
  agency: [
    { href: "/dashboard",             label: "Dashboard",             icon: "▦" },
    { href: "/campaign-reports",      label: "Campaign Reports",      icon: "↗" },
    { href: "/publisher-performance", label: "Publisher Performance", icon: "◉" },
    { href: "/exports",               label: "Exports",               icon: "⬇" },
  ],
  publisher: [
    { href: "/dashboard",             label: "Dashboard",             icon: "▦" },
    { href: "/publisher-performance", label: "Publisher Performance", icon: "◉" },
  ],
};

const SKELETON_NAV = Array.from({ length: 4 }, (_, i) => i);

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path   = usePathname();
  const router = useRouter();
  const { user, loading } = useSession();

  const nav = user ? (NAV_BY_ROLE[user.role as UserRole] ?? []) : [];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 flex flex-col" style={{ backgroundColor: "#0B1929" }}>

        {/* Logo area */}
        <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <Link href="/home">
            <Image
              src="/Fanometrix_Logo.png"
              alt="Fanometrix"
              width={140}
              height={32}
              className="mb-2"
              style={{ objectFit: "contain", objectPosition: "left" }}
            />
          </Link>
          <p className="text-xs tracking-wide" style={{ color: "#B0B7C3", letterSpacing: "0.04em" }}>
            Fan Insight Platform
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {/* Home link — always shown */}
          {!loading && (
            <NavLink href="/home" label="Home" icon="⌂" activePath={path} />
          )}

          {loading
            ? SKELETON_NAV.map(i => (
                <div
                  key={i}
                  className="h-9 rounded-lg mx-0.5 my-0.5 animate-pulse"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                />
              ))
            : nav.map(item => (
                <NavLink key={item.href} {...item} activePath={path} />
              ))
          }
        </nav>

        {/* Footer: links + user / logout */}
        <div className="px-3 py-4 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {[
            { href: "/privacy",       label: "ⓘ Privacy Policy"  },
            { href: "/publisher-hub", label: "☰ Publisher Hub"   },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors"
              style={{ color: "#B0B7C3" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FFFFFF"; (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#B0B7C3"; (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            >
              {label}
            </Link>
          ))}

          {/* User / logout area */}
          {!loading && user && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="px-3 text-xs mb-1.5 font-mono truncate" style={{ color: "#B0B7C3" }}>
                {user.username}
              </p>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left"
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
      </aside>

      {/* ── Main workspace ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}

function NavLink({
  href, label, icon, activePath,
}: NavItem & { activePath: string }) {
  const active = activePath === href || activePath.startsWith(href + "/");
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        color:           active ? "#D7B87A" : "#B0B7C3",
        backgroundColor: active ? "rgba(215,184,122,0.12)" : "transparent",
        borderLeft:      active ? "3px solid #D7B87A" : "3px solid transparent",
        paddingLeft:     "9px",
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.05)";
          (e.currentTarget as HTMLElement).style.color = "#FFFFFF";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#B0B7C3";
        }
      }}
    >
      <span className="text-xs w-4 text-center">{icon}</span>
      {label}
    </Link>
  );
}
