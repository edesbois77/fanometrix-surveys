"use client";

// ── StudioContainer — the workspace content column ───────────────────────────
// Survey Studio's workspace is intentionally a touch wider and more spacious
// than a Research Project area's 64rem reading column — Home is a visual,
// intelligence-led overview, not long-form prose. One width, one set of gutters,
// one vertical rhythm so every Studio page aligns to the same edges. Reuses the
// same token vocabulary as workspace-ui/PageContainer.
//
// It also hosts the Survey Studio breadcrumb once per page — rendered at the top
// of the OUTERMOST container (a context flag dedupes nested containers, e.g.
// Discover's layout column wrapping a page that also uses a container), so every
// Studio page gets a route-aware trail aligned to the same left edge as its title.

import { createContext, useContext } from "react";
import { StudioBreadcrumb } from "./breadcrumb/StudioBreadcrumb";

export const STUDIO_MAX_W = "76rem";

// false = no ancestor container has rendered the breadcrumb yet (we're outermost).
const BreadcrumbRenderedContext = createContext(false);

export function StudioContainer({
  children, className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const alreadyRendered = useContext(BreadcrumbRenderedContext);
  return (
    <div
      className={`mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8 ${className}`}
      style={{ maxWidth: STUDIO_MAX_W }}
    >
      {alreadyRendered ? children : (
        <>
          <StudioBreadcrumb className="mb-4" />
          <BreadcrumbRenderedContext.Provider value={true}>{children}</BreadcrumbRenderedContext.Provider>
        </>
      )}
    </div>
  );
}
