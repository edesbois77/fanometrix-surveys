"use client";

// ── Survey Studio — Executive Editorial Page renderer (Slice A.4) ────────────
// The locked Fanometrix "Broadsheet Editorial" design language (Slice A.3), now with an
// INFOGRAPHIC visual system: important numbers are primary graphic elements. The Hero Evidence
// area is a designed focal point (single / tension / dominance / none), the pp GAP between two
// governed figures is itself a graphic, and bar charts are thicker with soft rounded ends.
// Reusable stat-scale + radius tokens carry the "numbers can be graphics" principle across the
// system. It renders ONE governed `ExecutiveReportDocument` and owns ALL layout/typography/print;
// it receives only server-built governed values (incl. the gap) and never computes a number.

import { NAVY, GOLD, INK } from "@/app/reports/theme";
import type { ExecutiveReportDocument, ExecModule } from "@/lib/studio/report/executive-page";
import type { Stat } from "@/lib/reports/framework/types";
import type { BottomLineForm } from "@/lib/studio/report/executive-compose";

const DISP = 'var(--fx-disp, "Helvetica Neue Condensed", "HelveticaNeue-CondensedBold", "Arial Narrow", "Roboto Condensed", Arial, system-ui, sans-serif)';
const BODY = 'var(--fx-sans, "Helvetica Neue", Arial, system-ui, -apple-system, "Segoe UI", sans-serif)';
const SLATE = "#4A5563";
const GREY = "#68727F";
const HAIR = "#E7E4DC";
const TRACK = "#ECEAE3";
const PAPER = "#FCFBF8";
const HERO_TINT = "#F7F3E9";   // subtle warm anchor for the hero focal area (not a SaaS card)
const GAP_TINT = "#FBF3DE";    // gold-tinted chip

const FORM_LABEL: Record<BottomLineForm, string> = {
  implication: "The implication", tension: "The tension", opportunity: "The opportunity", caution: "The watch-out", recommendation: "Recommendation",
};

export function ExecutiveReportPage({ doc }: { doc: ExecutiveReportDocument }) {
  const hasHero = doc.hero.mode !== "none" && !!doc.hero.primary;
  const keyNumbers = doc.modules.find((m) => m.kind === "key-numbers") as Extract<ExecModule, { kind: "key-numbers" }> | undefined;
  const dist = doc.modules.find((m) => m.kind === "distribution") as Extract<ExecModule, { kind: "distribution" }> | undefined;
  return (
    <div className="fx-bs" style={{ background: "#EDEBE4", color: NAVY, fontFamily: BODY }}>
      <style>{CSS}</style>
      <section className="fx-bs-page">
        <div className="fx-bs-inner">
          {/* Masthead */}
          <header className="fx-bs-mast">
            <span className="fx-bs-brand">{doc.masthead.brand}</span>
            <span className="fx-bs-kick">{doc.masthead.kicker}</span>
          </header>

          {/* Study context + objective standfirst */}
          <p className="fx-bs-eyebrow">{doc.identity.title}</p>
          <p className="fx-bs-obj"><span className="fx-bs-obj-lab">Objective</span>{doc.identity.objective}</p>

          {/* Headline + interpretation | hero evidence (the focal graphic) */}
          <div className="fx-bs-head" style={{ gridTemplateColumns: hasHero ? "1.62fr 1px 1fr" : "1fr" }}>
            <div>
              <h1 className="fx-bs-h1" style={{ fontSize: hasHero ? undefined : "clamp(3rem, 7vw, 4.6rem)" }}>{doc.headline}</h1>
              <div className="fx-bs-wwf">
                <span className="fx-bs-sec">What we found</span>
                <p className="fx-bs-wwf-t">{doc.whatWeFound}</p>
              </div>
            </div>
            {hasHero && <div className="fx-bs-vr" />}
            {hasHero && <Hero hero={doc.hero} />}
          </div>

          {/* Evidence — the governed distribution */}
          {dist && (
            <div className="fx-bs-band">
              <span className="fx-bs-sec">The evidence</span>
              <Distribution m={dist} />
            </div>
          )}

          {/* Complementary supporting stats — only when they add something (never chart duplicates) */}
          {keyNumbers && (
            <div className="fx-bs-band">
              <span className="fx-bs-sec">By the numbers</span>
              <div className="fx-bs-kns">
                {keyNumbers.stats.map((s, i) => <KeyNum key={i} s={s} />)}
              </div>
            </div>
          )}

          {/* What this means */}
          {doc.bottomLine && (
            <div className="fx-bs-bl">
              <div className="fx-bs-bl-lab">{FORM_LABEL[doc.bottomLine.form] ?? "The bottom line"}</div>
              <div className="fx-bs-bl-t">{doc.bottomLine.text}</div>
            </div>
          )}
        </div>

        <footer className="fx-bs-foot">
          <span className="fx-bs-tag">{doc.footerTagline}</span>
          <span className="fx-bs-meth">{doc.methodology}</span>
        </footer>
      </section>
    </div>
  );
}

