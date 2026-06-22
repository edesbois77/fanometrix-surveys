import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// ── Domain constants (resolved at Edge runtime) ───────────────────────────────
const MARKETING_ORIGIN = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://fanometrix-surveys.vercel.app";
const APP_ORIGIN       = process.env.NEXT_PUBLIC_APP_URL       ?? "https://fanometrix-surveys.vercel.app";

// Paths served exclusively on surveys.fanometrix.com
const SURVEYS_ALLOWED_PREFIXES = [
  "/embed", "/privacy", "/api/embed", "/api/submit", "/api/reporting",
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
  "/survey",
  "/embed",
  "/access-denied",
]);

// API paths that must remain public (auth endpoints, embed submissions, external Looker/reporting)
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/submit", "/api/reporting", "/api/embed", "/api/access-requests", "/api/publisher", "/api/dashboard"];

// Routes only admins may access
const ADMIN_ONLY_PREFIXES = [
  "/survey-templates",
  "/campaigns",
  "/campaign-groups",
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
  "/publishers",
  "/embed-test",
  "/api/users",
  "/api/publishers",
  "/api/admin",
  "/api/social",
  "/api/surveys",
  "/api/campaign-groups",
  "/api/demo",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";

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
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Force password change — gate all protected routes until the user sets a new password
  if (session.forcePasswordChange && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Admin-only routes
  const isAdminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
  if (isAdminOnly && session.role !== "admin") {
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.ico$|.*\\.gif$|.*\\.webp$).*)",
  ],
};
