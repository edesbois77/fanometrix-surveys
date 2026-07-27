"use client";

// The unlock screen for a framework report. Deliberately says almost nothing
// before the password is answered: the report's own title and who it was
// prepared for, so a recipient knows the link is theirs — no figures, no
// findings. A wrong id and a wrong password are indistinguishable from outside.

import { useState } from "react";
import { GOLD, NAVY, SANS } from "@/app/reports/theme";

export function PasswordGate({
  reportId,
  title,
  preparedFor,
}: {
  reportId: string;
  title: string;
  preparedFor?: string;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/framework/${encodeURIComponent(reportId)}/unlock`, {
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
        colorScheme: "light",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 430 }}>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: GOLD,
            marginBottom: 30,
            textAlign: "center",
          }}
        >
          Fanometrix · Independent Football Intelligence
        </div>

        <div style={{ background: "#0F2233", borderRadius: 16, padding: "40px 38px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h1 style={{ fontFamily: SANS, fontSize: 23, fontWeight: 680, letterSpacing: "-0.02em", margin: "0 0 10px", color: "#fff", lineHeight: 1.25 }}>
            {title}
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.6)", margin: "0 0 28px" }}>
            {preparedFor ? `Prepared for ${preparedFor}. ` : ""}This report is confidential and password protected. Please
            enter the password that came with your link.
          </p>

          <form onSubmit={onSubmit}>
            <label
              htmlFor="report-password"
              style={{
                display: "block",
                fontFamily: SANS,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.5)",
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
                fontFamily: SANS,
                fontSize: 15,
                padding: "13px 14px",
                borderRadius: 9,
                border: `1px solid ${error ? "#C97B5A" : "rgba(255,255,255,0.16)"}`,
                outline: "none",
                marginBottom: 16,
                color: "#fff",
                background: "rgba(255,255,255,0.04)",
                boxSizing: "border-box",
              }}
            />

            {error && (
              <div
                role="alert"
                style={{
                  fontFamily: SANS,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "#F0C4B0",
                  background: "rgba(201,123,90,0.12)",
                  border: "1px solid rgba(201,123,90,0.3)",
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
                fontFamily: SANS,
                fontSize: 15,
                fontWeight: 600,
                padding: "14px 16px",
                borderRadius: 9,
                border: "none",
                background: busy || password.length === 0 ? "rgba(255,255,255,0.12)" : GOLD,
                color: busy || password.length === 0 ? "rgba(255,255,255,0.4)" : NAVY,
                cursor: busy || password.length === 0 ? "default" : "pointer",
                transition: "background 0.2s ease",
              }}
            >
              {busy ? "Opening…" : "Open report"}
            </button>
          </form>
        </div>

        <p
          style={{
            fontFamily: SANS,
            fontSize: 12,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.4)",
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
