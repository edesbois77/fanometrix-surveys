"use client";

// ── Survey Studio — editorial report renderer (thin, dense, print-aware) ─────
// Renders a governed StudyReportDocument as a designed, paginated Fanometrix report. It
// reuses the premium report DESIGN TOKENS (navy/gold/ink/data hues) and the CSS-bar chart
// style, but with a compact, editorially-paged layout (one page per story) rather than the
// long-form consultancy shell — so a concise report reads like a designed deck, not a web
// page printed to PDF. It owns ALL layout/typography/print; it never receives a number the
// server did not build from governed evidence. No model layout, no CSS from the model.

import { NAVY, GOLD, INK, DATA } from "@/app/reports/theme";
import type { StudyReportDocument, EditorialPage, ReportModule, StatTile } from "@/lib/studio/report/report-document";

const num = (n: number) => n.toLocaleString();

export function StudioReportDocument({ doc }: { doc: StudyReportDocument }) {
  const showCover = doc.coverMode === "full";
  return (
    <div className="fx-report" style={{ background: INK.page, color: INK.primary, fontFamily: "var(--fx-sans, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)" }}>
      <style>{PRINT_CSS}</style>
      {showCover && <CoverPage doc={doc} />}
      {doc.pages.map((p, i) => (
        <Page key={i} page={p} first={i === 0 && !showCover} doc={doc} pageNo={i + 1 + (showCover ? 1 : 0)} total={doc.pages.length + (showCover ? 1 : 0)} />
      ))}
    </div>
  );
}

