import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Exact paths that require no authentication
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/privacy",
  "/publisher-hub",
  "/publisher-guide",
  "/fanometrix-guide",
  "/survey",
  "/embed",
  "/access-denied",
]);

// API paths that must remain public (auth endpoints, embed submissions, external Looker/reporting)
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/submit", "/api/reporting", "/api/embed"];

// Routes only admins may access
const ADMIN_ONLY_PREFIXES = [
  "/survey-templates",
  "/campaigns",
  "/campaign-groups",
  "/campaign-deployment",
  "/reporting",
  "/looker-templates",
  "/demo-data",
  "/user-management",
  "/publishers",
  "/embed-test",
  "/api/users",
  "/api/publishers",
  "/api/surveys",
  "/api/campaigns",
  "/api/campaign-groups",
  "/api/demo",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Pass static assets through immediately
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/public/") ||
    /\.(png|jpg|jpeg|svg|ico|gif|webp|woff2?|ttf)$/.test(pathname)
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
