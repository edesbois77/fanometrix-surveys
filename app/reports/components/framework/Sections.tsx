"use client";

// The mid-report section modules. Each is a pure function of its typed config
// block and deliberately looks unlike its neighbours — the pacing (statement,
// stat wall, charts, ladder, quotes, cards, framework, timeline, table) is the
// point. All share the ui primitives so spacing, reveal motion and colour stay
// coherent.

import { NAVY, GOLD, INK, DATA, SANS } from "@/app/reports/theme";
import type {
  ProseSection,
  ExecutiveSummarySection,
  StatWallSection,
  SurveyEvidenceSection,
  FindingsLadderSection,
  InsightSection,
  BenchmarkSection,
  StrategyFrameworkSection,
  RecommendationsSection,
  MethodologySection,
  ImageSection,
  Stat,
} from "@/lib/reports/framework/types";
import { SectionBand, Container, SectionHead, Reveal, CountUp, ConfidenceBadge, Takeaway } from "./ui";
import { QuestionChart } from "./Charts";

/* ─────────────────────────────── Prose ──────────────────────────────────── */

export function Prose({ section }: { section: ProseSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "grey"} compact>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />
        {section.paragraphs?.map((p, i) => (
          <Reveal key={i}>
            <p
              style={{
                fontFamily: SANS,
                fontSize: "clamp(1.08rem, 1.6vw, 1.22rem)",
                lineHeight: 1.7,
                color: INK.secondary,
                margin: "22px 0 0",
              }}
            >
              {p}
            </p>
          </Reveal>
        ))}
      </Container>
    </SectionBand>
  );
}

/* ─────────────────────────── Executive summary ──────────────────────────── */

export function ExecutiveSummary({ section }: { section: ExecutiveSummarySection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "white"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} />
        <Reveal>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#9A7B3C",
              margin: "8px 0 18px",
            }}
          >
            {section.assessmentKicker ?? "Our assessment"}
          </div>
          <p
            style={{
              fontFamily: SANS,
              fontSize: "clamp(1.5rem, 3vw, 2.15rem)",
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              fontWeight: 480,
              color: INK.primary,
              margin: 0,
              maxWidth: 900,
            }}
          >
            {section.assessment}
          </p>
        </Reveal>

        <div
          className="fx-findings-grid"
          style={{ display: "grid", gap: "clamp(20px,3vw,34px)", marginTop: "clamp(40px,6vw,68px)" }}
        >
          {section.findings.map((f) => (
            <Reveal key={f.index}>
              <div style={{ display: "flex", gap: 18 }}>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 15,
                    fontWeight: 700,
                    color: GOLD,
                    lineHeight: 1.2,
                    paddingTop: 4,
                    minWidth: 26,
                  }}
                >
                  {f.index}
                </span>
                <div>
                  <h3
                    style={{
                      fontFamily: SANS,
                      fontSize: "clamp(1.1rem, 1.7vw, 1.28rem)",
                      lineHeight: 1.3,
                      letterSpacing: "-0.015em",
                      fontWeight: 600,
                      margin: 0,
                      color: INK.primary,
                    }}
                  >
                    {f.title}
                  </h3>
                  {f.body && (
                    <p style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 1.62, color: INK.secondary, margin: "9px 0 0" }}>
                      {f.body}
                    </p>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} />}
      </Container>
      <style>{`@media (min-width: 760px){ .fx-findings-grid{ grid-template-columns: 1fr 1fr; column-gap: clamp(34px,5vw,72px);} }`}</style>
    </SectionBand>
  );
}

/* ───────────────────────────── Stat wall ────────────────────────────────── */