// ── Hero Evidence — data AS the graphic ──────────────────────────────────────
function Hero({ hero }: { hero: ExecutiveReportDocument["hero"] }) {
  if (hero.mode === "tension" && hero.primary && hero.tension) {
    return (
      <div className="fx-bs-hero fx-bs-hero-panel">
        <BigStat s={hero.primary} accent size="lg" />
        {hero.gap && <GapChip gap={hero.gap} />}
        <BigStat s={hero.tension} size="lg" />
        {hero.note && <p className="fx-bs-hero-note">{hero.note}</p>}
      </div>
    );
  }
  if (hero.mode === "dominance" && hero.primary) {
    return (
      <div className="fx-bs-hero fx-bs-hero-panel">
        <BigStat s={hero.primary} accent size="hero" />
        {hero.gap && <GapChip gap={hero.gap} />}
        {hero.note && <p className="fx-bs-hero-note">{hero.note}</p>}
      </div>
    );
  }
  return hero.primary ? (
    <div className="fx-bs-hero">
      <BigStat s={hero.primary} accent size="hero" />
      {hero.note && <p className="fx-bs-hero-note">{hero.note}</p>}
    </div>
  ) : null;
}

function BigStat({ s, accent, size }: { s: Stat; accent?: boolean; size: "hero" | "lg" }) {
  return (
    <div className="fx-bs-bigstat">
      <div className={`fx-bs-bignum fx-bs-num-${size}`} style={{ color: accent ? GOLD : NAVY }}>{s.value}</div>
      <div className="fx-bs-biglabel">{s.label}</div>
      {s.detail && <div className="fx-bs-bigbase">{s.detail}</div>}
    </div>
  );
}

function GapChip({ gap }: { gap: { value: string; caption: string } }) {
  return (
    <div className="fx-bs-gap">
      <span className="fx-bs-gap-v">{gap.value}</span>
      <span className="fx-bs-gap-c">{gap.caption}</span>
    </div>
  );
}

function Distribution({ m }: { m: Extract<ExecModule, { kind: "distribution" }> }) {
  return (
    <div className="fx-bs-mod">
      <div className="fx-bs-q">{m.question}<span className="fx-bs-q-n"> · n={m.n.toLocaleString()}</span></div>
      {m.options.map((o, i) => (
        <div key={i} className={`fx-bs-bar${o.highlight ? " hi" : ""}`}>
          <span className="fx-bs-blbl">{o.label}</span>
          <div className="fx-bs-track"><div className="fx-bs-fill" style={{ width: `${Math.max(2, Math.min(100, o.pct))}%` }} /></div>
          <span className="fx-bs-bp">{o.pct}%</span>
        </div>
      ))}
      <div className="fx-bs-axis"><span /><div className="fx-bs-ticks">{[0, 20, 40, 60, 80, 100].map((t) => <span key={t}>{t}%</span>)}</div><span /></div>
      {m.note && <p className="fx-bs-note">{m.note}</p>}
    </div>
  );
}

function KeyNum({ s }: { s: Stat }) {
  return (
    <div className="fx-bs-kn">
      <div className="fx-bs-kn-n">{s.value}</div>
      <div className="fx-bs-kn-l">{s.label}</div>
      {s.detail && <div className="fx-bs-kn-d">{s.detail}</div>}
    </div>
  );
}

