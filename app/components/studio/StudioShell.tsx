"use client";

// ── StudioShell — the new authenticated composition ──────────────────────────
//
//   GlobalShell (navy, Level 1)
//     └─ StudioSidebar (light grey, Level 2)  +  <main> workspace (white, Level 3)
//
// This mirrors the shape the Research Project (workspace) layout already proves
// (global → product nav → content column), generalised for a product that isn't
// a single record. It is ADDITIVE: mounted only under /survey-studio via that
// route's layout, it touches no existing page and reuses the global
// SessionProvider from the root layout unchanged.
//
// Deliberately NO overflow-auto on <main> — like AdminShell, the shell is
// min-h-screen (not h-screen), so the window scrolls and `position: sticky`
// (the header, the sidebar) keeps working. Adding a scroll container here would
// silently break both.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GlobalShell } from "./GlobalShell";
import { StudioSidebar, StudioSidebarDrawer } from "./StudioSidebar";
import { StudioBreadcrumbProvider } from "./breadcrumb/StudioBreadcrumbContext";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Close the mobile drawer on navigation.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset UI on route change
  useEffect(() => { setNavOpen(false); }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (navOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [navOpen]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--page-bg)" }}>
      <GlobalShell onOpenNav={() => setNavOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <StudioSidebar />
        <main className="flex-1 min-w-0 print:bg-white" style={{ background: "var(--page-bg)" }}>
          <StudioBreadcrumbProvider>{children}</StudioBreadcrumbProvider>
        </main>
      </div>
      <StudioSidebarDrawer open={navOpen} onClose={() => setNavOpen(false)} />
    </div>
  );
}