function StatTile({ stat, big }: { stat: Stat; big?: boolean }) {
  return (
    <div
      className="stat-entrance"
      style={{
        background: "#FFFFFF",
        border: `1px solid ${INK.hairline}`,
        borderRadius: 12,
        padding: big ? "28px 28px 26px" : "22px 22px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: big ? 168 : 140,
      }}
    >
      <div
        style={{
          fontFamily: SANS,
          fontSize: big ? "clamp(2.6rem, 5vw, 3.6rem)" : "clamp(2rem, 3.4vw, 2.6rem)",
          lineHeight: 1,
          letterSpacing: "-0.03em",
          fontWeight: 660,
          color: NAVY,
        }}
      >
        {stat.countTo != null ? (
          <CountUp to={stat.countTo} prefix={stat.prefix} suffix={stat.suffix} />
        ) : (
          stat.value
        )}
      </div>
      <div style={{ marginTop: "auto" }}>
        <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: INK.primary, lineHeight: 1.3 }}>
          {stat.label}
        </div>
        {stat.detail && (
          <div style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5, color: INK.secondary, marginTop: 5 }}>
            {stat.detail}
          </div>
        )}
        {stat.source && (
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: INK.tertiary, marginTop: 8, letterSpacing: "0.01em" }}>
            {stat.source}
          </div>
        )}
      </div>
      <span aria-hidden style={{ height: 2, width: 32, background: GOLD, borderRadius: 2, marginTop: 12 }} />
    </div>
  );
}

export function StatWall({ section }: { section: StatWallSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "grey"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />
        {section.paragraphs && section.paragraphs.length > 0 && (
          <div style={{ marginTop: "clamp(24px,3vw,36px)" }}>
            {section.paragraphs.map((p, i) => (
              <Reveal key={i}>
                <p style={{ fontFamily: SANS, fontSize: "clamp(1.08rem, 1.6vw, 1.28rem)", lineHeight: 1.62, color: INK.secondary, margin: i === 0 ? 0 : "20px 0 0" }}>
                  {p}
                </p>
              </Reveal>
            ))}
          </div>
        )}
        <Reveal stagger className="fx-stat-grid" style={{ marginTop: "clamp(40px,6vw,64px)" }}>
          {section.stats.map((s, i) => (
            <StatTile key={i} stat={s} big={s.emphasis} />
          ))}
        </Reveal>

        {section.contextStats && section.contextStats.length > 0 && (
          <div style={{ marginTop: "clamp(40px,6vw,64px)" }}>
            {section.contextHeading && (
              <Reveal>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: INK.tertiary,
                    marginBottom: 22,
                  }}
                >
                  {section.contextHeading}
                </div>
              </Reveal>
            )}
            <Reveal stagger className="fx-stat-grid">
              {section.contextStats.map((s, i) => (
                <StatTile key={i} stat={s} />
              ))}
            </Reveal>
          </div>
        )}

        {section.callout && (
          <Reveal style={{ marginTop: "clamp(40px,6vw,64px)" }}>
            <div
              style={{
                background: "#FFFFFF",
                border: `1px solid ${INK.hairline}`,
                borderLeft: `3px solid ${GOLD}`,
                borderRadius: 12,
                padding: "clamp(26px,3.5vw,40px)",
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#9A7B3C",
                  marginBottom: 18,
                }}
              >
                {section.callout.label ?? "Why this matters"}
              </div>
              {section.callout.paragraphs.map((p, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: SANS,
                    fontSize: "clamp(1rem,1.4vw,1.12rem)",
                    lineHeight: 1.68,
                    color: INK.secondary,
                    margin: i === 0 ? 0 : "16px 0 0",
                  }}
                >
                  {p}
                </p>
              ))}
            </div>
          </Reveal>
        )}
      </Container>
      <style>{`
        .fx-stat-grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media (min-width:720px){ .fx-stat-grid{ grid-template-columns:repeat(3,1fr);} }
      `}</style>
    </SectionBand>
  );
}

/* ─────────────────────────── Survey evidence ────────────────────────────── */

