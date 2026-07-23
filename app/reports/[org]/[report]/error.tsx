"use client";

// Shown when the report cannot be built.
//
// The report reads live data on every request, so a database outage or a
// timeout surfaces here rather than as a stale page. It says nothing about what
// failed: this screen is read by a publisher contact, and an error class or a
// stack trace is both useless to them and more than they should see.

import { useEffect } from "react";
import { ReportShell } from "./ReportStates";
import { INK, NAVY, SANS } from "@/app/reports/theme";

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is what ties this to the server log entry; it is the only part
    // of the failure worth carrying, and it is not shown to the reader.
    console.error("[reports] failed to render report", error.digest ?? error.message);
  }, [error]);

  return (
    <ReportShell title="This report could not be loaded">
      <p style={{ margin: "0 0 22px" }}>
        The report is generated from live campaign data each time it is opened and that did not complete. This is
        almost always temporary.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          font: SANS,
          fontSize: 14,
          fontWeight: 600,
          padding: "11px 22px",
          borderRadius: 8,
          border: "none",
          background: NAVY,
          color: "#FFFFFF",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
      <p style={{ margin: "22px 0 0", fontSize: 12.5, color: INK.tertiary }}>
        If it keeps happening, contact the Fanometrix team member who shared this link.
      </p>
    </ReportShell>
  );
}
