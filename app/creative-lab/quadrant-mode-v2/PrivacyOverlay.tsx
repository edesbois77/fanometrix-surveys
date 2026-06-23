"use client";

import type { Theme } from "./themes";

const ANONYMOUS_ITEMS = [
  "No personal information collected",
  "No email addresses collected",
  "No cookies required",
  "No individual identifiers stored",
];

const METADATA_ITEMS = [
  "Campaign", "Publisher", "Country", "Placement",
  "Device type", "Browser type", "Contextual metadata",
];

interface PrivacyOverlayProps {
  theme: Theme;
  onClose: () => void;
}

export function PrivacyOverlay({ theme, onClose }: PrivacyOverlayProps) {
  const o = theme.overlay;

  return (
    <div
      role="dialog"
      aria-label="Privacy information"
      aria-modal="true"
      style={{
        position: "absolute",
        inset: 0,
        background: o.bg,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        animation: "qmv2FadeIn 0.18s ease",
      }}
    >
      <style>{`@keyframes qmv2FadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Header */}
      <div
        style={{
          height: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 13px",
          borderBottom: `1px solid ${o.border}`,
          flexShrink: 0,
        }}
      >
        <span style={{ color: o.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
          Privacy
        </span>
        <button
          onClick={onClose}
          aria-label="Close privacy and return to survey"
          style={{
            background: o.closeBg,
            border: `1px solid ${o.accent}44`,
            borderRadius: 12,
            cursor: "pointer",
            color: o.closeText,
            fontSize: 9,
            fontWeight: 700,
            padding: "3px 10px",
            lineHeight: 1.4,
            letterSpacing: "0.04em",
          }}
        >
          ✕ Back
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: "11px 13px 8px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        <p style={{ color: o.title, fontSize: 10.5, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
          Your responses are anonymous.
        </p>

        {ANONYMOUS_ITEMS.map((item) => (
          <div key={item} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <span style={{ color: o.accent, fontSize: 7, marginTop: 2.5, flexShrink: 0 }}>●</span>
            <span style={{ color: o.text, fontSize: 9.5, lineHeight: 1.4 }}>{item}</span>
          </div>
        ))}

        <div
          style={{
            marginTop: 3,
            padding: "7px 9px",
            background: o.tagBg,
            border: `1px solid ${o.border}`,
            borderRadius: 6,
          }}
        >
          <p
            style={{
              color: o.tagText,
              fontSize: 7.5,
              fontWeight: 700,
              margin: "0 0 5px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
            }}
          >
            Metadata collected
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px" }}>
            {METADATA_ITEMS.map((m) => (
              <span
                key={m}
                style={{
                  color: o.tagText,
                  fontSize: 8.5,
                  background: o.tagBg,
                  border: `1px solid ${o.border}`,
                  padding: "1px 6px",
                  borderRadius: 4,
                }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 13px 12px",
          flexShrink: 0,
          borderTop: `1px solid ${o.border}`,
        }}
      >
        <a
          href="/en/privacy"
          target="_blank"
          rel="noopener"
          style={{
            display: "block",
            textAlign: "center",
            color: o.accent,
            fontSize: 9.5,
            fontWeight: 700,
            padding: "7px",
            borderRadius: 6,
            textDecoration: "none",
            background: o.closeBg,
            border: `1px solid ${o.accent}44`,
            letterSpacing: "0.03em",
          }}
        >
          Read Full Privacy Policy →
        </a>
      </div>
    </div>
  );
}
