/**
 * Shared navigation configuration — single source of truth.
 *
 * Left sidebar structure (admin):
 *   HOME            → Home, Dashboard
 *   SURVEYS         → Surveys, Campaigns, Campaign Groups, Deployment
 *   SOCIAL LISTENING→ Dashboard, Searches, Mentions, Reports, Settings
 *   DEVELOPER       → alphabetical list of admin tools
 */
import type { UserRole } from "@/lib/auth";

export type NavSection = "home" | "platform" | "social-listening" | "developer-tool";
export type NavGroup   = "home" | "surveys" | "social-listening" | "developer" | "footer";

export interface NavItemConfig {
  href:        string;
  label:       string;
  icon:        string;
  description: string;
  cta:         string;
  roles:       UserRole[];
  section?:    NavSection;
  navGroup?:   NavGroup;
  external?:   boolean;
}

export const NAV_ITEMS: NavItemConfig[] = [

  // ── SURVEYS ───────────────────────────────────────────────────────────────
  // Dashboard repeated at the top of the Surveys section so it's accessible
  // in context when working across the survey workflow.
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "▦",
    description: "Live fan response data, KPI cards, trend charts and audience breakdowns.",
    cta: "Open Dashboard",
    roles: ["admin"],
    navGroup: "surveys",
    section: "platform",
  },
  {
    href: "/survey-templates",
    label: "Surveys",
    icon: "◫",
    description: "Create and manage reusable survey templates for fan campaigns.",
    cta: "Manage Surveys",
    section: "platform",
    roles: ["admin"],
    navGroup: "surveys",
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: "◎",
    description: "Set up campaigns, assign surveys to publishers and control live status.",
    cta: "View Campaigns",
    section: "platform",
    roles: ["admin"],
    navGroup: "surveys",
  },
  {
    href: "/campaign-groups",
    label: "Campaign Groups",
    icon: "⬡",
    description: "Bundle multiple campaigns into one embed code for publisher rotation.",
    cta: "View Campaign Groups",
    section: "platform",
    roles: ["admin"],
    navGroup: "surveys",
  },
  {
    href: "/campaign-deployment",
    label: "Deployment",
    icon: "</>",
    description: "Generate embed codes and ad-server tags to deploy surveys in creative units.",
    cta: "Deploy Campaign",
    section: "platform",
    roles: ["admin"],
    navGroup: "surveys",
  },

  // ── SOCIAL LISTENING ──────────────────────────────────────────────────────
  {
    href: "/social-listening/dashboard",
    label: "Dashboard",
    icon: "▦",
    description: "Overview of listening activity, sentiment trends and top topics.",
    cta: "Open SL Dashboard",
    section: "social-listening",
    roles: ["admin"],
    navGroup: "social-listening",
  },
  {
    href: "/social-listening/searches",
    label: "Searches",
    icon: "◎",
    description: "Create and manage listening searches — define keywords, markets and platforms.",
    cta: "Manage Searches",
    section: "social-listening",
    roles: ["admin"],
    navGroup: "social-listening",
  },
  {
    href: "/social-listening/mentions",
    label: "Mentions",
    icon: "◫",
    description: "Browse and filter collected mentions with sentiment and topic classification.",
    cta: "View Mentions",
    section: "social-listening",
    roles: ["admin"],
    navGroup: "social-listening",
  },
  {
    href: "/social-listening/reports",
    label: "Reports",
    icon: "↗",
    description: "Generate summaries, trend reports and emerging theme highlights.",
    cta: "View Reports",
    section: "social-listening",
    roles: ["admin"],
    navGroup: "social-listening",
  },
  {
    href: "/social-listening/settings",
    label: "Settings",
    icon: "⚗",
    description: "Configure data sources, refresh intervals and retention policies.",
    cta: "Configure",
    section: "social-listening",
    roles: ["admin"],
    navGroup: "social-listening",
  },

  // ── DEVELOPER (alphabetical) ──────────────────────────────────────────────
  {
    href: "/creative-lab/theme-gallery",
    label: "Creative Lab",
    icon: "◈",
    description: "Interactive survey creative gallery — compare themes, typography and interaction patterns with publishers.",
    cta: "Open Creative Lab",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/access-requests",
    label: "Access Requests",
    icon: "◫",
    description: "Review and action inbound access requests from the public homepage form.",
    cta: "View Requests",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/demo-data",
    label: "Demo Data",
    icon: "⚗",
    description: "Generate and manage realistic demo responses for testing and presentations.",
    cta: "Manage Demo Data",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/embed-test",
    label: "Embed Test",
    icon: "⬡",
    description: "Verify that a campaign embed is loading and accepting responses correctly.",
    cta: "Open Embed Test",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/looker-templates",
    label: "Looker Templates",
    icon: "◈",
    description: "Pre-built Looker Studio report templates for client-ready dashboards.",
    cta: "View Templates",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/publishers",
    label: "Publishers",
    icon: "◎",
    description: "Manage the list of publishers available for campaign assignment and user access control.",
    cta: "Manage Publishers",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/reporting",
    label: "Reporting",
    icon: "↗",
    description: "Reporting API settings, Looker Studio connection and data integration config.",
    cta: "Open Reporting",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/admin-insights",
    label: "Insights",
    icon: "◈",
    description: "Create and manage insight content — reports, analyses and intelligence with audience access control.",
    cta: "Manage Insights",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/user-management",
    label: "User Management",
    icon: "◉",
    description: "Create and manage platform accounts, access rights and publisher permissions.",
    cta: "Manage Users",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },
  {
    href: "/social-listening/validation",
    label: "Validation",
    icon: "◈",
    description: "Review AI classification accuracy, distribution quality and manage synthetic datasets.",
    cta: "Open Validation",
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "developer",
  },

  // ── Footer links ──────────────────────────────────────────────────────────
  {
    href: "/publisher-hub",
    label: "Publisher Hub",
    icon: "☰",
    description: "Integration documentation, privacy information and technical resources for publishers.",
    cta: "View Publisher Hub",
    section: "developer-tool",
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
    section: "developer-tool",
    roles: ["admin"],
    navGroup: "footer",
    external: true,
  },

  // ── Publisher — Dashboard in home group ──────────────────────────────────
  // Brand and Agency: Insights only at this stage.
  // Publisher: Dashboard + Publisher Performance only.
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "▦",
    description: "Live fan response data, KPI cards, trend charts and audience breakdowns.",
    cta: "Open Dashboard",
    roles: ["publisher"],
    navGroup: "home",
    section: "home",
  },
  {
    href: "/insights",
    label: "Insights",
    icon: "◈",
    description: "Reports, market analyses and intelligence published for your organisation.",
    cta: "View Insights",
    roles: ["brand", "agency", "publisher"],
    navGroup: "home",
  },

  // ── Publisher ─────────────────────────────────────────────────────────────
  {
    href: "/publisher-performance",
    label: "Publisher Performance",
    icon: "◉",
    description: "Audience reach, response rates and engagement metrics for your platforms.",
    cta: "View Performance",
    roles: ["publisher"],
    navGroup: "home",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sidebar sections for admin — used by AdminShell to render labelled groups */
export const ADMIN_SIDEBAR_SECTIONS: { heading: string; group: NavGroup }[] = [
  { heading: "Surveys",          group: "surveys"          },
  { heading: "Social Listening", group: "social-listening" },
];

/** Items for the left sidebar HOME section (shown to all roles) */
export function getHomeNavItems(role: UserRole): NavItemConfig[] {
  return NAV_ITEMS.filter(
    item => item.roles.includes(role) && item.navGroup === "home"
  );
}

/** Items for a specific nav group */
export function getNavGroupItems(group: NavGroup): NavItemConfig[] {
  return NAV_ITEMS.filter(item => item.navGroup === group);
}

/** Developer section — alphabetically sorted, admin only */
export function getDeveloperNavItems(): NavItemConfig[] {
  return NAV_ITEMS
    .filter(item => item.navGroup === "developer")
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Items shown as footer links in the sidebar */
export function getFooterNavItems(role: UserRole): NavItemConfig[] {
  return NAV_ITEMS.filter(
    item => item.roles.includes(role) && item.navGroup === "footer"
  );
}

/** Backward-compat: main nav items (used by publisher/brand/agency sidebar) */
export function getMainNavItems(role: UserRole): NavItemConfig[] {
  return NAV_ITEMS.filter(
    item => item.roles.includes(role) && item.navGroup === "home"
  );
}

/** Homepage card sections for a given role */
export function getHomeSections(role: UserRole): { label: string; items: NavItemConfig[] }[] {
  if (role !== "admin") {
    const items = NAV_ITEMS.filter(
      item => item.roles.includes(role) && item.navGroup === "home"
    );
    return [{ label: "", items }];
  }

  return [
    {
      label: "Platform Management",
      items: NAV_ITEMS.filter(item => item.navGroup === "surveys"),
    },
    {
      label: "Social Listening",
      items: NAV_ITEMS.filter(item => item.navGroup === "social-listening"),
    },
    {
      label: "Administration",
      items: NAV_ITEMS.filter(item => item.navGroup === "developer"),
    },
  ];
}
