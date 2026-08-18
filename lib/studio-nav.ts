/**
 * Survey Studio — product & sidebar navigation configuration.
 *
 * DELIBERATELY SEPARATE from lib/nav-config.ts. The legacy application's flat,
 * role-filtered NAV_ITEMS registry drives AdminShell and the old /home; this
 * file drives ONLY the new Fanometrix product shell (GlobalShell product
 * switcher + Survey Studio product sidebar). Keeping the two loosely coupled
 * during the transition means the new shell can evolve its own product tier
 * without reshaping the legacy nav (which still powers ~70 AdminShell pages).
 * They can be consolidated later if there is a genuine benefit.
 *
 * Permission model: reuse the existing session role (useSession().role). Each
 * destination may declare `roles`; when omitted it is visible to everyone. The
 * eventual rule is "if the user cannot use a destination, OMIT it" (never render
 * it disabled) — visibleStudioNav() enforces exactly that. For Phase 1 the five
 * Survey Studio destinations carry no `roles`, so every authenticated user
 * (including the admin doing the shell review) sees all five; real permission
 * mappings can be dropped in here later without touching any component.
 */
import type { UserRole } from "@/lib/auth";
import type { StudioIconName } from "@/app/components/studio/studio-icons";

// ── Products (Level 1 — global product switcher) ─────────────────────────────
// Survey Studio is the first real Fanometrix product. Future real products
// (Documents, Research Projects, the replacement for Conversations, …) will be
// added to the non-legacy list above Archive / Legacy as they ship — the
// switcher renders them under the "Products" group.
//
// "Archive / Legacy" is NOT a product: it is the entry point back into the
// entire existing application (it navigates to the untouched /home). It is
// marked `legacy` so the switcher renders it in a separate, visually secondary
// group below the real products, never mixed in among them.
export interface ProductConfig {
  key:         string;
  label:       string;
  href:        string;
  description: string;
  icon:        StudioIconName;
  /** Marks the existing app so the switcher can style it as secondary. */
  legacy?:     boolean;
}

export const PRODUCTS: ProductConfig[] = [
  {
    key: "survey-studio",
    label: "Survey Studio",
    href: "/survey-studio",
    description: "Create, request, discover and manage fan research.",
    icon: "studio",
  },
  {
    key: "legacy",
    label: "Archive / Legacy",
    href: "/home",
    description: "The existing Fanometrix application — every current area, unchanged.",
    icon: "archive",
    legacy: true,
  },
];

export const CURRENT_PRODUCT_KEY = "survey-studio";

// ── Survey Studio sidebar (Level 2 — product navigation) ─────────────────────
// A single, flat primary level. It must NOT expand into nested navigation:
// lower-level navigation (Create's About | Creative | Survey | Campaigns |
// Deploy) belongs inside the white workspace, beneath the page title — never
// as children revealed under a sidebar item.
export interface StudioNavItem {
  key:         string;
  label:       string;
  href:        string;
  icon:        StudioIconName;
  description: string;
  /** Omit → visible to all roles. Present → visible only to these roles. */
  roles?:      UserRole[];
}

export const STUDIO_NAV: StudioNavItem[] = [
  { key: "home",     label: "Home",     href: "/survey-studio",          icon: "home",     description: "Your Survey Studio overview." },
  { key: "create",   label: "Create",   href: "/survey-studio/create",   icon: "create",   description: "Build a survey, creative and campaign." },
  { key: "request",  label: "Request",  href: "/survey-studio/request",  icon: "request",  description: "Commission research from Fanometrix." },
  { key: "discover", label: "Discover", href: "/survey-studio/discover", icon: "discover", description: "Findings, reports and completed intelligence." },
  { key: "manage",   label: "Manage",   href: "/survey-studio/manage",   icon: "manage",   description: "Live surveys, campaigns and deployments." },
];

/** The Survey Studio destinations this role may use — inaccessible ones omitted. */
export function visibleStudioNav(role: UserRole | null | undefined): StudioNavItem[] {
  return STUDIO_NAV.filter(item => !item.roles || (role != null && item.roles.includes(role)));
}

/**
 * Active sidebar key for a pathname. Home matches ONLY the exact base so a
 * sub-route (/survey-studio/create) highlights Create, not Home; the others
 * match their segment prefix.
 */
export function activeStudioKey(pathname: string): string {
  const base = "/survey-studio";
  if (pathname === base || pathname === `${base}/`) return "home";
  const rest = pathname.startsWith(base) ? pathname.slice(base.length + 1) : "";
  const seg = rest.split("/").filter(Boolean)[0] ?? "home";
  return STUDIO_NAV.find(i => i.key === seg)?.key ?? "home";
}
