"use client";

import type { Theme } from "./themes";
import { type TypographyMode, fontA, fontQ } from "./typography";

const ANONYMOUS_ITEMS = [
  "No personal information collected",
  "No email addresses collected",
  "No cookies required",
  "No individual identifiers stored",
];

interface Props {
  theme: Theme;
  typography?: TypographyMode;
  onClose: () => void;
}

export function PrivacyOverlay({ theme, typography = "system", onClose }: Props) {
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
        animation: "tgFadeIn 0.18s ease",
        borderRadius: "inherit",
      }}
    >
      <style>{`@keyframes tgFadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Header */}
      <div style={{ height: 42, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: `1px solid ${o.border}`, flexShrink: 0 }}>
        <span style={{ color: o.title, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", fontFamily: fontQ(typography) }}>Privacy</span>
        <button
          onClick={onClose}
          aria-label="Close privacy and return to survey"
          style={{ background: o.closeBg, border: `1px solid ${o.accent}44`, borderRadius: 12, cursor: "pointer", color: o.closeText, fontSize: 9, fontWeight: 700, padding: "3px 10px", lineHeight: 1.4, letterSpacing: "0.04em", fontFamily: fontA(typography) }}
        >
          ✕ Back
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "12px 16px 8px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ color: o.title, fontSize: 10.5, fontWeight: 700, margin: 0, lineHeight: 1.3, fontFamily: fontQ(typography) }}>
          Your responses are anonymous.
        </p>
        {ANONYMOUS_ITEMS.map((item) => (
          <div key={item} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <span style={{ color: o.accent, fontSize: 7, marginTop: 2.5, flexShrink: 0 }}>●</span>
            <span style={{ color: o.text, fontSize: 9.5, lineHeight: 1.4, fontFamily: fontA(typography), fontWeight: 400 }}>{item}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 16px 12px", flexShrink: 0, borderTop: `1px solid ${o.border}` }}>
        <a
          href="/en/privacy"
          target="_blank"
          rel="noopener"
          style={{ display: "block", textAlign: "center", color: o.accent, fontSize: 9.5, fontWeight: 700, padding: "7px", borderRadius: 6, textDecoration: "none", background: o.closeBg, border: `1px solid ${o.accent}44`, letterSpacing: "0.03em", fontFamily: fontA(typography) }}
        >
          Read Full Privacy Policy →
        </a>
      </div>
    </div>
  );
}
