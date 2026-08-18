// ── Slice A.4 QA — static HTML snapshot of the governed FedEx Executive page ──
// Mirrors the ExecutiveReportPage renderer (Broadsheet + infographic hero) so the page can be
// opened + saved to PDF WITHOUT the dev server. QA convenience only — the production artifact is
// the React renderer at the preview route. Reads the SAME governed document.
//
//   npx tsx lib/studio/qa/fedex-page1-html.ts

import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fedexPage1Document as d } from "@/app/survey-studio/reports-preview/fedex-page1-config";
import type { BottomLineForm } from "@/lib/studio/report/executive-compose";

const NAVY = "#0B1929", GOLD = "#C8A64B", SLATE = "#4A5563", GREY = "#68727F", HAIR = "#E7E4DC", TRACK = "#ECEAE3", PAPER = "#FCFBF8", HERO_TINT = "#F7F3E9", GAP_TINT = "#FBF3DE", GAP_INK = "#8A6D2F";
const DISP = '"Helvetica Neue Condensed","HelveticaNeue-CondensedBold","Arial Narrow","Roboto Condensed",Arial,system-ui,sans-serif';
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FORM: Record<BottomLineForm, string> = { implication: "The implication", tension: "The tension", opportunity: "The opportunity", caution: "The watch-out", recommendation: "Recommendation" };

const hero = d.hero;
const hasHero = hero.mode !== "none" && !!hero.primary;
const bigStat = (s: { value: string; label: string; detail?: string }, accent: boolean, cls: string) => `
  <div><div style="font-family:${DISP};font-weight:800;line-height:.82;letter-spacing:-.015em;font-variant-numeric:tabular-nums;${cls};color:${accent ? GOLD : NAVY}">${esc(s.value)}</div>
  <div style="font-family:${DISP};font-weight:700;font-size:16px;line-height:1.06;text-transform:uppercase;color:${NAVY};margin-top:10px">${esc(s.label)}</div>
  ${s.detail ? `<div style="font-size:11.5px;color:${GREY};margin-top:5px">${esc(s.detail)}</div>` : ""}</div>`;
const gapChip = hero.gap ? `<div style="display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;background:${GAP_TINT};border-radius:8px;padding:9px 16px;margin:16px 0"><span style="font-family:${DISP};font-weight:800;font-size:1.95rem;line-height:1;color:${GAP_INK};font-variant-numeric:tabular-nums">${esc(hero.gap.value)}</span><span style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${GAP_INK};margin-top:4px;text-align:center;line-height:1.25;max-width:150px">${esc(hero.gap.caption)}</span></div>` : "";
const heroNote = hero.note ? `<p style="font-size:12.5px;line-height:1.45;color:${SLATE};font-style:italic;margin-top:16px">${esc(hero.note)}</p>` : "";
const STAT_HERO = "font-size:clamp(3.2rem,8vw,5.6rem)", STAT_LG = "font-size:clamp(2.5rem,5.4vw,3.7rem)";
const heroHtml = !hasHero ? "" : hero.mode === "tension" && hero.primary && hero.tension
  ? `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;background:${HERO_TINT};border-radius:8px;padding:26px 24px">${bigStat(hero.primary, true, STAT_LG)}${gapChip}${bigStat(hero.tension, false, STAT_LG)}${heroNote}</div>`
  : hero.mode === "dominance" && hero.primary
  ? `<div style="display:flex;flex-direction:column;justify-content:center;height:100%;background:${HERO_TINT};border-radius:8px;padding:26px 24px">${bigStat(hero.primary, true, STAT_HERO)}${gapChip}${heroNote}</div>`
  : hero.primary ? `<div style="display:flex;flex-direction:column;justify-content:center;height:100%">${bigStat(hero.primary, true, STAT_HERO)}${heroNote}</div>` : "";

