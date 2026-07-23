// The sticky section rail.
//
// The report is long by design: it is a document, not a dashboard, and it
// rewards reading in order. But a reader who has been forwarded it and wants
// the answers, or one returning to check a figure, should never have to scroll
// hunting for a section. The rail keeps the whole structure one click away
// without taking a column away from the content.
//
// No JavaScript: `position: sticky` plus anchor links. That matters here
// because the report must behave identically when printed (the rail is removed)
// and when JavaScript is unavailable.

import { INK, SANS } from "../theme";

export function SectionNav({
  sections,
  reportTitle,
  organisationName,
}: {
  sections: { id: string; label: string }[];
  reportTitle: string;
  organisationName: string;
}) {
  return (
    <nav
      className="report-no-print report-nav"
      aria-label="Report sections"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "saturate(180%) blur(12px)",
        WebkitBackdropFilter: "saturate(180%) blur(12px)",
        borderBottom: `1px solid ${INK.hairline}`,
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 40px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          height: 52,
        }}
      >
        <span
          className="report-nav-brand"
          style={{
            font: SANS,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: INK.tertiary,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          title={`${reportTitle} · ${organisationName}`}
        >
          {organisationName}
        </span>

        {/* The rail scrolls rather than wrapping: a nav that changes height as
            the viewport narrows makes the sticky offset wrong and the anchor
            targets land under it. */}
        <ol
          style={{
            display: "flex",
            gap: 15,
            listStyle: "none",
            margin: 0,
            padding: 0,
            overflowX: "auto",
            scrollbarWidth: "none",
            alignItems: "center",
            height: "100%",
          }}
        >
          {sections.map((s, i) => (
            <li key={s.id} style={{ flexShrink: 0 }}>
              <a
                href={`#${s.id}`}
                style={{
                  font: SANS,
                  fontSize: 12,
                  color: INK.secondary,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  gap: 7,
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: INK.tertiary, fontVariantNumeric: "tabular-nums", fontSize: 10.5 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
