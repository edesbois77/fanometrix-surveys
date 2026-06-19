"use client";

import { useEffect, useRef, useState } from "react";

const N = "#0B1929";
const G = "#D7B87A";

const STEPS = [
  { n: "01", label: "Create Campaign",               desc: "Admin creates a campaign with survey, publishers and targeting." },
  { n: "02", label: "Generate Deployment Tag",       desc: "A unique iframe or script tag is generated for the campaign." },
  { n: "03", label: "Publisher Traffics MPU",        desc: "Tag is trafficked as a standard HTML creative in your ad server." },
  { n: "04", label: "Anonymous Responses Collected", desc: "Fans complete the 3-question survey. No personal data is stored." },
  { n: "05", label: "Real-Time Reporting",           desc: "Responses appear in the Fanometrix dashboard immediately." },
  { n: "06", label: "Insights Shared",               desc: "Reports and benchmarks are shared with brands, publishers and partners." },
];

export function HowItWorksSection() {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" style={{ background: "#F9FAFB", padding: "80px 24px" }}>
      {/* Hover + step-number colour CSS */}
      <style>{`
        .fm-step-card {
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          will-change: transform;
        }
        .fm-step-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 48px rgba(11,25,41,0.13);
          border-color: ${G} !important;
        }
        .fm-step-num {
          transition: color 0.22s ease;
        }
        .fm-step-card:hover .fm-step-num {
          color: ${G} !important;
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: G, marginBottom: 12 }}>
            Process
          </p>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: N, marginBottom: 0, lineHeight: 1.2 }}>
            How it works
          </h2>
        </div>

        {/* Step cards + connectors */}
        <div
          ref={containerRef}
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 0 }}
        >
          {STEPS.map((step, i) => {
            const delay = i * 0.12;
            return (
              <div key={step.n} style={{ display: "flex", alignItems: "center" }}>

                {/* Entry animation wrapper */}
                <div style={{
                  opacity:   visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(22px)",
                  transition: `opacity 0.55s ease ${delay}s, transform 0.55s ease ${delay}s`,
                }}>
                  {/* Hover card */}
                  <div
                    className="fm-step-card"
                    style={{
                      background: "#fff",
                      border: "1px solid #E5E7EB",
                      borderRadius: 16,
                      padding: "24px 20px",
                      width: 158,
                      boxShadow: "0 2px 8px rgba(11,25,41,0.05)",
                    }}
                  >
                    <p
                      className="fm-step-num"
                      style={{ fontSize: 11, fontWeight: 700, color: N, letterSpacing: "0.08em", marginBottom: 10 }}
                    >
                      {step.n}
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: N, lineHeight: 1.3, marginBottom: 8 }}>
                      {step.label}
                    </p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>
                      {step.desc}
                    </p>
                  </div>
                </div>

                {/* Connector: gold line + enlarged arrow */}
                {i < STEPS.length - 1 && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                    opacity:   visible ? 1 : 0,
                    transition: `opacity 0.55s ease ${delay + 0.08}s`,
                  }}>
                    <div style={{ width: 12, height: 1.5, background: G, opacity: 0.55 }} />
                    <span style={{ color: G, fontSize: 24, lineHeight: 1, padding: "0 1px" }}>›</span>
                    <div style={{ width: 12, height: 1.5, background: G, opacity: 0.55 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Caption */}
        <p style={{
          textAlign: "center",
          marginTop: 40,
          fontSize: 14,
          color: "#9CA3AF",
          fontStyle: "italic",
          letterSpacing: "0.01em",
        }}>
          From deployment to insight generation in six simple steps.
        </p>
      </div>
    </section>
  );
}
