"use client";

import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import type { UserRole } from "@/lib/auth";

type Card = {
  href: string;
  icon: string;
  title: string;
  description: string;
  cta: string;
};

const ROLE_CARDS: Record<UserRole, Card[]> = {
  admin: [
    { href: "/dashboard",           icon: "▦",  title: "Dashboard",           description: "Live fan response data, KPI cards, trend charts and audience breakdowns.", cta: "Open Dashboard" },
    { href: "/survey-templates",    icon: "◫",  title: "Survey Templates",    description: "Create and manage question sets for fan surveys across campaigns.", cta: "Manage Surveys" },
    { href: "/campaigns",           icon: "◎",  title: "Campaigns",           description: "Set up and configure campaigns, assign surveys and manage publishers.", cta: "View Campaigns" },
    { href: "/campaign-deployment", icon: "</>",title: "Campaign Deployment",  description: "Generate embed codes and ad-server tags to deploy surveys in creative units.", cta: "Deploy Campaign" },
    { href: "/reporting",           icon: "↗",  title: "Reporting",           description: "Reporting API settings and data integration configuration.", cta: "Open Reporting" },
    { href: "/looker-templates",    icon: "◈",  title: "Looker Templates",    description: "Pre-built Looker Studio report templates for client-ready dashboards.", cta: "View Templates" },
    { href: "/demo-data",           icon: "⚗",  title: "Demo Data",           description: "Generate and manage realistic demo fan responses for testing and presentations.", cta: "Manage Demo Data" },
    { href: "/user-management",     icon: "◉",  title: "User Management",     description: "Create and manage platform user accounts, roles and data access permissions.", cta: "Manage Users" },
    { href: "/publisher-hub",        icon: "☰",  title: "Publisher Hub",        description: "Integration documentation, privacy information and technical resources for publishers.", cta: "View Publisher Hub" },
    { href: "/embed-test",           icon: "⬡",  title: "Embed Test",           description: "Verify that a campaign embed is loading and accepting responses correctly.", cta: "Open Embed Test" },
  ],
  brand: [
    { href: "/dashboard",        icon: "▦", title: "Dashboard",        description: "Your campaign performance — fan response data filtered to your brand.", cta: "Open Dashboard" },
    { href: "/campaign-reports", icon: "↗", title: "Campaign Reports",  description: "Detailed reports for your active and completed fan survey campaigns.", cta: "View Reports" },
    { href: "/exports",          icon: "⬇", title: "Exports",           description: "Download fan data and campaign results as CSV for your own analysis.", cta: "Export Data" },
    { href: "/insights",         icon: "◈", title: "Insights",          description: "AI-assisted insights and audience summaries from your campaign results.", cta: "View Insights" },
  ],
  agency: [
    { href: "/dashboard",            icon: "▦", title: "Dashboard",            description: "Cross-campaign performance for your managed brand portfolio.", cta: "Open Dashboard" },
    { href: "/campaign-reports",     icon: "↗", title: "Campaign Reports",     description: "Detailed reports for all campaigns assigned to your agency.", cta: "View Reports" },
    { href: "/publisher-performance",icon: "◉", title: "Publisher Performance","description": "Publisher-level reach and engagement data across your campaigns.", cta: "View Performance" },
    { href: "/exports",              icon: "⬇", title: "Exports",              description: "Download fan data and campaign results as CSV for client reporting.", cta: "Export Data" },
  ],
  publisher: [
    { href: "/dashboard",             icon: "▦", title: "Dashboard",             description: "Fan response data from surveys delivered across your properties.", cta: "Open Dashboard" },
    { href: "/publisher-performance", icon: "◉", title: "Publisher Performance", description: "Audience reach, response rates and engagement metrics for your platforms.", cta: "View Performance" },
  ],
};

export default function HomePage() {
  const { user, loading } = useSession();

  const role = (user?.role ?? "brand") as UserRole;
  const cards = ROLE_CARDS[role] ?? ROLE_CARDS.brand;

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Welcome header */}
        <div className="mb-8">
          {loading ? (
            <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse mb-2" />
          ) : (
            <h1 className="text-2xl font-bold mb-1" style={{ color: "#0B1929" }}>
              Welcome back{user ? `, ${user.organisationName || user.username}` : ""}.
            </h1>
          )}
          {user && (
            <p className="text-sm text-gray-400 mt-0.5">
              {user.username} · <span className="capitalize">{user.role}</span>
            </p>
          )}
        </div>

        {/* Card grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
                <div className="h-8 w-8 bg-gray-100 rounded mb-4" />
                <div className="h-5 w-32 bg-gray-100 rounded mb-2" />
                <div className="h-3 w-full bg-gray-100 rounded mb-1" />
                <div className="h-3 w-3/4 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map(({ href, icon, title, description, cta }) => (
              /*
                Entire card is the link — no nested <a> elements.
                group cascades hover state to all children.
                focus-visible ring makes keyboard navigation clear.
                active:scale gives tactile feedback on touch devices.
              */
              <Link
                key={href}
                href={href}
                className={[
                  // Layout
                  "group flex flex-col p-6 rounded-xl border cursor-pointer",
                  // Default appearance
                  "bg-white border-gray-100 shadow-sm",
                  // Smooth transition on all animated properties
                  "transition-all duration-200",
                  // Hover: navy fill, lift, deeper shadow
                  "hover:bg-[#0B1929] hover:border-[#0B1929] hover:-translate-y-1 hover:shadow-lg",
                  // Touch feedback
                  "active:scale-[0.98] active:shadow-sm",
                  // Keyboard focus ring (only visible ring, not mouse)
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] focus-visible:ring-offset-2",
                ].join(" ")}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-4 flex-shrink-0
                  bg-[#F0F4F8] text-[#0B1929]
                  group-hover:bg-white/10 group-hover:text-white
                  transition-colors duration-200">
                  {icon}
                </div>

                {/* Title */}
                <h2 className="font-semibold text-base mb-2
                  text-[#0B1929] group-hover:text-white
                  transition-colors duration-200">
                  {title}
                </h2>

                {/* Description */}
                <p className="text-sm flex-1 leading-relaxed mb-5
                  text-gray-400 group-hover:text-white/70
                  transition-colors duration-200">
                  {description}
                </p>

                {/* CTA — visual only; parent Link handles navigation */}
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#D7B87A]">
                  {cta} <span className="text-xs">→</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
