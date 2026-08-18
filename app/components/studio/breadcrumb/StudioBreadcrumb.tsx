"use client";

// ── StudioBreadcrumb — the route-aware breadcrumb rendered once per page ──────
// Derives the trail from the current pathname + any dynamic labels a detail page
// registered, then renders the shared workspace-ui Breadcrumb (nav > ol > li,
// aria-current on the leaf). Rendered by StudioContainer (deduped) so every Survey
// Studio page gets it in the same place, aligned to the content column.

import { usePathname } from "next/navigation";
import { Breadcrumb } from "@/app/components/workspace-ui";
import { studioBreadcrumbTrail } from "@/lib/studio/breadcrumb";
import { useBreadcrumbLabels } from "./StudioBreadcrumbContext";

export function StudioBreadcrumb({ className = "" }: { className?: string }) {
  const pathname = usePathname() ?? "";
  const labels = useBreadcrumbLabels();
  const items = studioBreadcrumbTrail(pathname, labels);
  if (items.length === 0) return null; // not a Survey Studio route
  return <Breadcrumb items={items} className={className} />;
}
