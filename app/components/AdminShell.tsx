"use client";

import Link from "next/link";
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
    <div style={{ display: "flex", minHeight: "100vh" }}>

      {/* ── Sidebar (dark chrome) ───────────────────────────────────── */}
      <aside style={{
        width: 212,
        flexShrink: 0,
        backgroundColor: "#0B1929",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}>

        {/* Logo */}
        <div style={{
          padding: "22px 20px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#D7B87A",
              boxShadow: "0 0 6px rgba(215,184,122,0.5)",
              flexShrink: 0,
            }} />
            <p style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 12, letterSpacing: "0.05em", margin: 0 }}>
              FANOMETRIX PULSE
            </p>
          </div>
          <p style={{ color: "rgba(215,184,122,0.45)", fontSize: 9.5, marginTop: 3, letterSpacing: "0.08em" }}>
            THE FOOTBALL COLLECTIVE
          </p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ href, label, icon }) => {
            const active = path === href || (href !== "/" && path.startsWith(href));
            return (
              <Link key={href} href={href} style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 11px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: active ? 600 : 400,
                letterSpacing: active ? "0.01em" : 0,
                textDecoration: "none",
                color: active ? "#D7B87A" : "rgba(255,255,255,0.6)",
                backgroundColor: active ? "rgba(215,184,122,0.1)" : "transparent",
                borderLeft: active ? "2px solid #D7B87A" : "2px solid transparent",
                transition: "all 0.12s",
              }}>
                <span style={{ fontSize: 11, width: 14, textAlign: "center", opacity: active ? 1 : 0.65 }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{
          padding: "10px 10px 18px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}>
          {[
            { href: "/privacy",         label: "ⓘ  Privacy" },
            { href: "/publisher-guide", label: "☰  Publisher Guide" },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{
              display: "block",
              padding: "6px 11px",
              borderRadius: 6,
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              textDecoration: "none",
              transition: "color 0.12s",
            }}>
              {label}
            </Link>
          ))}
        </div>
      </aside>

      {/* ── Main workspace (light) ──────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0, backgroundColor: "#F7F6F2" }}>
        {children}
      </main>
    </div>
  );
}
