"use client";

import { useState } from "react";
import { QuadrantSurvey } from "./QuadrantSurvey";

type Mode = "classic" | "quadrant";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

const DESIGN_NOTES = [
  "2×2 grid — entire quadrant is the tap target, no radio buttons",
  "Gold progress ring replaces the horizontal progress bar",
  "Centre circle anchors question text + progress indicator",
  "Tap floods selected quadrant with gold · others dim to 62%",
  "Privacy screen maintains question state on close",
  "300ms question transition with fade in/out",
  "Keyboard accessible — Enter/Space to select",
];

export default function CreativeLabQuadrantPage() {
  const [mode, setMode] = useState<Mode>("quadrant");
  // Key forces QuadrantSurvey to remount when user switches back, resetting to Q1
  const [quadrantKey, setQuadrantKey] = useState(0);

  function switchMode(m: Mode) {
    setMode(m);
    if (m === "quadrant") setQuadrantKey((k) => k + 1);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#07101A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "40px 20px 60px",
        boxSizing: "border-box",
        gap: 0,
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            display: "inline-block",
            background: "rgba(215,184,122,0.1)",
            border: "1px solid rgba(215,184,122,0.3)",
            color: GOLD,
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: "0.14em",
            padding: "4px 12px",
            borderRadius: 20,
            marginBottom: 12,
            textTransform: "uppercase",
          }}
        >
          Creative Lab · Prototype
        </div>
        <h1
          style={{
            color: "#fff",
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          Quadrant Mode
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.38)",
            fontSize: 10.5,
            margin: "7px 0 0",
            lineHeight: 1.5,
          }}
        >
          Exploratory prototype — not for production deployment
        </p>
      </div>

      {/* ── Mode toggle ── */}
      <div
        role="tablist"
        aria-label="Creative mode selector"
        style={{
          display: "flex",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 26,
          padding: 3,
          gap: 2,
          marginBottom: 28,
        }}
      >
        {(["classic", "quadrant"] as Mode[]).map((m) => {
          const label =
            m === "classic" ? "Classic Creative" : "Quadrant Mode";
          const active = mode === m;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              onClick={() => switchMode(m)}
              style={{
                background: active ? GOLD : "transparent",
                border: "none",
                cursor: "pointer",
                color: active ? NAVY : "rgba(255,255,255,0.5)",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                padding: "7px 18px",
                borderRadius: 22,
                transition: "all 0.2s ease",
                letterSpacing: "0.01em",
                display: "flex",
                alignItems: "center",
                gap: 7,
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {m === "quadrant" && (
                <span
                  style={{
                    fontSize: 7.5,
                    background: active
                      ? "rgba(11,25,41,0.22)"
                      : "rgba(215,184,122,0.18)",
                    color: active ? NAVY : GOLD,
                    padding: "2px 5px",
                    borderRadius: 5,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                  }}
                >
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 300×250 preview canvas ── */}
      <div
        style={{
          border: "1px solid rgba(215,184,122,0.2)",
          borderRadius: 4,
          overflow: "hidden",
          boxShadow:
            "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.3)",
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        {mode === "quadrant" ? (
          <QuadrantSurvey key={quadrantKey} />
        ) : (
          <iframe
            src="/embed"
            width={300}
            height={250}
            style={{ display: "block", border: "none" }}
            title="Classic Creative preview"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>

      {/* ── Canvas label ── */}
      <p
        style={{
          color: "rgba(255,255,255,0.22)",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          margin: "0 0 32px",
        }}
      >
        300 × 250 MPU
      </p>

      {/* ── Design notes ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 340,
          background: "rgba(215,184,122,0.05)",
          border: "1px solid rgba(215,184,122,0.14)",
          borderRadius: 8,
          padding: "14px 16px 16px",
        }}
      >
        <p
          style={{
            color: GOLD,
            fontSize: 9.5,
            fontWeight: 700,
            margin: "0 0 10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Design Notes
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {DESIGN_NOTES.map((note) => (
            <li
              key={note}
              style={{
                color: "rgba(255,255,255,0.48)",
                fontSize: 9.5,
                lineHeight: 1.5,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <span style={{ color: GOLD, fontSize: 8, marginTop: 2, flexShrink: 0 }}>
                ●
              </span>
              {note}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Isolation notice ── */}
      <div
        style={{
          marginTop: 28,
          maxWidth: 340,
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: "rgba(255,255,255,0.2)",
            fontSize: 9,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          This prototype is isolated at{" "}
          <code
            style={{
              color: "rgba(215,184,122,0.45)",
              background: "rgba(215,184,122,0.06)",
              padding: "1px 5px",
              borderRadius: 3,
              fontSize: 8.5,
            }}
          >
            /creative-lab/quadrant-mode
          </code>
          . Removing the{" "}
          <code
            style={{
              color: "rgba(215,184,122,0.45)",
              background: "rgba(215,184,122,0.06)",
              padding: "1px 5px",
              borderRadius: 3,
              fontSize: 8.5,
            }}
          >
            creative-lab/
          </code>{" "}
          directory has no effect on the production embed.
        </p>
      </div>
    </div>
  );
}
