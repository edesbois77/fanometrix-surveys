"use client";

// The unlock screen. Deliberately says almost nothing: the organisation name is
// shown so a recipient knows the link is theirs, and nothing else — not the
// brand, not the campaign, not a single figure. A wrong slug and a wrong
// password are indistinguishable from outside.

import { useState } from "react";
import { GOLD, INK, NAVY, SANS } from "@/app/reports/theme";

export function PasswordGate({
  orgSlug,
  reportSlug,
  organisationName,
  reportTitle,
}: {
  orgSlug: string;
  reportSlug: string;
  organisationName: string;
  reportTitle: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${orgSlug}/${reportSlug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "That password did not match. Please check the details you were sent.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

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
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div
          style={{
            font: SANS,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          Fanometrix
        </div>

        <div
          style={{
            background: INK.surface,
            borderRadius: 14,
            padding: "40px 36px",
            border: `1px solid rgba(255,255,255,0.08)`,
          }}
        >
          <h1
            style={{
              font: SANS,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
              color: INK.primary,
            }}
          >
            {reportTitle}
          </h1>
          <p style={{ font: SANS, fontSize: 14, lineHeight: 1.6, color: INK.secondary, margin: "0 0 28px" }}>
            Prepared for {organisationName}. This report is confidential and password protected. Please enter the
            password that came with your link.
          </p>

          <form onSubmit={onSubmit}>
            <label
              htmlFor="report-password"
              style={{
                display: "block",
                font: SANS,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: INK.tertiary,
                marginBottom: 8,
              }}
            >
              Password
            </label>
            <input
              id="report-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                font: SANS,
                fontSize: 15,
                padding: "12px 14px",
                borderRadius: 8,
                border: `1px solid ${error ? "#8A4B33" : INK.hairline}`,
                outline: "none",
                marginBottom: 16,
                color: INK.primary,
                background: INK.surface,
              }}
            />

            {error && (
              <div
                role="alert"
                style={{
                  font: SANS,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "#8A4B33",
                  background: "#F7ECE6",
                  border: "1px solid #E8D2C4",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              style={{
                width: "100%",
                font: SANS,
                fontSize: 14.5,
                fontWeight: 600,
                padding: "13px 16px",
                borderRadius: 8,
                border: "none",
                background: busy || password.length === 0 ? INK.hairline : NAVY,
                color: busy || password.length === 0 ? INK.tertiary : "#FFFFFF",
                cursor: busy || password.length === 0 ? "default" : "pointer",
              }}
            >
              {busy ? "Opening…" : "Open report"}
            </button>
          </form>
        </div>

        <p
          style={{
            font: SANS,
            fontSize: 12,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.45)",
            textAlign: "center",
            margin: "24px auto 0",
            maxWidth: 340,
          }}
        >
          If you do not have the password, contact the Fanometrix team member who shared this link with you.
        </p>
      </div>
    </main>
  );
}
