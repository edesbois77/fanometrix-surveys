"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard",        label: "Dashboard",        icon: "▦"  },
  { href: "/surveys",          label: "Surveys",          icon: "◫"  },
  { href: "/campaigns",        label: "Campaigns",        icon: "◎"  },
  { href: "/embed-generator",  label: "Embed Generator",  icon: "</>" },
  { href: "/reporting",        label: "Reporting",        icon: "↗"  },
  { href: "/looker-templates", label: "Looker Templates", icon: "◈"  },
  { href: "/demo-data",        label: "Demo Data",        icon: "⚗"  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div className="flex min-h-screen">

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-52 flex-shrink-0 flex flex-col" style={{ backgroundColor: "#0B1929" }}>

        {/* Logo area */}
        <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <Image
            src="/Fanometrix_Logo.png"
            alt="Fanometrix"
            width={140}
            height={32}
            className="mb-2"
            style={{ objectFit: "contain", objectPosition: "left" }}
          />
          <p className="text-xs tracking-wide" style={{ color: "#B0B7C3", letterSpacing: "0.04em" }}>
            Fan Insight Platform
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ href, label, icon }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  color:           active ? "#D7B87A" : "#B0B7C3",
                  backgroundColor: active ? "rgba(215,184,122,0.12)" : "transparent",
                  borderLeft:      active ? "3px solid #D7B87A" : "3px solid transparent",
                  paddingLeft:     active ? "9px" : "9px",
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
          })}
        </nav>

        {/* Footer links */}
        <div className="px-3 py-4 space-y-0.5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {[
            { href: "/privacy",         label: "ⓘ Privacy Policy"  },
            { href: "/publisher-guide", label: "☰ Publisher Guide" },
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
        </div>
      </aside>

      {/* ── Main workspace ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
