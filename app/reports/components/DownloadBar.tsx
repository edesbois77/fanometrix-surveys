"use client";

// The three standard outputs of every partner report.
//
// The Executive PDF is the browser's own print-to-PDF over the report's print
// stylesheet, not a separately rendered document. That is a deliberate choice:
// a second rendering path is a second thing to keep in sync, and the first time
// it drifts the PDF and the page disagree about a number. One source, one set of
// figures, and the PDF is always current with the data the page just computed.

import { INK, SANS, GOLD } from "../theme";

const ITEMS = [
  {
    kind: "pdf" as const,
    title: "Executive PDF",
    detail: "The full report, formatted for print and for forwarding.",
    action: "Print or save as PDF",
  },
  {
    kind: "responses" as const,
    title: "Raw Responses CSV",
    detail:
      "Every completed response: timestamp, market, publisher, placement, creative, each answer in full text, device and duration.",
    action: "Download CSV",
  },
  {
    kind: "metrics" as const,
    title: "Campaign Metrics CSV",
    detail:
      "Hourly delivery by market and creative: impressions, viewable impressions, starts, completions and every derived rate.",
    action: "Download CSV",
  },
];

export function DownloadBar({ orgSlug, reportSlug }: { orgSlug: string; reportSlug: string }) {
  return (
    <div
      className="report-no-print"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}
    >
      {ITEMS.map((item) => {
        const href =
          item.kind === "pdf"
            ? undefined
            : `/api/reports/${orgSlug}/${reportSlug}/download?type=${item.kind}`;
        const inner = (
          <>
            <div
              style={{
                font: SANS,
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                color: INK.primary,
                marginBottom: 10,
              }}
            >
              {item.title}
            </div>
            <div
              style={{
                font: SANS,
                fontSize: 13,
                lineHeight: 1.6,
                color: INK.secondary,
                marginBottom: 20,
                flex: 1,
              }}
            >
              {item.detail}
            </div>
            <span
              style={{
                font: SANS,
                fontSize: 12.5,
                fontWeight: 600,
                color: "#8A6D2F",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {item.action}
              <span aria-hidden>→</span>
            </span>
          </>
        );

        const style: React.CSSProperties = {
          display: "flex",
          flexDirection: "column",
          textAlign: "left",
          border: `1px solid ${INK.hairline}`,
          borderRadius: 12,
          background: INK.surface,
          padding: 28,
          textDecoration: "none",
          cursor: "pointer",
          borderTopColor: GOLD,
          borderTopWidth: 2,
        };

        return href ? (
          <a key={item.kind} href={href} style={style}>
            {inner}
          </a>
        ) : (
          <button key={item.kind} type="button" onClick={() => window.print()} style={style}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
