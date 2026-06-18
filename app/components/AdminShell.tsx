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
    <div className="flex min-h-screen">

      {/* Sidebar */}
      <aside style={{
        width: 212,
        flexShrink: 0,
        backgroundColor: "#07121D",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(215,184,122,0.1)",
      }}>

        {/* Logo */}
        <div style={{
          padding: "24px 20px 20px",
          borderBottom: "1px solid rgba(215,184,122,0.1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#D7B87A",
              boxShadow: "0 0 8px rgba(215,184,122,0.6)",
            }} />
            <p style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13, letterSpacing: "0.04em" }}>
              FANOMETRIX PULSE
            </p>
          </div>
          <p style={{ color: "rgba(215,184,122,0.55)", fontSize: 10, marginTop: 4, letterSpacing: "0.08em" }}>
            THE FOOTBALL COLLECTIVE
          </p>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ href, label, icon }) => {
            const active = path === href || (href !== "/" && path.startsWith(href + "/")) || path.startsWith(href);
            return (
              <Link key={href} href={href} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.02em",
                textDecoration: "none",
                color: active ? "#D7B87A" : "rgba(224,225,221,0.65)",
                backgroundColor: active ? "rgba(215,184,122,0.07)" : "transparent",
                borderLeft: active ? "2px solid #D7B87A" : "2px solid transparent",
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 11, opacity: active ? 1 : 0.7, width: 14, textAlign: "center" }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer links */}
        <div style={{
          padding: "12px 10px 20px",
          borderTop: "1px solid rgba(215,184,122,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}>
          {[
            { href: "/privacy",          label: "ⓘ  Privacy Policy"   },
            { href: "/publisher-guide",  label: "☰  Publisher Guide"  },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{
              display: "block",
              padding: "7px 12px",
              borderRadius: 6,
              fontSize: 11,
              color: "rgba(215,184,122,0.45)",
              textDecoration: "none",
              letterSpacing: "0.02em",
              transition: "color 0.15s",
            }}>
              {label}
            </Link>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
