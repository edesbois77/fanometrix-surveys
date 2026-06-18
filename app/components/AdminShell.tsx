"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard",       label: "Dashboard",       icon: "▦"  },
  { href: "/surveys",         label: "Surveys",         icon: "◫"  },
  { href: "/campaigns",       label: "Campaigns",       icon: "◎"  },
  { href: "/embed-generator", label: "Embed Generator", icon: "</>" },
  { href: "/reporting",       label: "Reporting",       icon: "↗"  },
  { href: "/demo-data",       label: "Demo Data",        icon: "⚗"  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-indigo-950 flex flex-col">
        <div className="px-5 py-5 border-b border-indigo-800">
          <p className="text-white font-bold text-sm tracking-wide">Fanometrix Pulse</p>
          <p className="text-indigo-400 text-xs mt-0.5">Fan Insight Platform</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-700 text-white"
                    : "text-indigo-300 hover:bg-indigo-800 hover:text-white"
                }`}>
                <span className="text-xs w-4 text-center">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-indigo-800 space-y-1">
          <Link href="/privacy"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-indigo-400 hover:text-indigo-200 hover:bg-indigo-900 transition-colors">
            ⓘ Privacy Policy
          </Link>
          <Link href="/publisher-guide"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-indigo-400 hover:text-indigo-200 hover:bg-indigo-900 transition-colors">
            ☰ Publisher Guide
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
