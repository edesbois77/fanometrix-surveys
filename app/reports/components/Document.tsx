// Document furniture for the Audience Intelligence Report.
//
// This is a printed deliverable that happens to be served over HTTP. The
// components here are page furniture — bands, section headers, stat tiles,
// tables, callouts — sized for reading rather than scanning, with generous
// whitespace and typography carrying the hierarchy.
//
// Everything is a server component. The only client code in the report is the
// unlock form and the print button.

import { CONFIDENCE_TONE, GOLD, INK, NAVY, SANS } from "../theme";
import type { Confidence } from "@/lib/reports/types";
import { CONFIDENCE_LABEL } from "@/lib/reports/stats";

export function Band({
  children,
  tone = "surface",
  id,
}: {
  children: React.ReactNode;
  tone?: "surface" | "page" | "paper" | "navy";
  id?: string;
}) {
  const background =
    tone === "navy" ? NAVY : tone === "page" ? INK.page : tone === "paper" ? INK.paper : INK.surface;
  return (
    <section
      id={id}
      className="report-band"
      style={{
        background,
        borderTop: tone === "navy" ? "none" : `1px solid ${INK.hairlineSoft}`,
        color: tone === "navy" ? "#FFFFFF" : INK.primary,
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 40px" }}>{children}</div>
    </section>
  );
}

export function SectionHeader({
  number,
  eyebrow,
  title,
  standfirst,
  onDark = false,
}: {
  /** Section number. A numbered spine is how a reader who was forwarded page
   *  seven knows where they are, and it is what separates a document from a
   *  scrolling page. */
  number?: number;
  eyebrow: string;
  title: string;
  standfirst?: string;
  onDark?: boolean;
}) {
  return (
    /* The title takes the full column width; only the standfirst is held to a
       comfortable measure. Capping both meant a title one word too long broke
       onto a second line for no reason a reader could see. */
    <header style={{ marginBottom: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {number !== undefined && (
          <>
            <span
              style={{
                font: SANS,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                color: onDark ? "rgba(255,255,255,0.45)" : INK.tertiary,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(number).padStart(2, "0")}
            </span>
            <span
              aria-hidden
              style={{
                width: 18,
                height: 1,
                background: onDark ? "rgba(255,255,255,0.25)" : INK.hairline,
                display: "inline-block",
              }}
            />
          </>
        )}
        <span
          style={{
            font: SANS,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: onDark ? GOLD : "#8A6D2F",
          }}
        >
          {eyebrow}
        </span>
      </div>
      <h2
        style={{
          font: SANS,
          fontSize: 34,
          lineHeight: 1.15,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: onDark ? "#FFFFFF" : INK.primary,
          margin: 0,
          maxWidth: 940,
        }}
      >
        {title}
      </h2>
      {standfirst && (
        <p
          style={{
            font: SANS,
            fontSize: 16.5,
            lineHeight: 1.6,
            color: onDark ? "rgba(255,255,255,0.75)" : INK.secondary,
            margin: "18px 0 0",
            maxWidth: 760,
          }}
        >
          {standfirst}
        </p>
      )}
    </header>
  );
}

export function StatTile({
  label,
  value,
  sub,
  emphasis = false,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${emphasis ? GOLD : INK.hairline}`,
        borderRadius: 10,
        padding: "22px 22px 20px",
        background: emphasis ? INK.paper : INK.surface,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        breakInside: "avoid",
      }}
    >
      <div
        style={{
          font: SANS,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: INK.tertiary,
        }}
      >
        {label}
      </div>
      <div
        style={{
          font: SANS,
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: INK.primary,
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ font: SANS, fontSize: 12.5, lineHeight: 1.5, color: INK.secondary }}>{sub}</div>
      )}
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const tone = CONFIDENCE_TONE[confidence];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        font: SANS,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: tone.ink,
        background: tone.wash,
        border: `1px solid ${tone.line}`,
        borderRadius: 999,
        padding: "3px 10px",
        whiteSpace: "nowrap",
        flexShrink: 0,
        alignSelf: "flex-start",
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 999, background: tone.ink, display: "inline-block" }}
      />
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

export function Table({
  columns,
  rows,
  caption,
}: {
  columns: { key: string; label: string; align?: "left" | "right"; width?: string }[];
  rows: Record<string, React.ReactNode>[];
  caption?: string;
}) {
  return (
    <div style={{ overflowX: "auto", minWidth: 0, maxWidth: "100%" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          font: SANS,
          fontSize: 13,
          minWidth: 640,
        }}
      >
        {caption && (
          <caption
            style={{
              captionSide: "top",
              textAlign: "left",
              font: SANS,
              fontSize: 12,
              color: INK.tertiary,
              paddingBottom: 10,
            }}
          >
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? "left",
                  font: SANS,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: INK.tertiary,
                  padding: "0 12px 10px",
                  borderBottom: `1px solid ${INK.hairline}`,
                  width: c.width,
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align ?? "left",
                    padding: "13px 12px",
                    borderBottom: `1px solid ${INK.hairlineSoft}`,
                    color: INK.primary,
                    fontVariantNumeric: c.align === "right" ? "tabular-nums" : "normal",
                  }}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({
  title,
  children,
  tone = "paper",
}: {
  title?: string;
  children: React.ReactNode;
  tone?: "paper" | "neutral";
}) {
  return (
    <aside
      style={{
        background: tone === "paper" ? INK.paper : INK.page,
        border: `1px solid ${tone === "paper" ? INK.paperLine : INK.hairline}`,
        borderRadius: 10,
        padding: "20px 24px",
        breakInside: "avoid",
      }}
    >
      {title && (
        <div
          style={{
            font: SANS,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "#8A6D2F",
            marginBottom: 10,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ font: SANS, fontSize: 13.5, lineHeight: 1.65, color: INK.secondary }}>{children}</div>
    </aside>
  );
}

export function Card({ children, pad = 28 }: { children: React.ReactNode; pad?: number }) {
  return (
    <div
      style={{
        border: `1px solid ${INK.hairline}`,
        borderRadius: 12,
        background: INK.surface,
        padding: pad,
        breakInside: "avoid",
      }}
    >
      {children}
    </div>
  );
}

/** The report's provenance strip: status, period, currency, revision.
 *
 *  It exists because the first question a senior reader asks about a number
 *  someone forwarded them is "is this still true". Answering that on the cover,
 *  and again at the close, is the difference between a document that gets
 *  quoted and one that gets queried. */
export function MetadataPanel({
  items,
  onDark = false,
  compact = false,
}: {
  items: { label: string; value: string; emphasis?: boolean }[];
  onDark?: boolean;
  compact?: boolean;
}) {
  const line = onDark ? "rgba(255,255,255,0.16)" : INK.hairline;
  const labelInk = onDark ? "rgba(255,255,255,0.5)" : INK.tertiary;
  const valueInk = onDark ? "#FFFFFF" : INK.primary;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${compact ? 150 : 168}px, 100%), 1fr))`,
        gap: 0,
        border: `1px solid ${line}`,
        borderRadius: 10,
        overflow: "hidden",
        breakInside: "avoid",
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: compact ? "14px 16px" : "18px 20px",
            borderRight: `1px solid ${line}`,
            borderBottom: `1px solid ${line}`,
            marginRight: -1,
            marginBottom: -1,
          }}
        >
          <div
            style={{
              font: SANS,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: labelInk,
              marginBottom: 8,
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              font: SANS,
              fontSize: compact ? 12.5 : 13.5,
              fontWeight: item.emphasis ? 700 : 500,
              color: item.emphasis ? (onDark ? GOLD : "#8A6D2F") : valueInk,
              lineHeight: 1.4,
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        font: SANS,
        fontSize: 15.5,
        lineHeight: 1.7,
        color: INK.secondary,
        margin: 0,
        maxWidth: 720,
      }}
    >
      {children}
    </p>
  );
}
