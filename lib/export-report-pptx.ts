// Client-side PPTX export for the Executive Report — built on the generic
// slide-building foundation in lib/pptx/reportDeck.ts (extracted from
// this exact file) so a future report type composes a deck from those
// primitives instead of copy-pasting this one. Same brand palette and
// narrative order as the on-screen report, so every Fanometrix export
// reads as one system. Every slide below carries the exact same
// colour/geometry values this file always used — this is a refactor onto
// the shared foundation, not a redesign; the output is unchanged.
"use client";

import type { ExecutiveReport } from "@/lib/intelligence/analysts/analyseExecutiveReport";
import {
  createReportDeck, addFullSimulatedStamp, addTitleBandSlide, addNumberedRow, addCheckRow, addBoxRow,
  DEFAULT_REPORT_COLORS,
} from "@/lib/pptx/reportDeck";

const { navy: NAVY, gold: GOLD, white: WHITE, grey: GREY, lightGrey: LGREY } = DEFAULT_REPORT_COLORS;

const SOURCE_LABEL: Record<"survey" | "conversation_search" | "document", string> = {
  survey: "Survey",
  conversation_search: "Conversation Search",
  document: "Document",
};

export async function exportExecutiveReportPptx(projectName: string, report: ExecutiveReport) {
  const isSimulated = report.research_mode === "simulated";
  const deck = await createReportDeck({ isSimulated });
  const { pptx } = deck;

  // ── Slide 1: Cover ──
  {
    const s = deck.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: NAVY } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.2, w: "100%", h: 0.04, fill: { color: GOLD } });
    s.addText("FANOMETRIX", { x: 0.5, y: 0.5, w: 12, fontSize: 11, color: GOLD, bold: true, charSpacing: 4 });
    s.addText("Executive Report", { x: 0.5, y: 0.85, w: 12, fontSize: 10, color: WHITE, transparency: 40 });
    if (isSimulated) {
      // Full stamp, not just the footer band every slide gets — the
      // cover is the first thing anyone sees. Tightened to a slim band
      // clearly above the headline (not just visually, but with an
      // explicit height on both boxes) — the headline previously had no
      // explicit h/valign, which left its vertical anchor to chance for a
      // long, wrapping title and let it render into the stamp above it.
      addFullSimulatedStamp(deck, s, 1.25, 0.4, 13);
    }
    s.addText(report.headline, {
      x: 0.5, y: 2.0, w: 12, h: 1.7, fontSize: 32, color: WHITE, bold: true, breakLine: true, valign: "top",
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

  // ── Slide 3: Executive Summary ──
  addTitleBandSlide(deck, { title: "Executive Summary", bandColor: NAVY }, s => {
    s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.4, w: 0.04, h: 4.5, fill: { color: GOLD } });
    s.addText(report.executive_summary, { x: 0.75, y: 1.4, w: 11.5, fontSize: 16, color: NAVY, breakLine: true, valign: "top" });
  });

  // ── Strategic Themes — one slide per theme, the depth layer beneath the
  // concise Research Answer/Executive Summary above: same evidence, same
  // conclusions, expanded with the reasoning and citations behind them. ──
  report.major_themes.forEach(theme => {
    addTitleBandSlide(deck, { title: theme.theme, bandColor: NAVY }, s => {
      s.addText("STRATEGIC THEME", { x: 0.5, y: 1.3, w: 12, fontSize: 10, color: GOLD, bold: true, charSpacing: 2 });
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.6, w: 0.04, h: 1.8, fill: { color: GOLD } });
      s.addText(theme.synthesis, { x: 0.75, y: 1.6, w: 11.5, h: 1.8, fontSize: 14, color: NAVY, breakLine: true, valign: "top" });

      let y = 3.6;
      const supportingFindings = theme.supporting_findings.map(i => report.key_findings[i]).filter((f): f is typeof report.key_findings[number] => !!f);
      if (supportingFindings.length) {
        s.addText("SUPPORTING EVIDENCE", { x: 0.5, y, w: 12, fontSize: 10, color: GOLD, bold: true, charSpacing: 2 });
        y += 0.35;
        supportingFindings.forEach(f => {
          s.addText(`•  ${f.finding}`, { x: 0.5, y, w: 11.8, fontSize: 11, color: GREY, breakLine: true });
          y += 0.42;
        });
        y += 0.15;
      }

      const related = [
        ...theme.related_opportunities.map(i => report.opportunities[i] && { label: "Opportunity", text: report.opportunities[i], color: "22C55E" }),
        ...theme.related_risks.map(i => report.risks[i] && { label: "Risk", text: report.risks[i], color: "C4633A" }),
        ...theme.related_recommendations.map(i => report.recommendations[i] && { label: "Recommendation", text: report.recommendations[i].action, color: GOLD }),
      ].filter((r): r is { label: string; text: string; color: string } => !!r);
      if (related.length) {
        s.addText("RELATED", { x: 0.5, y, w: 12, fontSize: 10, color: GOLD, bold: true, charSpacing: 2 });
        y += 0.35;
        related.forEach(r => {
          s.addText([{ text: `${r.label} — `, options: { bold: true, color: r.color } }, { text: r.text, options: { color: GREY } }],
            { x: 0.5, y, w: 11.8, fontSize: 11, breakLine: true });
          y += 0.42;
        });
      }
    });
  });

  // ── Key Findings ──
  addTitleBandSlide(deck, { title: "Key Findings", bandColor: NAVY }, s => {
    report.key_findings.forEach((f, i) => {
      addNumberedRow(s, pptx, {
        x: 0.5, y: 1.4 + i * 1.0, number: i + 1, text: f.finding,
        circleColor: GOLD, numberColor: NAVY, textColor: NAVY,
        tag: f.supporting_sources.map(src => SOURCE_LABEL[src]).join(" · "), tagColor: GREY,
      });
    });
  });

  // ── Areas of Agreement ──
  if (report.areas_of_agreement.length) {
    addTitleBandSlide(deck, { title: "Areas of Agreement", bandColor: "22C55E" }, s => {
      report.areas_of_agreement.forEach((a, i) => {
        addCheckRow(s, pptx, { x: 0.5, y: 1.4 + i * 1.0, text: a.finding, circleColor: "22C55E", checkColor: WHITE, textColor: NAVY });
      });
    });
  }

  // ── Areas of Difference ──
  if (report.areas_of_difference.length) {
    addTitleBandSlide(deck, { title: "Areas of Difference", bandColor: "5B6CFA" }, s => {
      report.areas_of_difference.forEach((d, i) => {
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
  addTitleBandSlide(deck, { title: "Opportunities", bandColor: "22C55E" }, s => {
    report.opportunities.forEach((o, i) => {
      addNumberedRow(s, pptx, {
        x: 0.5, y: 1.4 + i * 1.0, number: i + 1, text: o, textWidth: 11.5,
        circleColor: "22C55E", numberColor: WHITE, textColor: NAVY,
      });
    });
  });

  // ── Risks ──
  addTitleBandSlide(deck, { title: "Risks", bandColor: "EF4444" }, s => {
    report.risks.forEach((r, i) => {
      addNumberedRow(s, pptx, {
        x: 0.5, y: 1.4 + i * 1.0, number: i + 1, text: r, textWidth: 11.5,
        circleColor: "EF4444", numberColor: WHITE, textColor: NAVY,
      });
    });
  });

  // ── Recommendations ──
  addTitleBandSlide(deck, { title: "Recommendations", bandColor: GOLD, titleColor: NAVY }, s => {
    report.recommendations.forEach((r, i) => {
      const y = 1.4 + i * 1.4;
      addBoxRow(s, pptx, {
        x: 0.5, y, w: 11.5, h: 1.25, fill: LGREY,
        textX: 0.7, textW: 11,
        title: r.action, titleFontSize: 13, titleColor: NAVY, titleY: y + 0.1,
        body: r.rationale, bodyFontSize: 11, bodyColor: GREY, bodyY: y + 0.55,
        ...(r.based_on_findings.length ? {
          tag: `Based on: ${r.based_on_findings.map(idx => `Finding ${idx + 1}`).join(", ")}`,
          tagFontSize: 9, tagColor: GOLD, tagY: y + 0.95,
        } : {}),
      });
    });
  });

  // ── Evidence & Coverage (closing) ── three independent
  // measures, deliberately never blended into one badge or sentence — see
  // EvidenceStrength's doc comment in analyseExecutiveReport.ts.
  addTitleBandSlide(deck, { title: "Evidence & Coverage", bandColor: NAVY }, s => {
    const totalSources = report.evidence_strength.sources_included.length + report.evidence_strength.sources_excluded.length;
    const methodLabel = report.evidence_strength.method_diversity === "mixed_method" ? "Mixed methods" : "Single method";
    const measures = [
      `Evidence Coverage — ${report.evidence_strength.sources_included.length} of ${totalSources} approved sources included`,
      `Method Diversity — ${methodLabel}`,
      `Cross-source Corroboration — ${report.evidence_strength.corroborated_findings} of ${report.evidence_strength.total_findings} findings supported by more than one source`,
    ].join("\n");
    s.addText(measures, { x: 0.5, y: 1.4, w: 12, fontSize: 14, color: NAVY, breakLine: true });
    const included = report.evidence_strength.sources_included.map(src => `✓ ${src.label}`);
    const excluded = report.evidence_strength.sources_excluded.map(src => `✕ ${src.label}, ${src.reason}`);
    s.addText([...included, ...excluded].join("\n"), { x: 0.5, y: 3.4, w: 12, fontSize: 11, color: GREY, breakLine: true });
  });

  // ── Closing ──
  {
    const s = deck.addSlide();
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: { color: NAVY } });
    s.addText("Fanometrix", { x: 0.5, y: 2.5, w: 12.3, fontSize: 48, color: WHITE, bold: true, align: "center" });
    s.addText("Football Fan Intelligence Platform", { x: 0.5, y: 3.8, w: 12.3, fontSize: 16, color: GOLD, align: "center", charSpacing: 2 });
    s.addText("fanometrix.com", { x: 0.5, y: 5.5, w: 12.3, fontSize: 12, color: WHITE, transparency: 50, align: "center" });
    if (isSimulated) {
      addFullSimulatedStamp(deck, s, 0.6, 0.55, 15);
    }
  }

  await pptx.writeFile({ fileName: `Fanometrix-Executive-Report-${projectName.replace(/\s+/g, "-")}.pptx` });
}
