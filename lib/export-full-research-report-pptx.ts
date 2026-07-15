// Client-side PPTX export for the Full Research Report — built on the
// same generic slide-building foundation in lib/pptx/reportDeck.ts the
// Executive Report's own exporter (lib/export-report-pptx.ts) already
// uses, exactly the reuse path that module's own header comment invites.
// Modeled directly on that file's structure and brand palette.
//
// Deliberately excludes the Evidence Appendix entirely — a project with
// hundreds of Key Findings must not produce hundreds of slides. This stays
// a presentation-quality analytical deck: the narrative, the theme
// deep-dives, and only the specific evidence each deep-dive actually
// cites. The complete pool remains available in the Full Research
// Report's own on-screen appendix, its PDF, and Key Findings directly —
// never lost, just not duplicated into the deck.
"use client";

import type { FullResearchReport } from "@/lib/intelligence/analysts/analyseFullResearchReport";
import {
  createReportDeck, addFullSimulatedStamp, addTitleBandSlide, addNumberedRow, addBoxRow,
  DEFAULT_REPORT_COLORS,
} from "@/lib/pptx/reportDeck";
import { stripCitationIds } from "@/lib/intelligence/strip-citation-ids";
import { nonBlankStrings, withFinding, withAction, withInsight } from "@/lib/intelligence/report-content";

const { navy: NAVY, gold: GOLD, white: WHITE, grey: GREY, lightGrey: LGREY } = DEFAULT_REPORT_COLORS;

