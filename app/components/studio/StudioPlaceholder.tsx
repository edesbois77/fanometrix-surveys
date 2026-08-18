"use client";

// ── StudioPlaceholder — a lightweight "not built yet" destination ─────────────
// Request / Discover / Manage are not built yet. They exist only so the product
// sidebar can be tested without broken links. Each is this single considered
// placeholder inside the real shell — never a half-built feature. (Home and
// Create ARE built — Home is app/components/studio/home, Create is
// app/components/studio/create — so neither uses this component.) It also
// demonstrates Level 3 (workspace / local navigation): the section's own sub-nav
// belongs here under the page title, not nested beneath the sidebar item.

import { StudioContainer } from "./StudioContainer";
import { WorkspaceHeader, EmptyState, StatusBadge } from "@/app/components/workspace-ui";
import { StudioIcon, type StudioIconName } from "./studio-icons";

export function StudioPlaceholder({
  icon, eyebrow, title, description, localNav,
}: {
  icon: StudioIconName;
  eyebrow: string;
  title: string;
  description: string;
  /** Preview of the Level-3 local navigation this area will own (not links). */
  localNav?: string[];
}) {
  const Glyph = StudioIcon[icon];
  return (
    <StudioContainer>
      <WorkspaceHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        status={{ label: "Coming soon", tone: "neutral" }}
      />

      {/* Level 3 local navigation preview — lives in the workspace, under the
          title. Rendered as a disabled tab row so reviewers can see where the
          About | Creative | Survey | Campaigns | Deploy style navigation sits. */}
      {localNav && localNav.length > 0 && (
        <div className="mt-5 flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: "1px solid var(--border-default)" }}>
          {localNav.map((label, i) => (
            <span
              key={label}
              className="whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2"
              style={i === 0
                ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" }
                : { color: "var(--text-disabled)", borderColor: "transparent" }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8">
        <EmptyState
          icon={<Glyph size={22} />}
          title={`${title} is coming soon`}
          description="This Survey Studio area is part of a later phase. The shell, Home and Create are already built."
          action={<StatusBadge label="Later phase" tone="accent" />}
        />
      </div>
    </StudioContainer>
  );
}