const CSS = `
.fx-bs {
  --navy:${NAVY}; --gold:${GOLD}; --slate:${SLATE}; --grey:${GREY}; --hair:${HAIR}; --track:${TRACK}; --paper:${PAPER}; --ink3:${INK.tertiary};
  --hero-tint:${HERO_TINT}; --gap-tint:${GAP_TINT};
  /* Infographic stat scale — important numbers are primary graphics */
  --fx-stat-hero: clamp(3.2rem, 8vw, 5.6rem);
  --fx-stat-lg: clamp(2.5rem, 5.4vw, 3.7rem);
  --fx-stat-gap: clamp(1.35rem, 2.8vw, 1.95rem);
  /* Restrained radius — data/graphic elements only */
  --fx-r-data: 5px; --fx-r-block: 8px;
  padding:28px 0;
}
.fx-bs .fx-bs-page { position:relative; width:794px; min-height:1123px; margin:0 auto; background:var(--paper); box-shadow:0 8px 34px rgba(11,25,41,.16); }
.fx-bs .fx-bs-page::before { content:""; position:absolute; top:0; left:0; width:7px; height:132px; background:var(--gold); }
.fx-bs .fx-bs-inner { padding:52px 56px 88px; }
.fx-bs .fx-bs-mast { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:1px solid var(--navy); padding-bottom:10px; }
.fx-bs .fx-bs-brand { font-family:${DISP}; font-weight:800; font-size:31px; letter-spacing:.03em; text-transform:uppercase; }
.fx-bs .fx-bs-kick { font-size:11.5px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:var(--slate); }
.fx-bs .fx-bs-eyebrow { color:var(--gold); font-size:12px; font-weight:800; letter-spacing:.2em; text-transform:uppercase; margin-top:24px; }
.fx-bs .fx-bs-obj { font-size:13.5px; line-height:1.45; color:var(--slate); max-width:78ch; margin-top:8px; }
.fx-bs .fx-bs-obj-lab { display:inline-block; font-size:10.5px; font-weight:800; letter-spacing:.15em; text-transform:uppercase; color:var(--navy); margin-right:10px; }
.fx-bs .fx-bs-head { display:grid; gap:30px; align-items:stretch; margin-top:20px; }
.fx-bs .fx-bs-h1 { font-family:${DISP}; font-weight:800; font-size:clamp(2.6rem, 5vw, 3.5rem); line-height:.98; letter-spacing:.006em; text-transform:uppercase; text-wrap:balance; margin:0; }
.fx-bs .fx-bs-vr { background:var(--hair); align-self:stretch; }
.fx-bs .fx-bs-sec { display:block; font-size:11px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:var(--gold); }
.fx-bs .fx-bs-wwf { margin-top:20px; }
.fx-bs .fx-bs-wwf-t { font-size:15px; line-height:1.55; color:#31404F; max-width:58ch; margin-top:9px; }

/* Hero focal area */
.fx-bs .fx-bs-hero { display:flex; flex-direction:column; justify-content:center; height:100%; }
.fx-bs .fx-bs-hero-panel { background:var(--hero-tint); border-radius:var(--fx-r-block); padding:26px 24px; }
.fx-bs .fx-bs-bigstat { text-align:left; }
.fx-bs .fx-bs-bignum { font-family:${DISP}; font-weight:800; line-height:.82; letter-spacing:-.015em; font-variant-numeric:tabular-nums; }
.fx-bs .fx-bs-num-hero { font-size:var(--fx-stat-hero); }
.fx-bs .fx-bs-num-lg { font-size:var(--fx-stat-lg); }
.fx-bs .fx-bs-biglabel { font-family:${DISP}; font-weight:700; font-size:16px; line-height:1.06; text-transform:uppercase; letter-spacing:.01em; color:var(--navy); margin-top:10px; }
.fx-bs .fx-bs-bigbase { font-size:11.5px; color:var(--grey); margin-top:5px; }
.fx-bs .fx-bs-gap { display:inline-flex; flex-direction:column; align-items:center; align-self:flex-start; background:var(--gap-tint); border-radius:var(--fx-r-block); padding:9px 16px; margin:16px 0; }
.fx-bs .fx-bs-gap-v { font-family:${DISP}; font-weight:800; font-size:var(--fx-stat-gap); line-height:1; color:#8A6D2F; font-variant-numeric:tabular-nums; }
.fx-bs .fx-bs-gap-c { font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#8A6D2F; margin-top:4px; max-width:150px; text-align:center; line-height:1.25; }
.fx-bs .fx-bs-hero-note { font-size:12.5px; line-height:1.45; color:var(--slate); font-style:italic; margin-top:16px; }

/* Evidence bands + chart (thicker, softly rounded bars) */
.fx-bs .fx-bs-band { border-top:1px solid var(--hair); margin-top:26px; padding-top:18px; }
.fx-bs .fx-bs-mod { break-inside:avoid; }
.fx-bs .fx-bs-q { font-size:13.5px; font-weight:700; color:var(--navy); margin:12px 0 16px; }
.fx-bs .fx-bs-q-n { color:var(--grey); font-weight:500; }
.fx-bs .fx-bs-bar { display:grid; grid-template-columns:190px 1fr 52px; align-items:center; gap:15px; padding:6px 0; }
.fx-bs .fx-bs-blbl { font-size:13.5px; color:var(--navy); text-align:right; }
.fx-bs .fx-bs-bar.hi .fx-bs-blbl { font-weight:800; }
.fx-bs .fx-bs-track { height:24px; background:var(--track); border-radius:var(--fx-r-data); overflow:hidden; }
.fx-bs .fx-bs-fill { height:100%; background:var(--navy); border-radius:var(--fx-r-data); }
.fx-bs .fx-bs-bar.hi .fx-bs-fill { background:var(--gold); }
.fx-bs .fx-bs-bp { font-size:14px; font-weight:700; text-align:right; color:var(--navy); font-variant-numeric:tabular-nums; }
.fx-bs .fx-bs-bar.hi .fx-bs-bp { font-weight:800; }
.fx-bs .fx-bs-axis { display:grid; grid-template-columns:190px 1fr 52px; gap:15px; margin-top:6px; }
.fx-bs .fx-bs-ticks { display:flex; justify-content:space-between; font-size:10px; color:var(--grey); border-top:1px solid var(--hair); padding-top:3px; }
.fx-bs .fx-bs-note { font-size:11px; color:var(--grey); font-style:italic; margin-top:8px; }
.fx-bs .fx-bs-kns { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:28px; margin-top:14px; }
.fx-bs .fx-bs-kn { border-top:2px solid var(--gold); padding-top:11px; }
.fx-bs .fx-bs-kn-n { font-family:${DISP}; font-weight:800; font-size:44px; line-height:1; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
.fx-bs .fx-bs-kn-l { font-size:13.5px; font-weight:700; margin-top:5px; }
.fx-bs .fx-bs-kn-d { font-size:11.5px; color:var(--grey); margin-top:2px; }
.fx-bs .fx-bs-bl { display:grid; grid-template-columns:130px 1fr; margin-top:28px; border:1.5px solid var(--navy); border-radius:var(--fx-r-block); overflow:hidden; }
.fx-bs .fx-bs-bl-lab { background:var(--navy); color:var(--gold); font-size:11px; font-weight:800; letter-spacing:.15em; text-transform:uppercase; padding:20px 16px; display:flex; align-items:center; }
.fx-bs .fx-bs-bl-t { font-family:${DISP}; font-weight:700; font-size:25px; line-height:1.14; color:var(--navy); padding:19px 24px; }
.fx-bs .fx-bs-foot { position:absolute; left:56px; right:56px; bottom:28px; display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--navy); padding-top:10px; }
.fx-bs .fx-bs-tag { font-family:${DISP}; font-weight:800; letter-spacing:.11em; text-transform:uppercase; font-size:13px; }
.fx-bs .fx-bs-meth { font-size:11px; color:var(--grey); font-variant-numeric:tabular-nums; }
@media (max-width:640px) {
  .fx-bs { padding:0; }
  .fx-bs .fx-bs-page { width:100%; min-height:0; box-shadow:none; }
  .fx-bs .fx-bs-inner { padding:26px 18px 84px; }
  .fx-bs .fx-bs-head { grid-template-columns:1fr !important; }
  .fx-bs .fx-bs-vr { display:none; }
  .fx-bs .fx-bs-bar, .fx-bs .fx-bs-axis { grid-template-columns:120px 1fr 46px; }
}
@media print {
  @page { size:A4; margin:0; }
  html, body { background:#fff !important; }
  *, *::before, *::after { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  [data-no-print="true"] { display:none !important; }
  .fx-bs { padding:0; background:#fff !important; }
  .fx-bs .fx-bs-page { width:100%; min-height:100vh; box-shadow:none; margin:0; }
  .fx-bs .fx-bs-inner { padding:15mm 15mm; }
  .fx-bs .fx-bs-foot { left:15mm; right:15mm; bottom:9mm; }
  .fx-bs .fx-bs-mod, .fx-bs .fx-bs-bl, .fx-bs .fx-bs-band, .fx-bs .fx-bs-hero { break-inside:avoid; }
}
`;
