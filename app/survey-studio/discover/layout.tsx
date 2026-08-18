"use client";

// ── Survey Studio → Discover — workspace shell ───────────────────────────────
// Discover is a real workspace (no longer a placeholder). This layout owns the
// section furniture once: the StudioContainer column and the Level-3 SubNav
// (Overview | Dashboards | Research | Reports | Data). Each sub-page renders its
// own WorkspaceHeader + body. Discover stays a SINGLE Level-2 destination — this
// nav is NOT added to STUDIO_NAV (the sidebar).
import { StudioContainer } from "@/app/components/studio/StudioContainer";
import { SubNav } from "@/app/components/workspace-ui";
import { DISCOVER_BASE, DISCOVER_NAV } from "@/lib/studio/discover-nav";

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioContainer>
      <SubNav
        base={DISCOVER_BASE}
        items={DISCOVER_NAV.map(({ segment, label }) => ({ segment, label }))}
        ariaLabel="Discover"
      />
      <div className="mt-6">{children}</div>
    </StudioContainer>
  );
}