const dist = d.modules.find((m) => m.kind === "distribution") as { kind: "distribution"; question: string; n: number; options: { label: string; pct: number; highlight?: boolean }[]; note?: string } | undefined;
const keyNums = d.modules.find((m) => m.kind === "key-numbers") as { kind: "key-numbers"; stats: { value: string; label: string; detail?: string }[] } | undefined;
const sec = (t: string) => `<span style="display:block;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${GOLD}">${t}</span>`;
const bars = dist ? dist.options.map((o) => `
  <div style="display:grid;grid-template-columns:190px 1fr 52px;align-items:center;gap:15px;padding:6px 0">
    <span style="font-size:13.5px;color:${NAVY};text-align:right;${o.highlight ? "font-weight:800" : ""}">${esc(o.label)}</span>
    <div style="height:24px;background:${TRACK};border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.max(2, o.pct)}%;background:${o.highlight ? GOLD : NAVY};border-radius:5px"></div></div>
    <span style="font-size:14px;font-weight:700;text-align:right;color:${NAVY};font-variant-numeric:tabular-nums">${o.pct}%</span>
  </div>`).join("") : "";
const axis = dist ? `<div style="display:grid;grid-template-columns:190px 1fr 52px;gap:15px;margin-top:6px"><span></span><div style="display:flex;justify-content:space-between;font-size:10px;color:${GREY};border-top:1px solid ${HAIR};padding-top:3px">${[0, 20, 40, 60, 80, 100].map((t) => `<span>${t}%</span>`).join("")}</div><span></span></div>` : "";

const bodyInner = `
  <header style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid ${NAVY};padding-bottom:10px">
    <span style="font-family:${DISP};font-weight:800;font-size:31px;letter-spacing:.03em;text-transform:uppercase">${esc(d.masthead.brand)}</span>
    <span style="font-size:11.5px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${SLATE}">${esc(d.masthead.kicker)}</span>
  </header>
  <p style="color:${GOLD};font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;margin-top:24px">${esc(d.identity.title)}</p>
  <p style="font-size:13.5px;line-height:1.45;color:${SLATE};max-width:78ch;margin-top:8px"><span style="display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:${NAVY};margin-right:10px">Objective</span>${esc(d.identity.objective)}</p>
  <div style="display:grid;grid-template-columns:${hasHero ? "1.62fr 1px 1fr" : "1fr"};gap:30px;align-items:stretch;margin-top:20px">
    <div>
      <h1 style="font-family:${DISP};font-weight:800;font-size:${hasHero ? "clamp(2.6rem,5vw,3.5rem)" : "clamp(3rem,7vw,4.6rem)"};line-height:.98;letter-spacing:.006em;text-transform:uppercase;text-wrap:balance;margin:0">${esc(d.headline)}</h1>
      <div style="margin-top:20px">${sec("What we found")}<p style="font-size:15px;line-height:1.55;color:#31404F;max-width:58ch;margin-top:9px">${esc(d.whatWeFound)}</p></div>
    </div>
    ${hasHero ? `<div style="background:${HAIR};align-self:stretch"></div>${heroHtml}` : ""}
  </div>
  ${dist ? `<div style="border-top:1px solid ${HAIR};margin-top:26px;padding-top:18px">${sec("The evidence")}<div style="font-size:13.5px;font-weight:700;color:${NAVY};margin:12px 0 16px">${esc(dist.question)}<span style="color:${GREY};font-weight:500"> · n=${dist.n.toLocaleString()}</span></div>${bars}${axis}${dist.note ? `<p style="font-size:11px;color:${GREY};font-style:italic;margin-top:8px">${esc(dist.note)}</p>` : ""}</div>` : ""}
  ${keyNums ? `<div style="border-top:1px solid ${HAIR};margin-top:26px;padding-top:18px">${sec("By the numbers")}<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:28px;margin-top:14px">${keyNums.stats.map((s) => `<div style="border-top:2px solid ${GOLD};padding-top:11px"><div style="font-family:${DISP};font-weight:800;font-size:44px;line-height:1;font-variant-numeric:tabular-nums">${esc(s.value)}</div><div style="font-size:13.5px;font-weight:700;margin-top:5px">${esc(s.label)}</div>${s.detail ? `<div style="font-size:11.5px;color:${GREY};margin-top:2px">${esc(s.detail)}</div>` : ""}</div>`).join("")}</div></div>` : ""}
  ${d.bottomLine ? `<div style="display:grid;grid-template-columns:130px 1fr;margin-top:28px;border:1.5px solid ${NAVY};border-radius:8px;overflow:hidden"><div style="background:${NAVY};color:${GOLD};font-size:11px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;padding:20px 16px;display:flex;align-items:center">${esc(FORM[d.bottomLine.form] ?? "The bottom line")}</div><div style="font-family:${DISP};font-weight:700;font-size:25px;line-height:1.14;color:${NAVY};padding:19px 24px">${esc(d.bottomLine.text)}</div></div>` : ""}
