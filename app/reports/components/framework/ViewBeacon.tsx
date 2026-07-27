"use client";

// Registers this page load as a view, once, from the browser. Renders nothing.
//
// Same contract as app/reports/components/VisitBeacon: a module-level guard so
// React strict-mode's double effect doesn't double-count in development, and a
// silent failure — a report that can't count its readers is still the report.

import { useEffect } from "react";

const recorded = new Set<string>();

export function ViewBeacon({ reportId }: { reportId: string }) {
  useEffect(() => {
    if (recorded.has(reportId)) return;
    recorded.add(reportId);
    fetch(`/api/reports/framework/${encodeURIComponent(reportId)}/view`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  }, [reportId]);
  return null;
}
