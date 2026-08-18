// ── Slice B QA — static HTML snapshot of the governed FedEx TWO-PAGE report ──
// Mirrors the ExecutiveReportPage (A.4) + EvidenceReportPage renderers so the two-page report
// can be opened + saved to PDF WITHOUT the dev server. QA convenience only — the production
// artifact is the React preview route. Reads the SAME governed documents.
//
//   npx tsx lib/studio/qa/fedex-infographic-html.ts

import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fedexExecutiveDocument as ex, fedexEvidenceDocument as evd } from "@/app/survey-studio/reports-preview/fedex-infographic-config";
import type { BottomLineForm } from "@/lib/studio/report/executive-compose";

const NAVY = "#0B1929", GOLD = "#C8A64B", SLATE = "#4A5563", GREY = "#68727F", HAIR = "#E7E4DC", TRACK = "#ECEAE3", PAPER = "#FCFBF8", HERO_TINT = "#F7F3E9", GAP_TINT = "#FBF3DE", GAP_INK = "#8A6D2F";
const DISP = '"Helvetica Neue Condensed","HelveticaNeue-CondensedBold","Arial Narrow","Roboto Condensed",Arial,system-ui,sans-serif';
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FORM: Record<BottomLineForm, string> = { implication: "The implication", tension: "The tension", opportunity: "The opportunity", caution: "The watch-out", recommendation: "Recommendation" };
const sec = (t: string) => `<span style="display:block;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${GOLD}">${t}</span>`;
const mast = (kick: string) => `<header style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid ${NAVY};padding-bottom:10px"><span style="font-family:${DISP};font-weight:800;font-size:31px;letter-spacing:.03em;text-transform:uppercase">FANOMETRIX</span><span style="font-size:11.5px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${SLATE}">${esc(kick)}</span></header>`;
const foot = (tag: string, meth: string) => `<footer class="foot" style="position:absolute;left:56px;right:56px;bottom:28px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${NAVY};padding-top:10px"><span style="font-family:${DISP};font-weight:800;letter-spacing:.11em;text-transform:uppercase;font-size:13px">${esc(tag)}</span><span style="font-size:11px;color:${GREY};font-variant-numeric:tabular-nums">${esc(meth)}</span></footer>`;
const bar = (label: string, pct: number, hi: boolean, lblW = "190px", valW = "52px") => `<div style="display:grid;grid-template-columns:${lblW} 1fr ${valW};align-items:center;gap:15px;padding:6px 0"><span style="font-size:13.5px;color:${NAVY};text-align:right;${hi ? "font-weight:800" : ""}">${esc(label)}</span><div style="height:24px;background:${TRACK};border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.max(2, pct)}%;background:${hi ? GOLD : NAVY};border-radius:5px"></div></div><span style="font-size:14px;font-weight:700;text-align:right;color:${NAVY};font-variant-numeric:tabular-nums">${pct}%</span></div>`;

// ── Page 1 (Executive) ───────────────────────────────────────────────────────
const h = ex.hero, hasHero = h.mode !== "none" && !!h.primary;
const bigStat = (s: { value: string; label: string; detail?: string }, accent: boolean, size: string) => `<div><div style="font-family:${DISP};font-weight:800;line-height:.82;letter-spacing:-.015em;font-variant-numeric:tabular-nums;${size};color:${accent ? GOLD : NAVY}">${esc(s.value)}</div><div style="font-family:${DISP};font-weight:700;font-size:16px;line-height:1.06;text-transform:uppercase;color:${NAVY};margin-top:10px">${esc(s.label)}</div>${s.detail ? `<div style="font-size:11.5px;color:${GREY};margin-top:5px">${esc(s.detail)}</div>` : ""}</div>`;
const gapChip = h.gap ? `<div style="display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;background:${GAP_TINT};border-radius:8px;padding:9px 16px;margin:16px 0"><span style="font-family:${DISP};font-weight:800;font-size:1.95rem;line-height:1;color:${GAP_INK};font-variant-numeric:tabular-nums">${esc(h.gap.value)}</span><span style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${GAP_INK};margin-top:4px;text-align:center;max-width:150px;line-height:1.25">${esc(h.gap.caption)}</span></div>` : "";
const heroNote = h.note ? `<p style="font-size:12.5px;line-height:1.45;color:${SLATE};font-style:italic;margin-top:16px">${esc(h.note)}</p>` : "";
const SH = "font-size:clamp(3.2rem,8vw,5.6rem)", SL = "font-size:clamp(2.5rem,5.4vw,3.7rem)";
const heroHtml = !hasHero ? "" : h.mode === "tension" && h.primary && h.tension
  ? `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;background:${HERO_TINT};border-radius:8px;padding:26px 24px">${bigStat(h.primary, true, SL)}${gapChip}${bigStat(h.tension, false, SL)}${heroNote}</div>`
  : h.mode === "dominance" && h.primary ? `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;background:${HERO_TINT};border-radius:8px;padding:26px 24px">${bigStat(h.primary, true, SH)}${gapChip}${heroNote}</div>`
  : h.primary ? `<div style="display:flex;flex-direction:column;justify-content:center;height:100%">${bigStat(h.primary, true, SH)}${heroNote}</div>` : "";
