/**
 * Shared navigation configuration.
 *
 * Single source of truth for all navigation items. Changes here automatically
 * propagate to both the left sidebar (AdminShell) and the homepage card grid.
 *
 * To add a new item:
 *   1. Add an entry to NAV_ITEMS below.
 *   2. Set the correct `roles`, `section`, and `navGroup`.
 *   3. It will appear in the left nav AND the homepage for those roles.
 */
import type { UserRole } from "@/lib/auth";

export type NavSection  = "platform" | "administration" | "development";
export type NavGroup    = "main" | "developer" | "footer";

export interface NavItemConfig {
  href:        string;
  label:       string;       // Left-nav label and card title
  icon:        string;       // Icon character used in both nav and card
  description: string;       // Homepage card description
  cta:         string;       // Homepage card CTA text
  roles:       UserRole[];   // Which roles can see this item
  section?:    NavSection;   // Homepage section group (admin items only)
  navGroup?:   NavGroup;     // Left-nav placement: main, developer, footer
  external?:   boolean;      // Open in new tab
}

export const NAV_ITEMS: NavItemConfig[] = [

  // ── Dashboard ─────────────────────────────────────────────────────────────
  // Shown in the left nav for every role. Admin gets it via the KPI CTA instead
  // of a homepage card; other roles get it as their first card.
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "▦",
    description: "Live fan response data, KPI cards, trend charts and audience breakdowns.",
    cta: "Open Dashboard",
    roles: ["admin", "brand", "agency", "publisher"],
    navGroup: "main",
  },

  // ── Admin: Platform Management ────────────────────────────────────────────
  {
    href: "/survey-templates",
    label: "Surveys",
    icon: "◫",
    description: "Create and manage reusable survey templates for fan campaigns.",
    cta: "Manage Surveys",
    section: "platform",
    roles: ["admin"],
    navGroup: "main",
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: "◎",
    description: "Set up campaigns, assign surveys to publishers and control live status.",
    cta: "View Campaigns",
    section: "platform",
    roles: ["admin"],
    navGroup: "main",
  },
  {
    href: "/campaign-groups",
    label: "Campaign Groups",
    icon: "⬡",
    description: "Bundle multiple campaigns into one embed code for publisher rotation.",
    cta: "View Campaign Groups",
    section: "platform",
    roles: ["admin"],
    navGroup: "main",
  },
  {
    href: "/campaign-deployment",
    label: "Deployment",
    icon: "</>",
    description: "Generate embed codes and ad-server tags to deploy surveys in creative units.",
    cta: "Deploy Campaign",
    section: "platform",
    roles: ["admin"],
    navGroup: "main",
  },

  // ── Admin: Administration ─────────────────────────────────────────────────
  {
    href: "/access-requests",
    label: "Access Requests",
    icon: "◫",
    description: "Review and action inbound access requests from the public homepage form.",
    cta: "View Requests",
    section: "administration",
    roles: ["admin"],
    navGroup: "main",
  },
  {
    href: "/user-management",
    label: "User Management",
    icon: "◉",
    description: "Create and manage platform accounts, access rights and publisher permissions.",
    cta: "Manage Users",
    section: "administration",
    roles: ["admin"],
    navGroup: "main",
  },
  {
    href: "/publishers",
    label: "Publishers",
    icon: "◎",
    description: "Manage the list of publishers available for campaign assignment and user access control.",
    cta: "Manage Publishers",
    section: "administration",
    roles: ["admin"],
    navGroup: "main",
  },
  {
    href: "/embed-test",
    label: "Embed Test",
    icon: "⬡",
    description: "Verify that a campaign embed is loading and accepting responses correctly.",
    cta: "Open Embed Test",
    section: "administration",
    roles: ["admin"],
    navGroup: "main",
  },
  {
    href: "/publisher-hub",
    label: "Publisher Hub",
    icon: "☰",
    description: "Integration documentation, privacy information and technical resources for publishers.",
    cta: "View Publisher Hub",
    section: "administration",
    roles: ["admin"],
    navGroup: "footer",
    external: true,
  },
  {
    href: "/fanometrix-guide",
    label: "Fanometrix Guide",
    icon: "◫",
    description: "Step-by-step platform documentation auto-synced with the live codebase.",
    cta: "Open Guide",
    section: "administration",
    roles: ["admin"],
    navGroup: "footer",
    external: true,
  },

  // ── Admin: Development ────────────────────────────────────────────────────
  {
    href: "/reporting",
    label: "Reporting",
    icon: "↗",
    description: "Reporting API settings, Looker Studio connection and data integration config.",
    cta: "Open Reporting",
    section: "development",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/looker-templates",
    label: "Looker Templates",
    icon: "◈",
    description: "Pre-built Looker Studio report templates for client-ready dashboards.",
    cta: "View Templates",
    section: "development",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/demo-data",
    label: "Demo Data",
    icon: "⚗",
    description: "Generate and manage realistic demo responses for testing and presentations.",
    cta: "Manage Demo Data",
    section: "development",
    roles: ["admin"],
    navGroup: "developer",
  },

  // ── Brand ─────────────────────────────────────────────────────────────────
  {
    href: "/campaign-reports",
    label: "Campaign Reports",
    icon: "↗",
    description: "Detailed reports for your active and completed fan survey campaigns.",
    cta: "View Reports",
    roles: ["brand", "agency"],
    navGroup: "main",
  },
  {
    href: "/exports",
    label: "Exports",
    icon: "⬇",
    description: "Download fan data and campaign results as CSV for your own analysis.",
    cta: "Export Data",
    roles: ["brand", "agency"],
    navGroup: "main",
  },
  {
    href: "/insights",
    label: "Insights",
    icon: "◈",
    description: "AI-assisted insights and audience summaries from your campaign results.",
    cta: "View Insights",
    roles: ["brand"],
    navGroup: "main",
  },

  // ── Agency / Publisher ────────────────────────────────────────────────────
  {
    href: "/publisher-performance",
    label: "Publisher Performance",
    icon: "◉",
    description: "Audience reach, response rates and engagement metrics for your platforms.",
    cta: "View Performance",
    roles: ["agency", "publisher"],
    navGroup: "main",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Items that appear in the left sidebar main nav for a given role */
export function getMainNavItems(role: UserRole): NavItemConfig[] {
  return NAV_ITEMS.filter(
    item => item.roles.includes(role) && item.navGroup === "main"
  );
}

/** Items that go in the collapsible Developer section (admin only) */
export function getDeveloperNavItems(): NavItemConfig[] {
  return NAV_ITEMS.filter(item => item.navGroup === "developer");
}

/** Items shown as footer links in the sidebar (admin only) */
export function getFooterNavItems(role: UserRole): NavItemConfig[] {
  return NAV_ITEMS.filter(
    item => item.roles.includes(role) && item.navGroup === "footer"
  );
}

/** Homepage card sections for a given role */
export function getHomeSections(role: UserRole): {
  label: string;
  items: NavItemConfig[];
}[] {
  if (role !== "admin") {
    // Non-admin: flat list, no sections
    const items = NAV_ITEMS.filter(
      item => item.roles.includes(role) && item.navGroup === "main"
    );
    return [{ label: "", items }];
  }

  return [
    {
      label: "Platform Management",
      items: NAV_ITEMS.filter(
        item => item.roles.includes("admin") && item.section === "platform"
      ),
    },
    {
      label: "Administration",
      items: NAV_ITEMS.filter(
        item => item.roles.includes("admin") && item.section === "administration"
      ),
    },
    {
      label: "Development",
      items: NAV_ITEMS.filter(
        item => item.roles.includes("admin") && item.section === "development"
      ),
    },
  ];
}
