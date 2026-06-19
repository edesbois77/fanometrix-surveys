import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Exact paths that require no authentication
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/privacy",
  "/publisher-hub",
  "/publisher-guide",
  "/survey",
  "/embed",
  "/access-denied",
]);

// API paths that must remain public (embed submissions + external Looker/reporting)
const PUBLIC_API_PREFIXES = ["/api/submit", "/api/reporting"];

// Routes only admins may access
const ADMIN_ONLY_PREFIXES = [
  "/survey-templates",
  "/campaigns",
  "/campaign-deployment",
  "/reporting",
  "/looker-templates",
  "/demo-data",
  "/user-management",
  "/api/users",
  "/api/surveys",
  "/api/campaigns",
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