function CoverPage({ doc }: { doc: StudyReportDocument }) {
  return (
    <section className="fx-page fx-cover" style={{ background: NAVY, color: "#fff" }}>
      <div className="fx-page-inner" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100%" }}>
        <p style={{ color: GOLD, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 12, fontWeight: 600 }}>Fanometrix · Survey Studio</p>
        <h1 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 800, lineHeight: 1.08, margin: "16px 0 12px", letterSpacing: "-0.02em" }}>{doc.title}</h1>
        <p style={{ fontSize: 17, color: "rgba(255,255,255,0.82)", maxWidth: 620, lineHeight: 1.5 }}>{doc.objective}</p>
        <div style={{ marginTop: 28, display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Meta label="Completed responses" value={num(doc.meta.totalResponses)} />
          {doc.meta.markets.length > 0 && <Meta label={doc.meta.markets.length === 1 ? "Market" : "Markets"} value={String(doc.meta.markets.length)} />}
          <Meta label={doc.meta.surveys === 1 ? "Survey" : "Surveys"} value={String(doc.meta.surveys)} />
        </div>
      </div>
    </section>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return <div><div style={{ fontSize: 30, fontWeight: 800, color: GOLD, letterSpacing: "-0.02em" }}>{value}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div></div>;
}

function Page({ page, first, doc, pageNo, total }: { page: EditorialPage; first: boolean; doc: StudyReportDocument; pageNo: number; total: number }) {
  return (
    <section className="fx-page" style={{ background: "#fff" }}>
      <div className="fx-page-inner">
        {/* Compact title band on the first (executive) page when there is no full cover */}
        {first && doc.coverMode !== "full" && (
          <div className="fx-module" style={{ borderBottom: `2px solid ${GOLD}`, paddingBottom: 14, marginBottom: 22 }}>
            <p style={{ color: GOLD, textTransform: "uppercase", letterSpacing: "0.14em", fontSize: 11, fontWeight: 700 }}>Fanometrix · Survey Studio</p>
            <h1 style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)", fontWeight: 800, lineHeight: 1.1, margin: "4px 0 6px", color: NAVY, letterSpacing: "-0.02em" }}>{doc.title}</h1>
            <p style={{ fontSize: 13.5, color: INK.secondary, maxWidth: 640, lineHeight: 1.45 }}>{doc.objective}</p>
            <div style={{ marginTop: 12, display: "flex", gap: 22, flexWrap: "wrap" }}>
              <MiniMeta label="Responses" value={num(doc.meta.totalResponses)} />
              {doc.meta.markets.length > 0 && <MiniMeta label={doc.meta.markets.length === 1 ? "Market" : "Markets"} value={String(doc.meta.markets.length)} />}
              <MiniMeta label={doc.meta.surveys === 1 ? "Survey" : "Surveys"} value={String(doc.meta.surveys)} />
            </div>
          </div>
        )}

        <header className="fx-module" style={{ marginBottom: 18 }}>
          {(page.kicker || page.chapter) && (
            <p style={{ color: GOLD, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
              {page.chapter && <span style={{ color: INK.tertiary, marginRight: 8 }}>{page.chapter}</span>}{page.kicker}
            </p>
          )}
          <h2 style={{ fontSize: "clamp(1.4rem, 2.4vw, 1.95rem)", fontWeight: 800, lineHeight: 1.12, color: NAVY, letterSpacing: "-0.02em", margin: 0 }}>{page.headline}</h2>
          {page.interpretation && <p style={{ fontSize: 15, color: INK.secondary, lineHeight: 1.5, marginTop: 10, maxWidth: 660 }}>{page.interpretation}</p>}
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {page.modules.map((m, i) => <Module key={i} m={m} />)}
        </div>
      </div>
      <footer data-no-print={false} style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", fontSize: 10.5, color: INK.tertiary }}>Fanometrix · Survey Studio — page {pageNo} of {total}</footer>
    </section>
  );
}
function MiniMeta({ label, value }: { label: string; value: string }) {
  return <div><span style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{value}</span> <span style={{ fontSize: 11, color: INK.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span></div>;
}

// ── Evidence modules (governed data only) ────────────────────────────────────
function Module({ m }: { m: ReportModule }) {
  switch (m.kind) {
    case "hero-stat": return (
      <div className="fx-module" style={tile(true)}>
        <div style={{ fontSize: 56, fontWeight: 800, color: GOLD, lineHeight: 1, letterSpacing: "-0.03em" }}>{m.stat.value}</div>
        <div style={{ fontSize: 15, color: NAVY, fontWeight: 600, marginTop: 6 }}>{m.stat.label}</div>
        {m.stat.detail && <div style={{ fontSize: 12, color: INK.tertiary, marginTop: 2 }}>{m.stat.detail}</div>}
      </div>
    );
    case "key-numbers": return (
      <div className="fx-module" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(m.stats.length, 4)}, 1fr)`, gap: 12 }}>
        {m.stats.map((s, i) => <StatCard key={i} s={s} />)}
      </div>
    );
    case "distribution": return (
      <div className="fx-module" style={tile()}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{m.question} <span style={{ color: INK.tertiary, fontWeight: 400 }}>· n={num(m.n)}</span></div>
        {[...m.options].sort((a, b) => (m.ranked ? b.pct - a.pct : 0)).map((o, i) => <Bar key={i} label={o.label} pct={o.pct} sub={`${num(o.count)}`} highlight={o.highlight} />)}
        {m.note && <p style={{ fontSize: 12, color: INK.secondary, fontStyle: "italic", marginTop: 10, lineHeight: 1.4 }}>{m.note}</p>}
      </div>
    );
    case "audience-comparison": return (
      <div className="fx-module" style={tile()}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{m.caption}</div>
        {m.points.map((p, i) => p.pct != null
          ? <Bar key={i} label={p.label} pct={p.pct} highlight={i === 0} />
          : <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${INK.hairlineSoft}` }}><span style={{ fontSize: 13.5, color: NAVY, fontWeight: 600 }}>{p.label}</span><span style={{ fontSize: 13.5, color: INK.secondary }}>{p.value}</span></div>)}
      </div>
    );
    case "finding-callout": return (
      <div className="fx-module" style={{ ...tile(), borderLeft: `3px solid ${GOLD}` }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: NAVY }}>{m.title}</div>
        {m.body && <p style={{ fontSize: 13.5, color: INK.secondary, lineHeight: 1.5, marginTop: 5 }}>{m.body}</p>}
      </div>
    );
    case "insight-text": return <p className="fx-module" style={{ fontSize: 14.5, color: INK.secondary, lineHeight: 1.55 }}>{m.text}</p>;
    case "implications": return (
      <div className="fx-module">
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {m.items.map((t, i) => (
            <li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: NAVY, color: GOLD, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
              <span style={{ fontSize: 14.5, color: INK.primary, lineHeight: 1.45, paddingTop: 2 }}>{t}</span>
            </li>
          ))}
        </ol>
      </div>
    );
    case "bottom-line": return <div className="fx-module" style={{ background: NAVY, color: "#fff", padding: "16px 20px", borderRadius: 10, fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>{m.text}</div>;
    case "methodology": return (
      <div className="fx-module" style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${INK.hairline}` }}>
        <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: INK.tertiary, fontWeight: 700, marginBottom: 6 }}>About this study</p>
        {m.lines.map((l, i) => <p key={i} style={{ fontSize: 11.5, color: INK.tertiary, lineHeight: 1.5 }}>{l}</p>)}
      </div>
    );
    default: return null;
  }
}

function StatCard({ s }: { s: StatTile }) {
  return (
    <div style={tile()}>
      <div style={{ fontSize: 32, fontWeight: 800, color: s.emphasis ? GOLD : NAVY, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.value}</div>
      <div style={{ fontSize: 12.5, color: INK.secondary, marginTop: 5, lineHeight: 1.25 }}>{s.label}</div>
      {s.detail && <div style={{ fontSize: 11, color: INK.tertiary, marginTop: 2 }}>{s.detail}</div>}
    </div>
  );
}
function Bar({ label, pct, sub, highlight }: { label: string; pct: number; sub?: string; highlight?: boolean }) {
  return (
    <div style={{ padding: "5px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: NAVY, fontWeight: highlight ? 700 : 500 }}>{label}</span>
        <span style={{ fontSize: 13, color: INK.secondary, fontVariantNumeric: "tabular-nums" }}>{pct}%{sub ? <span style={{ color: INK.tertiary }}> · {sub}</span> : null}</span>
      </div>
      <div style={{ height: 9, borderRadius: 5, background: "#EEF1F4", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", borderRadius: 5, background: highlight ? GOLD : DATA.series1 }} />
      </div>
    </div>
  );
}
const tile = (hero = false): React.CSSProperties => ({ background: hero ? "#FBF8F1" : "#FBFBFC", border: `1px solid ${INK.hairlineSoft}`, borderRadius: 12, padding: hero ? 22 : 18 });

// A4 print discipline: fixed page box, atomic modules never split, chart bars keep colour.
const PRINT_CSS = `
.fx-report { --fx-page-w: 820px; }
.fx-report .fx-page { position: relative; max-width: var(--fx-page-w); margin: 0 auto 20px; box-shadow: 0 1px 3px rgba(11,25,41,0.08); border-radius: 4px; overflow: hidden; }
.fx-report .fx-page-inner { padding: 40px 48px 56px; }
.fx-report .fx-cover .fx-page-inner { min-height: 420px; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  [data-no-print="true"] { display: none !important; }
  .fx-report { background: #fff !important; }
  .fx-report .fx-page { max-width: none; width: 100%; min-height: 100vh; margin: 0; box-shadow: none; border-radius: 0; break-after: page; page-break-after: always; }
  .fx-report .fx-page:last-child { break-after: auto; page-break-after: auto; }
  .fx-report .fx-page-inner { padding: 16mm 15mm; }
  .fx-report .fx-module { break-inside: avoid; page-break-inside: avoid; }
  .fx-report h1, .fx-report h2, .fx-report header { break-after: avoid; page-break-after: avoid; }
}
`;
