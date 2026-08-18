"use client";

// ── Survey Studio — Evidence & Opportunity page renderer (Slice B, Page 2) ───
// The SAME locked Broadsheet + infographic design language as Page 1 (Slice A.4), composed as a
// dense EVIDENCE GRID rather than a single hero: multiple governed stories (how the picture
// varies + the opportunity) on one A4 page. It renders ONE governed `EvidenceReportDocument` and
// owns ALL layout/typography/print; it receives only server-built governed values. The segment
// module is dimension-agnostic (market / age / gender / wave / …) — nothing is special-cased.

import { NAVY, GOLD, INK } from "@/app/reports/theme";
import type { EvidenceReportDocument, EvidenceModule, SegmentComparisonModule, RankedDistributionModule } from "@/lib/studio/report/evidence-page";

const DISP = 'var(--fx-disp, "Helvetica Neue Condensed", "HelveticaNeue-CondensedBold", "Arial Narrow", "Roboto Condensed", Arial, system-ui, sans-serif)';
const BODY = 'var(--fx-sans, "Helvetica Neue", Arial, system-ui, -apple-system, "Segoe UI", sans-serif)';
const SLATE = "#4A5563";
const GREY = "#68727F";
const HAIR = "#E7E4DC";
const TRACK = "#ECEAE3";
const PAPER = "#FCFBF8";

