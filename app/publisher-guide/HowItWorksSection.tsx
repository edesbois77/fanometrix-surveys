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

// Title height: longest title is 3 lines at 14px/1.3 ≈ 55px
const TITLE_HEIGHT = 58;
// Desc height: longest desc fits in 4 lines at 12px/1.6 ≈ 77px
const DESC_HEIGHT  = 80;
const CARD_W       = 160;

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
      <style>{`
        .fm-step-card {
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
          will-change: transform;
        }
        /* Extra padding-top on scroll wrapper ensures the lifted card top border stays visible */
        .fm-step-scroll {
          overflow-x: auto;
          overflow-y: visible;
          padding: 12px 0 8px;
        }
        .fm-step-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 40px rgba(11,25,41,0.12);
          border-color: ${G} !important;
        }
        .fm-step-num {
          transition: color 0.22s ease;
        }
        .fm-step-card:hover .fm-step-num {
          color: ${G} !important;
        }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: G, marginBottom: 12 }}>
            Process
          </p>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: N, marginBottom: 0, lineHeight: 1.2 }}>
            How it works
          </h2>
        </div>

        {/* Scroll wrapper — overflow-y: visible so lifted card border isn't clipped */}
        <div className="fm-step-scroll">
          <div
            ref={containerRef}
            style={{
              display: "flex",
              flexWrap: "nowrap",
              alignItems: "stretch",
              justifyContent: "center",
              gap: 0,
              minWidth: "max-content",
              padding: "0 16px", // breathing room so last card isn't clipped
            }}
          >
            {STEPS.map((step, i) => {
              const delay = i * 0.12;
              return (
                <div key={step.n} style={{ display: "flex", alignItems: "center" }}>

                  {/* Entry animation wrapper — overflow visible so border shows when card lifts */}
                  <div style={{
                    opacity:    visible ? 1 : 0,
                    transform:  visible ? "translateY(0)" : "translateY(20px)",
                    transition: `opacity 0.55s ease ${delay}s, transform 0.55s ease ${delay}s`,
                    overflow:   "visible",
                    display:    "flex",
                    height:     "100%",
                  }}>
                    <div
                      className="fm-step-card"
                      style={{
                        background:    "#fff",
                        border:        "1px solid #E5E7EB",
                        borderRadius:  16,
                        padding:       "22px 20px",
                        width:         CARD_W,
                        boxShadow:     "0 2px 8px rgba(11,25,41,0.05)",
                        display:       "flex",
                        flexDirection: "column",
                        boxSizing:     "border-box",
                      }}
                    >
                      {/* Step number */}
                      <p
                        className="fm-step-num"
                        style={{ fontSize: 11, fontWeight: 700, color: N, letterSpacing: "0.08em", marginBottom: 10, flexShrink: 0, textAlign: "center" }}
                      >
                        {step.n}
                      </p>

                      {/* Title — fixed height so all titles end at the same baseline */}
                      <div style={{ height: TITLE_HEIGHT, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "flex-start" }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: N, lineHeight: 1.35, margin: 0, textAlign: "center", width: "100%" }}>
                          {step.label}
                        </p>
                      </div>

                      {/* Divider */}
                      <div style={{ height: 1, background: "#F3F4F6", margin: "10px 0", flexShrink: 0 }} />

                      {/* Description — fixed height so all descriptions start at the same line */}
                      <div style={{ height: DESC_HEIGHT, overflow: "hidden" }}>
                        <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.6, margin: 0, textAlign: "center" }}>
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Connector */}
                  {i < STEPS.length - 1 && (
                    <div style={{
                      display:    "flex",
                      alignItems: "center",
                      flexShrink: 0,
                      opacity:    visible ? 1 : 0,
                      transition: `opacity 0.55s ease ${delay + 0.08}s`,
                    }}>
                      <div style={{ width: 10, height: 1.5, background: G, opacity: 0.5 }} />
                      <span style={{ color: G, fontSize: 24, lineHeight: 1, padding: "0 1px" }}>›</span>
                      <div style={{ width: 10, height: 1.5, background: G, opacity: 0.5 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Caption */}
        <p style={{ textAlign: "center", marginTop: 36, fontSize: 14, color: "#9CA3AF", fontStyle: "italic" }}>
          From deployment to insight generation in six simple steps.
        </p>
      </div>
    </section>
  );
}
