"use client";

// The closing philosophy panel — the report's full stop. The only inverted,
// centred section: a single belief, set large, with the Fanometrix signature.

import { GOLD, NAVY, SANS } from "@/app/reports/theme";
import type { ClosingSection } from "@/lib/reports/framework/types";
import { Reveal } from "./ui";

export function Closing({ section }: { section: ClosingSection }) {
  return (
    <section
      id={section.id}
      style={{
        background: NAVY,
        color: "#fff",
        paddingTop: "clamp(88px, 14vw, 200px)",
        paddingBottom: "clamp(88px, 14vw, 200px)",
        scrollMarginTop: 76,
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          paddingLeft: "clamp(24px, 6vw, 48px)",
          paddingRight: "clamp(24px, 6vw, 48px)",
          textAlign: "center",
        }}
      >
        <Reveal>
          <div className="gold-rule revealed" style={{ width: 56, margin: "0 auto 40px" }} />
          {section.opener && (
            <p
              style={{
                fontFamily: SANS,
                fontSize: "clamp(1.15rem, 2vw, 1.4rem)",
                lineHeight: 1.5,
                fontWeight: 500,
                color: "rgba(255,255,255,0.82)",
                margin: "0 0 22px",
              }}
            >
              {section.opener}
            </p>
          )}
          <p
            style={{
              fontFamily: SANS,
              fontSize: "clamp(1.7rem, 4vw, 2.9rem)",
              lineHeight: 1.28,
              letterSpacing: "-0.025em",
              fontWeight: 480,
              fontStyle: "italic",
              color: "#fff",
              margin: 0,
            }}
          >
            {section.belief}
          </p>
        </Reveal>

        {(section.signature || section.signatureLine) && (
          <Reveal>
            <div style={{ marginTop: "clamp(48px, 7vw, 80px)" }}>
              <div className="gold-rule revealed" style={{ width: 40, margin: "0 auto 24px", background: "rgba(215,184,122,0.6)" }} />
              {section.signature && (
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: GOLD,
                  }}
                >
                  {section.signature}
                </div>
              )}
              {section.signatureLine && (
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 13.5,
                    letterSpacing: "0.04em",
                    color: "rgba(255,255,255,0.55)",
                    marginTop: 10,
                    fontStyle: "italic",
                  }}
                >
                  {section.signatureLine}
                </div>
              )}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