`;
const footer = `<footer class="foot" style="position:absolute;left:56px;right:56px;bottom:28px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid ${NAVY};padding-top:10px"><span style="font-family:${DISP};font-weight:800;letter-spacing:.11em;text-transform:uppercase;font-size:13px">${esc(d.footerTagline)}</span><span style="font-size:11px;color:${GREY};font-variant-numeric:tabular-nums">${esc(d.methodology)}</span></footer>`;

const pageCss = `.page{position:relative;width:794px;min-height:1123px;margin:0 auto;background:${PAPER};box-shadow:0 8px 34px rgba(11,25,41,.16)}.page::before{content:"";position:absolute;top:0;left:0;width:7px;height:132px;background:${GOLD}}.inner{padding:52px 56px 88px}`;
const printCss = `@media print{@page{size:A4;margin:0}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}.page{width:100%;min-height:100vh;box-shadow:none}.inner{padding:15mm 15mm}.foot{left:15mm !important;right:15mm !important;bottom:9mm !important}}`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FedEx Executive Page — Survey Studio (Broadsheet + Infographic)</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#EDEBE4;font-family:"Helvetica Neue",Arial,system-ui,sans-serif;color:${NAVY};padding:28px 0}${pageCss}${printCss}</style></head>
<body><div class="page"><div class="inner">${bodyInner}</div>${footer}</div></body></html>`;
const out = path.join(os.homedir(), "Downloads", "FedEx-Executive-Page-SliceA4-QA-Snapshot.html");
writeFileSync(out, html);

const fragment = `
<style>*{box-sizing:border-box;margin:0;padding:0}.fx-review{font-family:"Helvetica Neue",Arial,system-ui,sans-serif;background:#20242B;min-height:100vh;padding:26px 16px 60px;color:${NAVY}}.fx-review .cap{max-width:794px;margin:0 auto 16px;color:#AEB6C0;font-size:13px;line-height:1.5}.fx-review .cap b{color:#fff}${pageCss.replace(/\.page/g, ".fx-review .page").replace(/\.inner/g, ".fx-review .inner")}
@media print{.fx-review{background:#fff;padding:0}.fx-review .cap{display:none}.fx-review .page{width:100%;min-height:100vh;box-shadow:none}.fx-review .inner{padding:15mm 15mm}.fx-review .foot{left:15mm !important;right:15mm !important;bottom:9mm !important}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}}</style>
<div class="fx-review">
  <p class="cap"><b>FedEx Executive Page — Broadsheet + infographic hero (Slice A.4).</b> Rendered from the governed document through the real pipeline. Print / Save as PDF for A4 review.</p>
  <div class="page"><div class="inner">${bodyInner}</div>${footer}</div>
</div>`;
const scratch = "/private/tmp/claude-501/-Users-edesbois-Developer-fanometrixsurveys/ac4068a7-80fd-491c-9f95-1b12c2fab7ee/scratchpad";
writeFileSync(path.join(scratch, "fedex-exec-a4.html"), fragment);

console.log(`Wrote static QA snapshot → ${out}`);
console.log(`Wrote artifact fragment → scratchpad/fedex-exec-a4.html`);
console.log(`Open the snapshot in a browser and File → Print → Save as PDF (A4) to review.`);
