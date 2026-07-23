// The three states a report can be in other than "rendered".
//
// This page is opened by people with no Fanometrix account, often from a
// forwarded link, sometimes months after it was issued. The default framework
// screens for those states say "Application error: a server-side exception has
// occurred" and "404", which read as a broken link and reflect on the report
// rather than on the outage. Each of these says what happened, what the reader
// can do, and nothing about our internals.

import { GOLD, INK, NAVY, SANS } from "@/app/reports/theme";

export function ReportShell({
  title,
  children,
  spinner = false,
}: {
  title: string;
  children: React.ReactNode;
  spinner?: boolean;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: NAVY,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        font: SANS,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460, textAlign: "center" }}>
        <div
          style={{
            font: SANS,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: 32,
          }}
        >
          Fanometrix
        </div>

        <div
          style={{
            background: INK.surface,
            borderRadius: 14,
            padding: "40px 36px",
          }}
        >
          {spinner && (
            <div
              aria-hidden
              style={{
                width: 26,
                height: 26,
                margin: "0 auto 22px",
                borderRadius: "50%",
                border: `2px solid ${INK.hairline}`,
                borderTopColor: GOLD,
                animation: "fmxspin 0.9s linear infinite",
              }}
            />
          )}
          <h1
            style={{
              font: SANS,
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 10px",
              color: INK.primary,
            }}
          >
            {title}
          </h1>
          <div style={{ font: SANS, fontSize: 14, lineHeight: 1.65, color: INK.secondary }}>{children}</div>
        </div>
      </div>
      <style>{`@keyframes fmxspin { to { transform: rotate(360deg) } }`}</style>
    </main>
  );
}