export function SurveyEvidence({ section }: { section: SurveyEvidenceSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "white"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />
        {section.sampleNote && (
          <Reveal>
            <p style={{ fontFamily: SANS, fontSize: 13.5, color: INK.tertiary, margin: "14px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
              {section.sampleNote}
            </p>
          </Reveal>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(48px,7vw,84px)", marginTop: "clamp(40px,6vw,60px)" }}>
          {section.questions.map((q) => (
            <Reveal key={q.id}>
              <QuestionChart question={q} />
            </Reveal>
          ))}
        </div>
        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} />}
      </Container>
    </SectionBand>
  );
}

/* ─────────────────────────── Findings ladder ────────────────────────────── */

export function FindingsLadder({ section }: { section: FindingsLadderSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "grey"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />
        {section.paragraphs?.map((p, i) => (
          <Reveal key={i}>
            <p style={{ fontFamily: SANS, fontSize: "clamp(1.08rem, 1.6vw, 1.28rem)", lineHeight: 1.62, color: INK.secondary, margin: "20px 0 0" }}>
              {p}
            </p>
          </Reveal>
        ))}
        <div style={{ marginTop: "clamp(36px,5vw,56px)", borderTop: `1px solid ${INK.hairline}` }}>
          {section.findings.map((f) => (
            <Reveal key={f.index}>
              <div
                className="fx-ladder-row"
                style={{
                  display: "grid",
                  gap: "6px 22px",
                  alignItems: "start",
                  padding: "clamp(20px,3vw,30px) 0",
                  borderBottom: `1px solid ${INK.hairline}`,
                }}
              >
                <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: GOLD, paddingTop: 3 }}>{f.index}</span>
                <div>
                  <h3
                    style={{
                      fontFamily: SANS,
                      fontSize: "clamp(1.2rem, 2vw, 1.5rem)",
                      lineHeight: 1.28,
                      letterSpacing: "-0.02em",
                      fontWeight: 600,
                      margin: 0,
                      color: INK.primary,
                    }}
                  >
                    {f.title}
                  </h3>
                  {f.body && (
                    <p style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.62, color: INK.secondary, margin: "10px 0 0", maxWidth: 640 }}>
                      {f.body}
                    </p>
                  )}
                  {f.supportedBy && f.supportedBy.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 0" }}>
                      {f.supportedBy.map((s, si) => {
                        const chip: React.CSSProperties = {
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontFamily: SANS,
                          fontSize: 12,
                          fontWeight: 500,
                          color: INK.secondary,
                          background: INK.page,
                          border: `1px solid ${INK.hairline}`,
                          borderRadius: 999,
                          padding: "4px 11px",
                        };
                        return s.url ? (
                          <a
                            key={si}
                            className="fx-evi"
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={chip}
                          >
                            {s.label}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.5, flexShrink: 0 }}>
                              <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </a>
                        ) : (
                          <span key={si} style={chip}>
                            {s.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {f.implication && (
                    <div style={{ display: "flex", gap: 12, margin: "16px 0 0", maxWidth: 640 }}>
                      <span aria-hidden style={{ flexShrink: 0, width: 3, alignSelf: "stretch", background: GOLD, borderRadius: 2 }} />
                      <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.55, color: INK.primary, margin: 0 }}>
                        <span style={{ fontWeight: 600 }}>Strategic implication.</span> {f.implication}
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ justifySelf: "start", paddingTop: 4 }}>
                  {f.confidence && f.confidenceLabel && (
                    <ConfidenceBadge confidence={f.confidence} label={f.confidenceLabel} />
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} />}
      </Container>
      <style>{`
        .fx-ladder-row{ grid-template-columns: 34px 1fr; }
        @media (min-width:760px){ .fx-ladder-row{ grid-template-columns: 44px 1fr auto; } }
        .fx-evi{ text-decoration: none; cursor: pointer; transition: color .2s ease, border-color .2s ease, background .2s ease; }
        .fx-evi:hover{ color: #9A7B3C; border-color: rgba(215,184,122,0.6); background: #FBF3E1; }
      `}</style>
    </SectionBand>
  );
}

/* ──────────────────────────────── Insight ───────────────────────────────── */

export function Insight({ section }: { section: InsightSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "white"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />

        {section.callouts && section.callouts.length > 0 && (
          <div className="fx-callout-grid" style={{ display: "grid", gap: "clamp(28px,3vw,40px) 40px", marginTop: "clamp(40px,5vw,60px)" }}>
            {section.callouts.map((c, i) => (
              <Reveal key={i}>
                <div style={{ height: "100%", paddingLeft: 22, borderLeft: `2px solid ${GOLD}` }}>
                  {c.metric ? (
                    <div style={{ fontFamily: SANS, fontSize: "clamp(2.4rem,4vw,3.2rem)", fontWeight: 660, letterSpacing: "-0.03em", lineHeight: 1, color: NAVY, marginBottom: 14 }}>
                      {c.metric}
                    </div>
                  ) : c.overline ? (
                    <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9A7B3C", marginBottom: 12 }}>
                      {c.overline}
                    </div>
                  ) : null}
                  <h3 style={{ fontFamily: SANS, fontSize: "clamp(1.1rem,1.7vw,1.28rem)", fontWeight: 640, letterSpacing: "-0.015em", margin: 0, color: INK.primary, lineHeight: 1.3 }}>
                    {c.title}
                  </h3>
                  <p style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 1.64, color: INK.secondary, margin: "12px 0 0" }}>
                    {c.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        )}

        {section.quotes && section.quotes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: "clamp(44px,6vw,72px)" }}>
            {section.quotes.map((q, i) => (
              <Reveal key={i}>
                <figure
                  style={{
                    margin: 0,
                    background: NAVY,
                    borderRadius: 16,
                    padding: "clamp(30px,4vw,52px)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -18,
                      left: 24,
                      fontFamily: "Georgia, serif",
                      fontSize: 140,
                      lineHeight: 1,
                      color: "rgba(215,184,122,0.16)",
                      pointerEvents: "none",
                    }}
                  >
                    “
                  </span>
                  <blockquote
                    style={{
                      fontFamily: SANS,
                      fontSize: "clamp(1.4rem, 2.8vw, 2rem)",
                      lineHeight: 1.34,
                      letterSpacing: "-0.02em",
                      fontWeight: 460,
                      color: "#FFFFFF",
                      margin: 0,
                      position: "relative",
                      maxWidth: 780,
                    }}
                  >
                    {q.text}
                  </blockquote>
                  {(q.attribution || q.context) && (
                    <figcaption
                      style={{
                        fontFamily: SANS,
                        fontSize: 13.5,
                        letterSpacing: "0.04em",
                        color: GOLD,
                        marginTop: 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span aria-hidden style={{ width: 22, height: 1, background: "rgba(215,184,122,0.6)" }} />
                      {q.attribution}
                      {q.attribution && q.context ? " · " : ""}
                      {q.context}
                    </figcaption>
                  )}
                </figure>
              </Reveal>
            ))}
          </div>
        )}
        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} />}
      </Container>
      <style>{`@media (min-width:720px){ .fx-callout-grid{ grid-template-columns:1fr 1fr; column-gap:40px; row-gap:34px;} }`}</style>
    </SectionBand>
  );
}

/* ────────────────────────────── Benchmark ───────────────────────────────── */

const BENCH_TONE = {
  positive: { line: "#4E9A6B", label: "#3F5D42" },
  neutral: { line: DATA.series1, label: "#2E4C74" },
  caution: { line: "#C08A3E", label: "#8A6320" },
} as const;

export function Benchmark({ section }: { section: BenchmarkSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "grey"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />
        <Reveal stagger className="fx-bench-grid" style={{ marginTop: "clamp(36px,5vw,56px)" }}>
          {section.benchmarks.map((b, i) => {
            const tone = BENCH_TONE[b.tone ?? "neutral"];
            return (
              <div
                key={i}
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${INK.hairline}`,
                  borderTop: `3px solid ${tone.line}`,
                  borderRadius: 12,
                  padding: "24px 24px 26px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 680, letterSpacing: "-0.015em", color: NAVY }}>
                  {b.name}
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: tone.label,
                    margin: "6px 0 14px",
                  }}
                >
                  {b.tag}
                </div>
                <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6, color: INK.secondary, margin: 0 }}>{b.body}</p>
                {b.metric && (
                  <div style={{ marginTop: "auto", paddingTop: 20 }}>
                    <div style={{ fontFamily: SANS, fontSize: "clamp(1.5rem,2.4vw,1.9rem)", fontWeight: 660, color: NAVY, letterSpacing: "-0.02em" }}>
                      {b.metric}
                    </div>
                    {b.metricLabel && (
                      <div style={{ fontFamily: SANS, fontSize: 13, color: INK.tertiary, marginTop: 3 }}>{b.metricLabel}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Reveal>
        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} />}
      </Container>
      <style>{`
        .fx-bench-grid{ display:grid; grid-template-columns:1fr; gap:18px; }
        @media (min-width:720px){ .fx-bench-grid{ grid-template-columns:repeat(3,1fr);} }
      `}</style>
    </SectionBand>
  );
}

/* ────────────────────────── Strategy framework ──────────────────────────── */

export function StrategyFramework({ section }: { section: StrategyFrameworkSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "navy"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} invert />

        {section.frameworkName && (
          <Reveal>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: GOLD,
                textAlign: "center",
                margin: "clamp(44px,6vw,72px) 0 6px",
              }}
            >
              {section.frameworkName}
            </div>
          </Reveal>
        )}

        {/* Connected framework: engine + amplifier flowing into the lead track. */}
        {section.tracks && section.tracks.length > 0 && (
          <Reveal>
            <div className="fx-strategy" style={{ position: "relative", marginTop: 28 }}>
              <div aria-hidden className="fx-strategy-spine" />
              <div className="fx-strategy-grid">
                {section.tracks.map((t) => (
                  <div key={t.key} className={`fx-track${t.lead ? " fx-track-lead" : ""}`}>
                    <div className="fx-track-badge" style={{ background: t.lead ? GOLD : "rgba(255,255,255,0.07)", color: t.lead ? NAVY : "#fff", boxShadow: `0 0 0 8px ${NAVY}` }}>
                      {t.key}
                    </div>
                    <div className="fx-track-role" style={{ color: t.lead ? GOLD : "rgba(255,255,255,0.5)" }}>
                      {t.role}
                    </div>
                    <div className="fx-track-label" style={{ color: t.lead ? "#fff" : "rgba(255,255,255,0.82)" }}>
                      {t.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {section.statement && (
          <Reveal>
            <div style={{ textAlign: "center", margin: "clamp(48px,6vw,80px) auto 0", maxWidth: 760 }}>
              <div className="gold-rule revealed" style={{ width: 44, margin: "0 auto 26px" }} />
              <p
                style={{
                  fontFamily: SANS,
                  fontSize: "clamp(1.35rem,2.6vw,1.85rem)",
                  lineHeight: 1.36,
                  letterSpacing: "-0.02em",
                  fontStyle: "italic",
                  fontWeight: 460,
                  color: "#fff",
                  margin: 0,
                }}
              >
                {section.statement}
              </p>
            </div>
          </Reveal>
        )}

        {section.principles && section.principles.length > 0 && (
          <div
            className="fx-principle-grid"
            style={{ display: "grid", gap: "clamp(32px,4vw,52px) clamp(36px,5vw,64px)", marginTop: section.tracks?.length || section.statement ? "clamp(48px,7vw,88px)" : "clamp(40px,5vw,60px)" }}
          >
            {section.principles.map((p) => (
              <Reveal key={p.index}>
                <div style={{ height: "100%", display: "flex", gap: 20 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: "clamp(1.6rem,2.4vw,2rem)", fontWeight: 300, color: GOLD, lineHeight: 1, letterSpacing: "-0.02em" }}>
                      {p.index}
                    </div>
                    <div className="gold-rule revealed" style={{ width: 22, marginTop: 14 }} />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: SANS, fontSize: "clamp(1.2rem,1.9vw,1.45rem)", fontWeight: 640, letterSpacing: "-0.02em", color: "#fff", margin: 0, lineHeight: 1.25 }}>
                      {p.title}
                    </h3>
                    <p style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 1.64, color: "rgba(255,255,255,0.66)", margin: "12px 0 0" }}>
                      {p.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}
        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} invert />}
      </Container>
      <style>{`
        .fx-strategy-spine { display: none; }
        .fx-strategy-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .fx-track {
          text-align: center; padding: 26px 22px 28px; border-radius: 16px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
        }
        .fx-track-lead {
          background: rgba(215,184,122,0.10); border-color: rgba(215,184,122,0.42);
        }
        .fx-track-badge {
          width: 52px; height: 52px; border-radius: 13px; display: grid; place-items: center;
          font-family: ${SANS}; font-size: 23px; font-weight: 700; margin: 0 auto 18px; position: relative;
        }
        .fx-track-role {
          font-family: ${SANS}; font-size: 11px; font-weight: 600; letter-spacing: 0.14em;
          text-transform: uppercase; margin-bottom: 10px;
        }
        .fx-track-label { font-family: ${SANS}; font-size: 15.5px; line-height: 1.45; font-weight: 500; max-width: 260px; margin: 0 auto; }
        @media (min-width: 820px) {
          .fx-strategy-grid { grid-template-columns: repeat(3, 1fr); gap: 22px; align-items: start; }
          .fx-strategy-spine {
            display: block; position: absolute; top: 52px; left: 12%; right: 12%; height: 2px;
            background: linear-gradient(to right, rgba(255,255,255,0.14), rgba(215,184,122,0.5), rgba(255,255,255,0.14));
          }
          .fx-track { padding: 30px 26px 32px; }
          .fx-track-lead { transform: translateY(-14px); box-shadow: 0 24px 60px rgba(0,0,0,0.28); }
        }
        .fx-principle-grid { grid-template-columns: 1fr; }
        @media (min-width: 760px) { .fx-principle-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </SectionBand>
  );
}

/* ────────────────────────── Recommendations ─────────────────────────────── */

export function Recommendations({ section }: { section: RecommendationsSection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "white"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />
        {section.paragraphs?.map((p, i) => (
          <Reveal key={i}>
            <p style={{ fontFamily: SANS, fontSize: "clamp(1.08rem, 1.6vw, 1.28rem)", lineHeight: 1.62, color: INK.secondary, margin: "20px 0 0" }}>
              {p}
            </p>
          </Reveal>
        ))}
        {section.caveat && (
          <Reveal>
            <p
              style={{
                fontFamily: SANS,
                fontSize: 14.5,
                lineHeight: 1.62,
                fontStyle: "italic",
                color: INK.secondary,
                margin: "clamp(28px,4vw,40px) 0 0",
                paddingLeft: 20,
                borderLeft: `3px solid ${GOLD}`,
                maxWidth: 820,
              }}
            >
              {section.caveat}
            </p>
          </Reveal>
        )}
        <div style={{ position: "relative", marginTop: "clamp(40px,6vw,64px)" }}>
          {/* vertical spine */}
          <div
            aria-hidden
            style={{ position: "absolute", left: 15, top: 8, bottom: 8, width: 2, background: INK.hairline }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(26px,4vw,40px)" }}>
            {section.recommendations.map((r) => (
              <Reveal key={r.index}>
                <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 22, alignItems: "start" }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      background: NAVY,
                      color: "#fff",
                      fontFamily: SANS,
                      fontSize: 13,
                      fontWeight: 680,
                      display: "grid",
                      placeItems: "center",
                      position: "relative",
                      zIndex: 1,
                      boxShadow: `0 0 0 4px ${INK.surface === "#FFFFFF" ? "#FFFFFF" : INK.paper}`,
                    }}
                  >
                    {r.index}
                  </span>
                  <div style={{ paddingTop: 3 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                      <h3
                        style={{
                          fontFamily: SANS,
                          fontSize: "clamp(1.15rem,1.9vw,1.4rem)",
                          fontWeight: 620,
                          letterSpacing: "-0.015em",
                          margin: 0,
                          color: INK.primary,
                        }}
                      >
                        {r.title}
                      </h3>
                      {r.horizon && (
                        <span
                          style={{
                            fontFamily: SANS,
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "#9A7B3C",
                            background: "#FBF3E1",
                            borderRadius: 999,
                            padding: "2px 9px",
                          }}
                        >
                          {r.horizon}
                        </span>
                      )}
                    </div>
                    {r.body && (
                      <p style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.62, color: INK.secondary, margin: "9px 0 0", maxWidth: 640 }}>
                        {r.body}
                      </p>
                    )}
                    {r.hypothesis && (
                      <p style={{ fontFamily: SANS, fontSize: 16, lineHeight: 1.62, color: INK.secondary, margin: "9px 0 0", maxWidth: 640 }}>
                        <span style={{ fontWeight: 640, color: INK.primary }}>Hypothesis.</span> {r.hypothesis}
                      </p>
                    )}
                    {r.supports && (
                      <p style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.55, color: INK.tertiary, margin: "12px 0 0", maxWidth: 640 }}>
                        <span style={{ fontWeight: 600, color: "#9A7B3C" }}>Supports:</span> {r.supports}
                      </p>
                    )}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {section.phase2 && (
          <Reveal>
            <div
              style={{
                background: NAVY,
                borderRadius: 16,
                padding: "clamp(30px,4vw,52px)",
                marginTop: "clamp(48px,7vw,88px)",
                boxShadow: "0 30px 80px rgba(11,25,41,0.16)",
              }}
            >
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, marginBottom: 18 }}>
                {section.phase2.label ?? "Phase 2 Research Recommendation"}
              </div>
              <p style={{ fontFamily: SANS, fontSize: "clamp(1.15rem,1.8vw,1.4rem)", lineHeight: 1.5, fontWeight: 460, color: "#fff", margin: 0, maxWidth: 760 }}>
                {section.phase2.intro}
              </p>
              <div className="fx-phase2-grid" style={{ display: "grid", gap: "12px 32px", margin: "clamp(28px,4vw,40px) 0 0" }}>
                {section.phase2.dimensions.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span aria-hidden style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 999, background: GOLD, transform: "translateY(-2px)" }} />
                    <span style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.45, color: "rgba(255,255,255,0.82)" }}>{d}</span>
                  </div>
                ))}
              </div>
              {section.phase2.objective && (
                <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6, fontStyle: "italic", color: "rgba(255,255,255,0.62)", margin: "clamp(28px,4vw,40px) 0 0", paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.12)", maxWidth: 760 }}>
                  {section.phase2.objective}
                </p>
              )}
            </div>
          </Reveal>
        )}

        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} />}
      </Container>
      <style>{`
        .fx-phase2-grid { grid-template-columns: 1fr; }
        @media (min-width: 620px) { .fx-phase2-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </SectionBand>
  );
}

/* ─────────────────────────── Editorial image band ───────────────────────── */

// A designed navy "atmosphere" is always painted as the base, so the band is
// premium even before photography is supplied. When `src` is set, the photo
// layers over it under a navy scrim that keeps overlaid type legible.
const ATMOSPHERE =
  `radial-gradient(120% 100% at 78% 12%, rgba(215,184,122,0.16) 0%, rgba(215,184,122,0) 46%),` +
  `radial-gradient(90% 120% at 10% 100%, rgba(41,84,128,0.55) 0%, rgba(11,25,41,0) 55%),` +
  `linear-gradient(115deg, #0B1929 0%, #10263B 50%, #0B1929 100%)`;

// A vertical navy scrim keeps overlaid type legible over any photo. `bottom` is
// the darkness where the text sits; the top stays lighter so the image reads.
function scrim(bottom: number) {
  const top = Math.min(1, Math.max(0, bottom - 0.28));
  const mid = Math.min(1, Math.max(0, bottom - 0.18));
  return `linear-gradient(180deg, rgba(11,25,41,${top}) 0%, rgba(11,25,41,${mid}) 42%, rgba(11,25,41,${bottom}) 100%)`;
}

export function ImageBand({ section }: { section: ImageSection }) {
  const tall = section.height === "tall";
  const SCRIM = scrim(section.scrim ?? 0.72);
  return (
    <section
      id={section.id}
      style={{
        position: "relative",
        minHeight: tall ? "clamp(440px, 68vh, 720px)" : "clamp(300px, 44vh, 500px)",
        display: "flex",
        alignItems: "flex-end",
        overflow: "hidden",
        background: ATMOSPHERE,
        scrollMarginTop: 76,
      }}
    >
      {section.src && (
        <div
          aria-hidden
          role={section.alt ? "img" : undefined}
          aria-label={section.alt}
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `${SCRIM}, url("${section.src}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {/* Faint motion lines — evoke movement/logistics; hidden if a photo is set. */}
      {!section.src && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 46px)",
            maskImage: "linear-gradient(to right, transparent, black 30%, black 80%, transparent)",
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 1240,
          margin: "0 auto",
          padding: "clamp(32px,5vw,64px) clamp(20px,5vw,40px)",
        }}
      >
        <Reveal>
          {section.overline && (
            <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD, marginBottom: 14 }}>
              {section.overline}
            </div>
          )}
          {section.headline && (
            <h2
              style={{
                fontFamily: SANS,
                fontSize: "clamp(1.55rem, 3vw, 2.5rem)",
                lineHeight: 1.16,
                letterSpacing: "-0.025em",
                fontWeight: 560,
                color: "#fff",
                margin: 0,
                maxWidth: 820,
                textWrap: "balance",
              }}
            >
              {section.headline}
            </h2>
          )}
          {section.caption && (
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 18, letterSpacing: "0.02em" }}>
              {section.caption}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────────── Methodology ──────────────────────────────── */

const CONFIDENCE_PILL: Record<string, { ink: string; wash: string }> = {
  high: { ink: "#3F5D42", wash: "#EEF3EC" },
  medium: { ink: "#3B5A8A", wash: "#EEF3FB" },
  low: { ink: "#6B6459", wash: "#F4F2EE" },
};

export function Methodology({ section }: { section: MethodologySection }) {
  return (
    <SectionBand id={section.id} tone={section.tone ?? "grey"}>
      <Container size="wide">
        <SectionHead chapter={section.chapter} kicker={section.kicker} title={section.heading} lede={section.lede} />
        {section.paragraphs?.map((p, i) => (
          <Reveal key={i}>
            <p style={{ fontFamily: SANS, fontSize: "clamp(1.08rem, 1.6vw, 1.28rem)", lineHeight: 1.62, color: INK.secondary, margin: "18px 0 0" }}>
              {p}
            </p>
          </Reveal>
        ))}

        {section.sources && section.sources.length > 0 && (
          <div className="fx-source-grid" style={{ display: "grid", gap: "clamp(26px,3vw,36px) clamp(36px,5vw,56px)", marginTop: "clamp(40px,5vw,60px)" }}>
            {section.sources.map((s, i) => (
              <Reveal key={i}>
                <div style={{ borderTop: `1px solid ${INK.hairline}`, paddingTop: 18 }}>
                  <h3 style={{ fontFamily: SANS, fontSize: 16, fontWeight: 640, letterSpacing: "-0.01em", color: INK.primary, margin: 0 }}>
                    {s.title}
                  </h3>
                  <p style={{ fontFamily: SANS, fontSize: 14.5, lineHeight: 1.62, color: INK.secondary, margin: "10px 0 0" }}>
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        )}

        {section.rows && section.rows.length > 0 && (
          <Reveal style={{ marginTop: "clamp(44px,6vw,72px)" }}>
            {section.confidenceHeading && (
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: INK.tertiary,
                  marginBottom: 18,
                }}
              >
                {section.confidenceHeading}
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    {["Evidence source", "Confidence", "Basis for confidence"].map((h) => (
                      <th
                        key={h}
                        style={{
                          fontFamily: SANS,
                          fontSize: 11.5,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: INK.tertiary,
                          textAlign: "left",
                          padding: "0 16px 12px 0",
                          borderBottom: `1px solid ${INK.hairline}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((r, i) => {
                    const pill = CONFIDENCE_PILL[r.tone ?? "high"] ?? CONFIDENCE_PILL.high;
                    return (
                      <tr key={i}>
                        <td style={{ ...tdStyle(true), width: "26%" }}>{r.source}</td>
                        <td style={tdStyle()}>
                          <span
                            style={{
                              fontFamily: SANS,
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: pill.ink,
                              background: pill.wash,
                              borderRadius: 999,
                              padding: "3px 12px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.confidence}
                          </span>
                        </td>
                        <td style={tdStyle()}>{r.basis}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {section.confidenceNote && (
              <p style={{ fontFamily: SANS, fontSize: 12.5, fontStyle: "italic", lineHeight: 1.55, color: INK.tertiary, margin: "18px 0 0", maxWidth: 720 }}>
                {section.confidenceNote}
              </p>
            )}
          </Reveal>
        )}
        {section.takeaway && <Takeaway label={section.takeaway.label} text={section.takeaway.text} />}
      </Container>
      <style>{`.fx-source-grid { grid-template-columns: 1fr; } @media (min-width: 720px) { .fx-source-grid { grid-template-columns: 1fr 1fr; } }`}</style>
    </SectionBand>
  );
}

function tdStyle(primary = false): React.CSSProperties {
  return {
    fontFamily: SANS,
    fontSize: 14.5,
    lineHeight: 1.5,
    fontWeight: primary ? 560 : 400,
    color: primary ? INK.primary : INK.secondary,
    padding: "15px 16px 15px 0",
    borderBottom: `1px solid ${INK.hairlineSoft}`,
    verticalAlign: "top",
  };
}
