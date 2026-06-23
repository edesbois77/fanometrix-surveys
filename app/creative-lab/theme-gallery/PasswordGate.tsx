"use client";

import { useState, useEffect } from "react";

// Credentials — override via NEXT_PUBLIC_GALLERY_USERNAME / NEXT_PUBLIC_GALLERY_PASSWORD
// in your .env.local file. Defaults shown below.
const VALID_USER = process.env.NEXT_PUBLIC_GALLERY_USERNAME ?? "fanometrix";
const VALID_PASS = process.env.NEXT_PUBLIC_GALLERY_PASSWORD ?? "creative2025";
const SESSION_KEY = "tg_auth_v1";

const PAGE_BG = "#07101A";
const GOLD    = "#D7B87A";
const NAVY    = "#041B33";

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed]     = useState(false);
  const [ready, setReady]       = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1") {
      setAuthed(true);
    }
    setReady(true);
  }, []);

  if (!ready) return null;
  if (authed) return <>{children}</>;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    // Short artificial delay so it doesn't feel instant (brute-force feel)
    setTimeout(() => {
      if (username.trim() === VALID_USER && password === VALID_PASS) {
        sessionStorage.setItem(SESSION_KEY, "1");
        setAuthed(true);
      } else {
        setError("Incorrect username or password.");
      }
      setLoading(false);
    }, 400);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: PAGE_BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      padding: "24px",
    }}>
      {/* Card */}
      <div style={{
        width: "100%",
        maxWidth: 360,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid rgba(215,184,122,0.25)`,
        borderRadius: 16,
        padding: "32px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}>
        {/* Logo / badge */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 44, height: 44,
            background: `rgba(215,184,122,0.1)`,
            border: `1px solid rgba(215,184,122,0.3)`,
            borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>
            ◈
          </div>
          <div>
            <p style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 4px" }}>
              Fanometrix
            </p>
            <p style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Creative Lab
            </p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 10.5, margin: "4px 0 0", lineHeight: 1.5 }}>
              Survey creative gallery — restricted preview
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ color: "rgba(255,255,255,0.45)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid rgba(255,255,255,0.1)`,
                borderRadius: 8,
                color: "#fff",
                fontSize: 13,
                padding: "9px 12px",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(215,184,122,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ color: "rgba(255,255,255,0.45)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid rgba(255,255,255,0.1)`,
                borderRadius: 8,
                color: "#fff",
                fontSize: 13,
                padding: "9px 12px",
                outline: "none",
                fontFamily: "inherit",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(215,184,122,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
          </div>

          {error && (
            <p style={{ color: "#F87171", fontSize: 10.5, margin: 0, textAlign: "center" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "rgba(215,184,122,0.4)" : GOLD,
              border: "none",
              borderRadius: 8,
              color: NAVY,
              fontSize: 12,
              fontWeight: 700,
              padding: "11px",
              cursor: loading ? "default" : "pointer",
              letterSpacing: "0.04em",
              marginTop: 4,
              transition: "background 0.15s ease",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Checking…" : "Enter Creative Lab →"}
          </button>
        </form>

        <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 9, textAlign: "center", margin: 0, lineHeight: 1.6 }}>
          Prototype preview · Not for public distribution
        </p>
      </div>
    </div>
  );
}
