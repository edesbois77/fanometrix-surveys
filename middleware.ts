import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// ── Domain constants (resolved at Edge runtime) ───────────────────────────────
const MARKETING_ORIGIN = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://fanometrix-surveys.vercel.app";
const APP_ORIGIN       = process.env.NEXT_PUBLIC_APP_URL       ?? "https://fanometrix-surveys.vercel.app";

// Paths served exclusively on surveys.fanometrix.com
const SURVEYS_ALLOWED_PREFIXES = [
  "/embed", "/privacy", "/api/embed", "/api/submit", "/api/reporting", "/api/events",
];

// Exact paths that require no authentication (platform / app domain)
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/request-access",
  "/privacy",
  "/publisher-hub",
  "/publisher-guide",
  "/fanometrix-guide",
  "/for-publishers",
  "/survey",
  "/embed",
  "/access-denied",
  "/trust/responsible-reddit-data",
]);

// API paths excluded from the normal user-SESSION auth below. "Public" here
// means "not gated by a browser session" — NOT "unauthenticated". Machine-to-
// machine routes on this list (e.g. /api/cron) enforce their own credential
// check inside the handler:
//   • /api/cron — the pg_cron worker; validates a CRON_SECRET bearer token
//     (see app/api/cron/jobs/tick/route.ts + lib/jobs/cron-auth.ts). It has no
//     user session, so the session gate would 401 it before it could run; it
//     must bypass that gate but is never callable without the secret.
// "/api/reports" is the partner Audience Intelligence Report's own API (unlock
// + CSV downloads). It has no platform session — the recipient is a publisher
// contact, not a Fanometrix user — and enforces its own per-report password
// challenge inside each handler (lib/reports/access.ts). Same pattern as
// /api/cron: exempt from the session gate, never callable without its own
// credential.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/submit", "/api/reporting", "/api/embed", "/api/access-requests", "/api/publisher", "/api/dashboard", "/api/events", "/api/cron", "/api/reports"];

// Routes restricted to brand/agency (not accessible at this stage — redirect to /insights)
const BRAND_AGENCY_RESTRICTED = [
  "/dashboard",
  "/campaign-reports",
  "/exports",
  "/publisher-performance",
];

// Routes visible to admin/brand/agency/publisher, gated further below —
// kept empty for now, but retained as the extension point if another role
// needs excluding from a currently-shared route in future.
const PUBLISHER_RESTRICTED: string[] = [];

// Routes open to admin and publisher only (not brand/agency) — Campaigns
// and Campaign Groups are creation/management tools. Publisher accounts
// create and manage their own here, scoped server-side to their own
// organisation (see lib/access.ts); brand/agency continue to work through
// Insights/Dashboard instead, unchanged.
const ADMIN_AND_PUBLISHER_PREFIXES = [
  "/campaigns",
  "/campaign-groups",
  "/api/campaign-groups",
  "/survey-templates",
  "/api/surveys",
];