const exDist = ex.modules.find((m) => m.kind === "distribution") as { kind: "distribution"; question: string; n: number; options: { label: string; pct: number; highlight?: boolean }[] } | undefined;
const page1 = `
  ${mast(ex.masthead.kicker)}
  <p style="color:${GOLD};font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin-top:24px">${esc(ex.identity.title)}</p>
  <p style="font-size:13.5px;line-height:1.45;color:${SLATE};max-width:78ch;margin-top:8px"><span style="display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:${NAVY};margin-right:10px">Objective</span>${esc(ex.identity.objective)}</p>
  <div style="display:grid;grid-template-columns:${hasHero ? "1.62fr 1px 1fr" : "1fr"};gap:30px;align-items:stretch;margin-top:20px">
    <div><h1 style="font-family:${DISP};font-weight:800;font-size:${hasHero ? "clamp(2.6rem,5vw,3.5rem)" : "clamp(3rem,7vw,4.6rem)"};line-height:.98;letter-spacing:.006em;text-transform:uppercase;text-wrap:balance;margin:0">${esc(ex.headline)}</h1><div style="margin-top:20px">${sec("What we found")}<p style="font-size:15px;line-height:1.55;color:#31404F;max-width:58ch;margin-top:9px">${esc(ex.whatWeFound)}</p></div></div>
    ${hasHero ? `<div style="background:${HAIR};align-self:stretch"></div>${heroHtml}` : ""}
  </div>
  ${exDist ? `<div style="border-top:1px solid ${HAIR};margin-top:26px;padding-top:18px">${sec("The evidence")}<div style="font-size:13.5px;font-weight:700;color:${NAVY};margin:12px 0 16px">${esc(exDist.question)}<span style="color:${GREY};font-weight:500"> · n=${exDist.n.toLocaleString()}</span></div>${exDist.options.map((o) => bar(o.label, o.pct, !!o.highlight)).join("")}<div style="display:grid;grid-template-columns:190px 1fr 52px;gap:15px;margin-top:6px"><span></span><div style="display:flex;justify-content:space-between;font-size:10px;color:${GREY};border-top:1px solid ${HAIR};padding-top:3px">${[0, 20, 40, 60, 80, 100].map((t) => `<span>${t}%</span>`).join("")}</div><span></span></div></div>` : ""}
  ${ex.bottomLine ? `<div style="display:grid;grid-template-columns:130px 1fr;margin-top:28px;border:1.5px solid ${NAVY};border-radius:8px;overflow:hidden"><div style="background:${NAVY};color:${GOLD};font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;padding:20px 16px;display:flex;align-items:center">${esc(FORM[ex.bottomLine.form] ?? "The bottom line")}</div><div style="font-family:${DISP};font-weight:700;font-size:25px;line-height:1.14;color:${NAVY};padding:19px 24px">${esc(ex.bottomLine.text)}</div></div>` : ""}
`;

// ── Page 2 (Evidence) ────────────────────────────────────────────────────────
function page2Body(): string {
  if (!evd) return "";
  const single = evd.modules.length <= 1;
  const segHtml = (m: Extract<NonNullable<typeof evd>["modules"][number], { kind: "segment-comparison" }>) => {
    const hasBars = m.mode !== "leaders" && m.points.some((p) => p.pct != null);
    const rows = hasBars
      ? m.points.map((p, i) => bar(p.label, p.pct ?? 0, i === 0, "minmax(90px,150px)", "46px")).join("")
      : `<div style="display:flex;flex-direction:column">${m.points.map((p) => `<div style="display:grid;grid-template-columns:auto 18px 1fr;align-items:baseline;gap:8px;padding:9px 0;border-bottom:1px solid ${HAIR}"><span style="font-family:${DISP};font-weight:800;font-size:19px;text-transform:uppercase;color:${NAVY}">${esc(p.label)}</span><span style="color:${GOLD};font-weight:800">→</span><span style="font-size:14px;font-weight:700;color:${NAVY}">${esc(p.value ?? (p.pct != null ? p.pct + "%" : "—"))}</span></div>`).join("")}</div>`;
    return `<div>${sec(m.mode === "leaders" ? "How it varies" : "Compared")}<div style="font-size:13.5px;font-weight:700;color:${NAVY};margin:10px 0 16px">${esc(m.caption)}</div>${rows}</div>`;
  };
  const rkHtml = (m: Extract<NonNullable<typeof evd>["modules"][number], { kind: "ranked-distribution" }>) =>
    `<div>${sec("The opportunity")}<div style="font-size:13.5px;font-weight:700;color:${NAVY};margin:10px 0 16px">${esc(m.question)}<span style="color:${GREY};font-weight:500"> · n=${m.n.toLocaleString()}</span></div>${m.options.map((o, i) => bar(o.label, o.pct, !!o.highlight || i === 0, "minmax(90px,150px)", "46px")).join("")}${m.leadNote ? `<p style="font-size:12px;font-weight:700;color:${GAP_INK};margin-top:10px">${esc(m.leadNote)}</p>` : ""}</div>`;
  const modules = evd.modules.map((m) => (m.kind === "segment-comparison" ? segHtml(m) : rkHtml(m))).join("");
  const imps = evd.implications.length ? `<div style="margin-top:30px;padding-top:20px;border-top:1px solid ${HAIR}">${sec("What this means")}<ol style="list-style:none;margin:14px 0 0;padding:0;display:grid;gap:12px">${evd.implications.map((t, i) => `<li style="display:grid;grid-template-columns:30px 1fr;align-items:start;gap:14px"><span style="font-family:${DISP};font-weight:800;font-size:20px;color:${GOLD}">${i + 1}</span><span style="font-size:15px;line-height:1.45;color:${NAVY}">${esc(t)}</span></li>`).join("")}</ol></div>` : "";
  return `
    ${mast(evd.masthead.kicker)}
    <p style="color:${GOLD};font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin-top:24px">${esc(evd.eyebrow)}</p>
    <h1 style="font-family:${DISP};font-weight:800;font-size:clamp(2.4rem,4.6vw,3.3rem);line-height:1;letter-spacing:.006em;text-transform:uppercase;text-wrap:balance;margin:8px 0 0;max-width:20ch">${esc(evd.headline)}</h1>
    <p style="font-size:15px;line-height:1.55;color:#31404F;max-width:74ch;margin-top:14px">${esc(evd.intro)}</p>
    <div style="display:grid;grid-template-columns:${single ? "1fr" : "1fr 1fr"};gap:36px;margin-top:26px;padding-top:22px;border-top:1px solid ${HAIR};align-items:start">${modules}</div>
    ${imps}
  `;
}

