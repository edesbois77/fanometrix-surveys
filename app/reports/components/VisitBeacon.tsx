"use client";

// Registers this page load as a visit. Renders nothing.
//
// The module-level guard is not belt-and-braces: React invokes effects twice in
// development strict mode, and without it every local page load would count as
// two visits, which would quietly make the development numbers wrong in a way
// nobody would notice until the figure was quoted.
//
// A failed beacon is silent by design. If the counter cannot be written, the
// report is still the report, and an error toast about analytics on a document
// sent to a client would be worse than the missing row.

import { useEffect } from "react";

const recorded = new Set<string>();

export function VisitBeacon({ orgSlug, reportSlug }: { orgSlug: string; reportSlug: string }) {
  useEffect(() => {
    const key = `${orgSlug}/${reportSlug}`;
    if (recorded.has(key)) return;
    recorded.add(key);

    fetch(`/api/reports/${orgSlug}/${reportSlug}/visit`, {
      method: "POST",
      // The reader may click straight through to a download or close the tab;
      // keepalive lets the request finish either way.
      keepalive: true,
    }).catch(() => {
      // Counting readers is never worth interrupting one.
    });
  }, [orgSlug, reportSlug]);

  return null;
}