// Routes only admins may access
const ADMIN_ONLY_PREFIXES = [
  "/analysis",
  "/campaign-deployment",
  "/reporting",
  "/looker-templates",
  "/demo-data",
  "/access-requests",
  "/social-listening",
  "/api/social/validation",
  "/api/social/insights",
  "/api/social/export",
  "/api/social/seed",
  "/api/social/mentions",
  "/user-management",
  "/organisations",
  "/embed-test",
  "/admin-insights",
  "/api/users",
  "/api/admin",
  "/api/social",
  "/api/demo",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";
  // API requests must never be answered with an HTML redirect (to /login,
  // /access-denied, …) — a fetch() follows the redirect and the client's
  // res.json() then chokes on the HTML page ("Unexpected token '<'"). API
  // paths get a JSON 401/403 instead, so an expired session surfaces cleanly.
  const isApi = pathname.startsWith("/api/");

  // ── Hostname-based routing ──────────────────────────────────────────────────

  // www → canonical marketing domain (permanent redirect)
  if (hostname === "www.fanometrix.com") {
    return NextResponse.redirect(`${MARKETING_ORIGIN}${pathname}`, 301);
  }

  // surveys.fanometrix.com — only serve embed + privacy + their APIs
  if (hostname === "surveys.fanometrix.com") {
    const isSurveysPath =
      SURVEYS_ALLOWED_PREFIXES.some(p => pathname.startsWith(p)) ||
      /^\/[a-z]{2}\/privacy$/.test(pathname);

    if (!isSurveysPath) {
      // Root or anything unknown → redirect to marketing site
      return NextResponse.redirect(`${MARKETING_ORIGIN}`, 302);
    }
    return NextResponse.next();
  }

  // fanometrix.com (marketing) — /login should go to the app domain
  if (hostname === "fanometrix.com") {
    if (pathname === "/login") {
      return NextResponse.redirect(`${APP_ORIGIN}/login`, 301);
    }
    // Admin routes accessed on the marketing domain → redirect to app
    if (
      ADMIN_ONLY_PREFIXES.some(p => pathname.startsWith(p)) ||
      ADMIN_AND_PUBLISHER_PREFIXES.some(p => pathname.startsWith(p)) ||
      pathname.startsWith("/research-projects") ||
      pathname.startsWith("/home") ||
      pathname.startsWith("/dashboard")
    ) {
      return NextResponse.redirect(`${APP_ORIGIN}${pathname}`, 302);
    }
    // All other marketing paths (/, /request-access, /privacy, etc.) → serve normally
    return NextResponse.next();
  }

  // app.fanometrix.com — root / → redirect based on auth state
  if (hostname === "app.fanometrix.com" && pathname === "/") {
    const session = await getSession(req);
    return NextResponse.redirect(
      new URL(session ? "/home" : "/login", req.url)
    );
  }

  // ── Existing platform auth logic (app domain + Vercel fallback) ────────────

  // Pass static assets through immediately
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/public/") ||
    /\.(png|jpg|jpeg|svg|ico|gif|webp|woff2?|ttf|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Public API paths — pass through without auth
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Localised privacy pages — /en/privacy, /de/privacy, /fr/privacy, etc.
  if (/^\/[a-z]{2}\/privacy$/.test(pathname)) {
    return NextResponse.next();
  }

  // Partner Audience Intelligence Reports. These are read by publisher contacts
  // who have no Fanometrix account, so the platform session gate must not stand
  // in front of them; the route enforces its own per-report password instead
  // (app/reports/[org]/[report]/page.tsx). The X-Robots-Tag is belt-and-braces
  // alongside the route's own noindex metadata and the robots.txt disallow:
  // these reports carry a partner's commercial performance and must never be
  // indexed, cached or snippeted by anything.
  if (pathname.startsWith("/reports")) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
    return res;
  }

  // Public pages — only special-case /login to redirect logged-in users
  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login") {
      const session = await getSession(req);
      if (session) {
        return NextResponse.redirect(new URL("/home", req.url));
      }
    }
    return NextResponse.next();
  }

  // Everything else requires a valid session
  const session = await getSession(req);
  if (!session) {
    if (isApi) return NextResponse.json({ error: "Unauthorised — your session may have expired. Please sign in again." }, { status: 401 });
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Force password change — gate all protected routes until the user sets a new password
  if (session.forcePasswordChange && pathname !== "/change-password") {
    if (isApi) return NextResponse.json({ error: "Password change required before continuing." }, { status: 403 });
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Brand/Agency: send /home → /insights and block restricted routes
  if (session.role === "brand" || session.role === "agency") {
    if (pathname === "/home") {
      return NextResponse.redirect(new URL("/insights", req.url));
    }
    if (BRAND_AGENCY_RESTRICTED.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/insights", req.url));
    }
  }

  // Admin-only routes
  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminOnly && session.role !== "admin") {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }

  // Admin + Publisher only routes (Campaigns, Campaign Groups) — brand/agency
  // stay blocked here, same as they always were when these were admin-only.
  const isAdminAndPublisherOnly = ADMIN_AND_PUBLISHER_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminAndPublisherOnly && session.role !== "admin" && session.role !== "publisher") {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }

  // Publisher: block any remaining admin/brand/agency-facing organisational
  // routes not covered by a more specific rule above.
  if (session.role === "publisher" && PUBLISHER_RESTRICTED.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Public survey-delivery + event paths are excluded here so they skip the
  // middleware invocation entirely (they only ever returned NextResponse.next()
  // above — they hit no auth gate and need no hostname redirect). Every embed
  // impression fired /embed, /api/embed/*, /api/events and /api/submit through
  // this middleware for nothing; excluding them removes one Edge Middleware
  // invocation per request on the highest-volume paths in the product.
  //
  // Anchoring matters: exclude `embed` only as a complete segment (embed$|embed/)
  // so the ADMIN-ONLY /embed-test route (and any future /embed-* admin route)
  // still passes through the auth gate. `api/embed/` covers the public embed
  // config routes; `api/events` / `api/submit` are the exact public write paths.
  // Nothing else — admin, dashboard, project and authenticated API routes are
  // untouched and still gated. Verified against /embed-test, /api/users, etc.
  // robots.txt is excluded too: it is served as a static file from /public, but
  // it is not covered by the in-handler static passthrough (which only lets
  // /_next, /public and image/js extensions through), so without this exclusion
  // the auth gate below would 307 /robots.txt to /login and crawlers could never
  // read it. Added alongside the Stage 5 crawler controls.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|embed$|embed/|api/embed/|api/events$|api/events/|api/submit$|api/submit/|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.ico$|.*\\.gif$|.*\\.webp$).*)",
  ],
};
