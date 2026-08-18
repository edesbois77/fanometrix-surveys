"use client";

// A considered "coming soon" body for the Discover Level-3 areas that are part of
// a later phase (Overview / Research / Reports / Data). It renders inside the
// Discover layout (which already provides the StudioContainer + SubNav), so it is
// just the page header + a calm EmptyState — never a half-built feature.

import { WorkspaceHeader, EmptyState, StatusBadge } from "@/app/components/workspace-ui";

export function DiscoverComingSoon({
  title, description, note,
}: {
  title: string;
  description: string;
  note?: React.ReactNode;
}) {
  return (
    <>
      <WorkspaceHeader eyebrow="Discover" title={title} description={description} status={{ label: "Coming soon", tone: "neutral" }} />
      <div className="mt-8">
        <EmptyState
          title={`${title} is coming soon`}
          description={note ?? "This Discover area is part of a later phase."}
          action={<StatusBadge label="Later phase" tone="accent" />}
        />
      </div>
    </>
  );
}