export function EvidenceReportPage({ doc }: { doc: EvidenceReportDocument }) {
  const single = doc.modules.length <= 1;
  return (
    <div className="fx-ev" style={{ background: "#EDEBE4", color: NAVY, fontFamily: BODY }}>
      <style>{CSS}</style>
      <section className="fx-ev-page">
        <div className="fx-ev-inner">
          <header className="fx-ev-mast">
            <span className="fx-ev-brand">{doc.masthead.brand}</span>
            <span className="fx-ev-kick">{doc.masthead.kicker}</span>
          </header>

          <p className="fx-ev-eyebrow">{doc.eyebrow}</p>
          <h1 className="fx-ev-h1">{doc.headline}</h1>
          <p className="fx-ev-intro">{doc.intro}</p>

          <div className="fx-ev-grid" style={{ gridTemplateColumns: single ? "1fr" : "1fr 1fr" }}>
            {doc.modules.map((m, i) => <Module key={i} m={m} />)}
          </div>

          {doc.implications.length > 0 && (
            <div className="fx-ev-means">
              <span className="fx-ev-sec">What this means</span>
              <ol className="fx-ev-imps">
                {doc.implications.map((t, i) => (
                  <li key={i}><span className="fx-ev-imp-n">{i + 1}</span><span className="fx-ev-imp-t">{t}</span></li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <footer className="fx-ev-foot">
          <span className="fx-ev-tag">{doc.footerTagline}</span>
          <span className="fx-ev-meth">{doc.methodology}</span>
        </footer>
      </section>
    </div>
  );
}

function Module({ m }: { m: EvidenceModule }) {
  return m.kind === "segment-comparison" ? <Segment m={m} /> : <Ranked m={m} />;
}

function Segment({ m }: { m: SegmentComparisonModule }) {
  const hasBars = m.mode !== "leaders" && m.points.some((p) => p.pct != null);
  return (
    <div className="fx-ev-mod">
      <span className="fx-ev-sec">{m.mode === "leaders" ? "How it varies" : "Compared"}</span>
      <div className="fx-ev-cap">{m.caption}</div>
      {hasBars ? (
        <div>
          {m.points.map((p, i) => (
            <div key={i} className={`fx-ev-bar${i === 0 ? " hi" : ""}`}>
              <span className="fx-ev-blbl">{p.label}</span>
              <div className="fx-ev-track"><div className="fx-ev-fill" style={{ width: `${Math.max(2, Math.min(100, p.pct ?? 0))}%` }} /></div>
              <span className="fx-ev-bp">{p.pct}%</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="fx-ev-leaders">
          {m.points.map((p, i) => (
            <div key={i} className="fx-ev-lead">
              <span className="fx-ev-lead-g">{p.label}</span>
              <span className="fx-ev-lead-arrow">→</span>
              <span className="fx-ev-lead-a">{p.value ?? (p.pct != null ? `${p.pct}%` : "—")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Ranked({ m }: { m: RankedDistributionModule }) {
  return (
    <div className="fx-ev-mod">
      <span className="fx-ev-sec">The opportunity</span>
      <div className="fx-ev-cap">{m.question}<span className="fx-ev-cap-n"> · n={m.n.toLocaleString()}</span></div>
      {m.options.map((o, i) => (
        <div key={i} className={`fx-ev-bar${o.highlight || i === 0 ? " hi" : ""}`}>
          <span className="fx-ev-blbl">{o.label}</span>
          <div className="fx-ev-track"><div className="fx-ev-fill" style={{ width: `${Math.max(2, Math.min(100, o.pct))}%` }} /></div>
          <span className="fx-ev-bp">{o.pct}%</span>
        </div>
      ))}
      {m.leadNote && <p className="fx-ev-lead-note">{m.leadNote}</p>}
    </div>
  );
}

const CSS = `
.fx-ev {
  --navy:${NAVY}; --gold:${GOLD}; --slate:${SLATE}; --grey:${GREY}; --hair:${HAIR}; --track:${TRACK}; --paper:${PAPER}; --ink3:${INK.tertiary};
  --fx-r-data:5px; --fx-r-block:8px; padding:28px 0;
}
.fx-ev .fx-ev-page { position:relative; width:794px; min-height:1123px; margin:0 auto; background:var(--paper); box-shadow:0 8px 34px rgba(11,25,41,.16); }
.fx-ev .fx-ev-page::before { content:""; position:absolute; top:0; left:0; width:7px; height:132px; background:var(--gold); }
.fx-ev .fx-ev-inner { padding:52px 56px 88px; }
.fx-ev .fx-ev-mast { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:1px solid var(--navy); padding-bottom:10px; }
.fx-ev .fx-ev-brand { font-family:${DISP}; font-weight:800; font-size:31px; letter-spacing:.03em; text-transform:uppercase; }
.fx-ev .fx-ev-kick { font-size:11.5px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:var(--slate); }
.fx-ev .fx-ev-eyebrow { color:var(--gold); font-size:12px; font-weight:800; letter-spacing:.2em; text-transform:uppercase; margin-top:24px; }
.fx-ev .fx-ev-h1 { font-family:${DISP}; font-weight:800; font-size:clamp(2.4rem, 4.6vw, 3.3rem); line-height:1; letter-spacing:.006em; text-transform:uppercase; text-wrap:balance; margin:8px 0 0; max-width:20ch; }
.fx-ev .fx-ev-intro { font-size:15px; line-height:1.55; color:#31404F; max-width:74ch; margin-top:14px; }
.fx-ev .fx-ev-sec { display:block; font-size:11px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:var(--gold); }
.fx-ev .fx-ev-grid { display:grid; gap:36px; margin-top:26px; padding-top:22px; border-top:1px solid var(--hair); align-items:start; }
.fx-ev .fx-ev-mod { break-inside:avoid; }
.fx-ev .fx-ev-cap { font-size:13.5px; font-weight:700; color:var(--navy); margin:10px 0 16px; }
.fx-ev .fx-ev-cap-n { color:var(--grey); font-weight:500; }
/* leaders (governed leading-answer-by-segment; no invented percentages) */
.fx-ev .fx-ev-leaders { display:flex; flex-direction:column; gap:2px; }
.fx-ev .fx-ev-lead { display:grid; grid-template-columns:auto 18px 1fr; align-items:baseline; gap:8px; padding:9px 0; border-bottom:1px solid var(--hair); }
.fx-ev .fx-ev-lead:last-child { border-bottom:none; }
.fx-ev .fx-ev-lead-g { font-family:${DISP}; font-weight:800; font-size:19px; text-transform:uppercase; color:var(--navy); }
.fx-ev .fx-ev-lead-arrow { color:var(--gold); font-weight:800; }
.fx-ev .fx-ev-lead-a { font-size:14px; font-weight:700; color:var(--navy); }
/* bars (shared with page 1 language) */
.fx-ev .fx-ev-bar { display:grid; grid-template-columns:minmax(90px,150px) 1fr 46px; align-items:center; gap:12px; padding:6px 0; }
.fx-ev .fx-ev-blbl { font-size:13px; color:var(--navy); text-align:right; }
.fx-ev .fx-ev-bar.hi .fx-ev-blbl { font-weight:800; }
.fx-ev .fx-ev-track { height:22px; background:var(--track); border-radius:var(--fx-r-data); overflow:hidden; }
.fx-ev .fx-ev-fill { height:100%; background:var(--navy); border-radius:var(--fx-r-data); }
.fx-ev .fx-ev-bar.hi .fx-ev-fill { background:var(--gold); }
.fx-ev .fx-ev-bp { font-size:13.5px; font-weight:700; text-align:right; color:var(--navy); font-variant-numeric:tabular-nums; }
.fx-ev .fx-ev-lead-note { font-size:12px; font-weight:700; color:#8A6D2F; margin-top:10px; }
/* what this means */
.fx-ev .fx-ev-means { margin-top:30px; padding-top:20px; border-top:1px solid var(--hair); }
.fx-ev .fx-ev-imps { list-style:none; margin:14px 0 0; padding:0; display:grid; gap:12px; }
.fx-ev .fx-ev-imps li { display:grid; grid-template-columns:30px 1fr; align-items:start; gap:14px; }
.fx-ev .fx-ev-imp-n { font-family:${DISP}; font-weight:800; font-size:20px; color:var(--gold); line-height:1.1; }
.fx-ev .fx-ev-imp-t { font-size:15px; line-height:1.45; color:var(--navy); }
.fx-ev .fx-ev-foot { position:absolute; left:56px; right:56px; bottom:28px; display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--navy); padding-top:10px; }
.fx-ev .fx-ev-tag { font-family:${DISP}; font-weight:800; letter-spacing:.11em; text-transform:uppercase; font-size:13px; }
.fx-ev .fx-ev-meth { font-size:11px; color:var(--grey); font-variant-numeric:tabular-nums; }
@media (max-width:640px) {
  .fx-ev { padding:0; }
  .fx-ev .fx-ev-page { width:100%; min-height:0; box-shadow:none; }
  .fx-ev .fx-ev-inner { padding:26px 18px 84px; }
  .fx-ev .fx-ev-grid { grid-template-columns:1fr !important; }
  .fx-ev .fx-ev-bar { grid-template-columns:110px 1fr 44px; }
}
@media print {
  @page { size:A4; margin:0; }
  html, body { background:#fff !important; }
  *, *::before, *::after { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  [data-no-print="true"] { display:none !important; }
  .fx-ev { padding:0; background:#fff !important; }
  .fx-ev .fx-ev-page { width:100%; min-height:100vh; box-shadow:none; margin:0; }
  .fx-ev .fx-ev-inner { padding:15mm 15mm; }
  .fx-ev .fx-ev-foot { left:15mm; right:15mm; bottom:9mm; }
  .fx-ev .fx-ev-mod, .fx-ev .fx-ev-means { break-inside:avoid; }
}
`;