const pageCss = `.page{position:relative;width:794px;min-height:1123px;margin:0 auto 22px;background:${PAPER};box-shadow:0 8px 34px rgba(11,25,41,.16)}.page::before{content:"";position:absolute;top:0;left:0;width:7px;height:132px;background:${GOLD}}.inner{padding:52px 56px 88px}`;
const printCss = `@media print{@page{size:A4;margin:0}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}.page{width:100%;min-height:100vh;margin:0;box-shadow:none;break-after:page}.page:last-child{break-after:auto}.inner{padding:15mm 15mm}.foot{left:15mm !important;right:15mm !important;bottom:9mm !important}}`;
const sheet = (body: string, kick: string, meth: string) => `<div class="page"><div class="inner">${body}</div>${foot("Fan insight. Smarter strategy. Stronger impact.", meth)}</div>`;
const pages = sheet(page1, ex.masthead.kicker, ex.methodology) + (evd ? sheet(page2Body(), evd.masthead.kicker, evd.methodology) : "");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FedEx Infographic Report — Survey Studio (2 pages)</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#EDEBE4;font-family:"Helvetica Neue",Arial,system-ui,sans-serif;color:${NAVY};padding:28px 0}${pageCss}${printCss}</style></head>
<body>${pages}</body></html>`;
const out = path.join(os.homedir(), "Downloads", "FedEx-Infographic-Report-SliceB-2page-Snapshot.html");
writeFileSync(out, html);

const fragCss = pageCss.replace(/\.page/g, ".fx-review .page").replace(/\.inner/g, ".fx-review .inner");
const fragment = `
<style>*{box-sizing:border-box;margin:0;padding:0}.fx-review{font-family:"Helvetica Neue",Arial,system-ui,sans-serif;background:#20242B;min-height:100vh;padding:26px 16px 60px;color:${NAVY}}.fx-review .cap{max-width:794px;margin:0 auto 16px;color:#AEB6C0;font-size:13px;line-height:1.5}.fx-review .cap b{color:#fff}${fragCss}
@media print{.fx-review{background:#fff;padding:0}.fx-review .cap{display:none}.fx-review .page{width:100%;min-height:100vh;margin:0;box-shadow:none;break-after:page}.fx-review .page:last-child{break-after:auto}.fx-review .inner{padding:15mm 15mm}.fx-review .foot{left:15mm !important;right:15mm !important;bottom:9mm !important}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}}</style>
<div class="fx-review"><p class="cap"><b>FedEx Infographic Report — two pages (Slice B).</b> Page 1 Executive (A.4) + Page 2 Evidence &amp; Opportunity, from the real governed pipeline. Print / Save as PDF for A4 review.</p>${pages}</div>`;
const scratch = "/private/tmp/claude-501/-Users-edesbois-Developer-fanometrixsurveys/ac4068a7-80fd-491c-9f95-1b12c2fab7ee/scratchpad";
writeFileSync(path.join(scratch, "fedex-infographic.html"), fragment);

console.log(`Wrote 2-page snapshot → ${out}`);
console.log(`Wrote artifact fragment → scratchpad/fedex-infographic.html`);