export async function exportFullResearchReportPptx(projectName: string, report: FullResearchReport) {
  const isSimulated = report.research_mode === "simulated";
  const deck = await createReportDeck({ isSimulated });
  const { pptx } = deck;

  // ── Slide 1: Cover ──
  {
    const s = deck.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: NAVY } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.2, w: "100%", h: 0.04, fill: { color: GOLD } });
    s.addText("FANOMETRIX", { x: 0.5, y: 0.5, w: 12, fontSize: 11, color: GOLD, bold: true, charSpacing: 4 });
    s.addText("Full Research Report", { x: 0.5, y: 0.85, w: 12, fontSize: 10, color: WHITE, transparency: 40 });
    if (isSimulated) addFullSimulatedStamp(deck, s, 1.25, 0.4, 13);
    s.addText(report.research_answer, {
      x: 0.5, y: 2.0, w: 12, h: 1.7, fontSize: 28, color: WHITE, bold: true, breakLine: true, valign: "top",
    });
    s.addText(projectName, { x: 0.5, y: 5.5, w: 12, fontSize: 12, color: GOLD });
    s.addText(
      `Generated ${new Date(report.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      { x: 0.5, y: 6.8, w: 12, fontSize: 9, color: WHITE, transparency: 50 }
    );
  }

  // ── Slide 2: Research Question & Answer ──
  addTitleBandSlide(deck, { title: "Research Question & Answer", bandColor: NAVY }, s => {
    s.addText("RESEARCH QUESTION", { x: 0.5, y: 1.5, w: 12, fontSize: 11, color: GOLD, bold: true, charSpacing: 2 });
    s.addText(report.research_question, { x: 0.5, y: 1.85, w: 12, h: 1.1, fontSize: 16, color: NAVY, breakLine: true, valign: "top" });
    s.addText("RESEARCH ANSWER", { x: 0.5, y: 3.15, w: 12, fontSize: 11, color: GOLD, bold: true, charSpacing: 2 });
    s.addText(report.research_answer, { x: 0.5, y: 3.55, w: 12, fontSize: 22, color: NAVY, bold: true, breakLine: true });
  });

  // ── Slide 3: Executive Summary — the report's own fuller, expanded
  // summary, never the Executive Report's shorter one. ──
  addTitleBandSlide(deck, { title: "Executive Summary", bandColor: NAVY }, s => {
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.4, w: 0.04, h: 4.5, fill: { color: GOLD } });
    s.addText(stripCitationIds(report.executive_summary), { x: 0.75, y: 1.4, w: 11.5, fontSize: 15, color: NAVY, breakLine: true, valign: "top" });
  });

  // ── Theme Deep-Dives — one slide per theme, only that theme's own
  // cited evidence, never the full wider pool. ──
  report.theme_deep_dives.forEach(dive => {
    addTitleBandSlide(deck, { title: dive.theme, bandColor: NAVY }, s => {
      s.addText("DEEP-DIVE", { x: 0.5, y: 1.3, w: 12, fontSize: 10, color: GOLD, bold: true, charSpacing: 2 });
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.6, w: 0.04, h: 2.2, fill: { color: GOLD } });
      s.addText(stripCitationIds(dive.deep_dive), { x: 0.75, y: 1.6, w: 11.5, h: 2.2, fontSize: 13, color: NAVY, breakLine: true, valign: "top" });

      let y = 4.0;
      const cited = dive.additional_findings.map(i => report.evidence_appendix[i]).filter((f): f is typeof report.evidence_appendix[number] => !!f);
      if (cited.length) {
        s.addText("ADDITIONAL EVIDENCE", { x: 0.5, y, w: 12, fontSize: 10, color: GOLD, bold: true, charSpacing: 2 });
        y += 0.35;
        cited.forEach(f => {
          s.addText(`•  ${f.text}`, { x: 0.5, y, w: 11.8, fontSize: 10, color: GREY, breakLine: true });
          y += 0.4;
        });
      }
      const citedQuotes = dive.quote_ids.map(id => report.quote_pool.find(q => q.id === id)).filter((q): q is typeof report.quote_pool[number] => !!q);
      if (citedQuotes.length) {
        y += 0.1;
        s.addText("QUOTES", { x: 0.5, y, w: 12, fontSize: 10, color: GOLD, bold: true, charSpacing: 2 });
        y += 0.35;
        citedQuotes.forEach(q => {
          s.addText(`"${q.text}"`, { x: 0.5, y, w: 11.8, fontSize: 10, italic: true, color: GREY, breakLine: true });
          y += 0.4;
        });
      }
    });
  });

  // ── Additional Evidence-Led Insights — only if the analyst produced
  // any; material wider-pool evidence outside the approved Core Themes,
  // explicitly subordinate. ──
  if (withInsight(report.additional_insights).length) {
    addTitleBandSlide(deck, { title: "Additional Evidence-Led Insights", bandColor: GOLD, titleColor: NAVY }, s => {
      s.addText("Evidence-led observations outside the approved Strategic Themes, not approved strategic conclusions.", {
        x: 0.5, y: 1.25, w: 12, fontSize: 10, color: GREY, italic: true,
      });
      let y = 1.7;
      withInsight(report.additional_insights).forEach((insight, i) => {
        s.addText(`${i + 1}.  ${stripCitationIds(insight.insight)}`, { x: 0.5, y, w: 11.8, fontSize: 12, color: NAVY, breakLine: true });
        y += 0.75;
        const cited = insight.based_on_findings.map(idx => report.evidence_appendix[idx]).filter((f): f is typeof report.evidence_appendix[number] => !!f);
        cited.forEach(f => {
          s.addText(`•  ${f.text}`, { x: 0.75, y, w: 11.5, fontSize: 9, color: GREY, breakLine: true });
          y += 0.35;
        });
        y += 0.2;
      });
    });
  }

  // ── Areas of Agreement ──
  if (withFinding(report.areas_of_agreement).length) {
    addTitleBandSlide(deck, { title: "Areas of Agreement", bandColor: "22C55E" }, s => {
      withFinding(report.areas_of_agreement).forEach((a, i) => {
        addNumberedRow(s, pptx, {
          x: 0.5, y: 1.4 + i * 1.0, number: i + 1, text: a.finding, textWidth: 11.5,
          circleColor: "22C55E", numberColor: WHITE, textColor: NAVY,
        });
      });
    });
  }

  // ── Areas of Difference ──
  if (withFinding(report.areas_of_difference).length) {
    addTitleBandSlide(deck, { title: "Areas of Difference", bandColor: "5B6CFA" }, s => {
      withFinding(report.areas_of_difference).forEach((d, i) => {
        const y = 1.4 + i * 1.3;
        addBoxRow(s, pptx, {
          x: 0.5, y, w: 11.5, h: 1.15, fill: LGREY, line: { color: "E5E7EB", width: 0.5 },
          textX: 0.7, textW: 11,
          title: d.finding, titleFontSize: 12, titleColor: NAVY, titleY: y + 0.1,
          body: d.explanation, bodyFontSize: 10, bodyColor: GREY, bodyY: y + 0.6,
        });
      });
    });
  }

  // ── Opportunities ──
  if (nonBlankStrings(report.opportunities).length) {
    addTitleBandSlide(deck, { title: "Opportunities", bandColor: "22C55E" }, s => {
      nonBlankStrings(report.opportunities).forEach((o, i) => {
        addNumberedRow(s, pptx, {
          x: 0.5, y: 1.4 + i * 1.0, number: i + 1, text: o, textWidth: 11.5,
          circleColor: "22C55E", numberColor: WHITE, textColor: NAVY,
        });
      });
    });
  }

  // ── Risks ──
  if (nonBlankStrings(report.risks).length) {
    addTitleBandSlide(deck, { title: "Risks", bandColor: "EF4444" }, s => {
      nonBlankStrings(report.risks).forEach((r, i) => {
        addNumberedRow(s, pptx, {
          x: 0.5, y: 1.4 + i * 1.0, number: i + 1, text: r, textWidth: 11.5,
          circleColor: "EF4444", numberColor: WHITE, textColor: NAVY,
        });
      });
    });
  }

  // ── Recommendations ──
  if (withAction(report.recommendations).length) {
    addTitleBandSlide(deck, { title: "Recommendations", bandColor: GOLD, titleColor: NAVY }, s => {
      withAction(report.recommendations).forEach((r, i) => {
        const y = 1.4 + i * 1.4;
        addBoxRow(s, pptx, {
          x: 0.5, y, w: 11.5, h: 1.25, fill: LGREY,
          textX: 0.7, textW: 11,
          title: r.action, titleFontSize: 13, titleColor: NAVY, titleY: y + 0.1,
          body: r.rationale, bodyFontSize: 11, bodyColor: GREY, bodyY: y + 0.55,
        });
      });
    });
  }

  // ── Strategic Conclusion — the report's closing synthesis, the mirror
  // of the Executive Summary that opened the deck. ──
  addTitleBandSlide(deck, { title: "Strategic Conclusion", bandColor: NAVY }, s => {
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.4, w: 0.04, h: 4.5, fill: { color: GOLD } });
    s.addText(stripCitationIds(report.strategic_conclusion), { x: 0.75, y: 1.4, w: 11.5, fontSize: 15, color: NAVY, breakLine: true, valign: "top" });
  });

  // ── Methodology & Provenance — moved to immediately after the Strategic
  // Conclusion (matching the on-screen order), and now the project-specific
  // methodology NARRATIVE rather than the source inventory (which moved into
  // Sources & Coverage below). Hidden entirely when absent — a report
  // generated before this field existed simply omits the slide. ──
  if (report.methodology.narrative) {
    addTitleBandSlide(deck, { title: "Methodology & Provenance", bandColor: NAVY }, s => {
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.4, w: 0.04, h: 4.5, fill: { color: GOLD } });
      s.addText(stripCitationIds(report.methodology.narrative!), { x: 0.75, y: 1.4, w: 11.5, fontSize: 14, color: NAVY, breakLine: true, valign: "top" });
    });
  }

  // ── Sources & Coverage (closing) — the factual source inventory now lives
  // here: each included source with its metadata (sample/mention size,
  // markets, publishers, date range, or document descriptor), joined by
  // evidence_id, plus the excluded sources and their reason. ──
  addTitleBandSlide(deck, { title: "Sources & Coverage", bandColor: NAVY }, s => {
    const metaFor = (evidenceId: string): string => {
      const m = report.methodology.sources.find(x => x.evidence_id === evidenceId);
      if (!m) return "";
      if (m.description) return m.description;
      return [
        m.sample_size !== null ? `${m.sample_size} ${m.evidence_type === "survey" ? "responses" : "mentions"}` : null,
        m.publishers.length ? m.publishers.join(", ") : null,
        m.countries.length ? m.countries.join(", ") : null,
        m.date_range ? `${m.date_range.from} – ${m.date_range.to}` : null,
      ].filter(Boolean).join(" · ");
    };
    const included = report.sources_included.map(src => {
      const meta = metaFor(src.evidence_id);
      return `✓ ${src.label}${meta ? `\n     ${meta}` : ""}`;
    });
    const excluded = report.sources_excluded.map(src => `✕ ${src.label}, ${src.reason}`);
    s.addText(
      `${report.sources_included.length} of ${report.sources_included.length + report.sources_excluded.length} approved sources included · ${report.evidence_appendix.length} Key Findings in the full evidence pool`,
      { x: 0.5, y: 1.4, w: 12, fontSize: 13, color: NAVY, bold: true, breakLine: true }
    );
    s.addText([...included, ...excluded].join("\n"), { x: 0.5, y: 2.2, w: 12, fontSize: 11, color: GREY, breakLine: true });
  });

  // ── Closing ──
  {
    const s = deck.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: NAVY } });
    s.addText("Fanometrix", { x: 0.5, y: 2.5, w: 12.3, fontSize: 48, color: WHITE, bold: true, align: "center" });
    s.addText("Football Fan Intelligence Platform", { x: 0.5, y: 3.8, w: 12.3, fontSize: 16, color: GOLD, align: "center", charSpacing: 2 });
    s.addText("fanometrix.com", { x: 0.5, y: 5.5, w: 12.3, fontSize: 12, color: WHITE, transparency: 50, align: "center" });
    if (isSimulated) addFullSimulatedStamp(deck, s, 0.6, 0.55, 15);
  }

  await pptx.writeFile({ fileName: `Fanometrix-Full-Research-Report-${projectName.replace(/\s+/g, "-")}.pptx` });
}
