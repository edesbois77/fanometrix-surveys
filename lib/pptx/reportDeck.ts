// Generic PPTX slide-building foundation for Fanometrix report exports.
// Factored out of lib/export-report-pptx.ts's Executive Report export —
// nine of that report's eleven slides shared the exact same "coloured
// band across the top, white bold title, content below" shape; that
// shape is `addTitleBandSlide` here. A future report type composes decks
// from these primitives instead of hand-copying a whole new pptxgenjs
// file and re-deriving the same band/list/box layouts from scratch (the
// Social Listening Insights export is the second, independent, hardcoded
// copy of this exact pattern that already exists in the codebase, ahead
// of this file — this is what stops there being a third).
//
// Deliberately content-shape-agnostic: no field ever assumes a specific
// report type's data shape. Every colour/geometry value is passed in by
// the caller, nothing here is hardcoded to Fanometrix's navy/gold —
// callers pass those from lib/intelligence/theme.ts.
"use client";

import type PptxGenJSType from "pptxgenjs";

export type ReportColors = {
  navy: string; gold: string; white: string; grey: string; lightGrey: string;
};

// pptxgenjs wants 6-hex-digit strings with no leading '#' — these are the
// exact same Fanometrix brand values as lib/intelligence/theme.ts's
// NAVY/GOLD, just stripped of the '#' pptxgenjs doesn't accept.
export const DEFAULT_REPORT_COLORS: ReportColors = {
  navy: "0B1929", gold: "D7B87A", white: "FFFFFF", grey: "6B7280", lightGrey: "F3F4F6",
};

export type ReportDeck = {
  pptx: PptxGenJSType;
  colors: ReportColors;
  /** Every slide in the deck must be created through this, never
   * `pptx.addSlide()` directly — the simulated-data watermark is stamped
   * here once, so no slide anywhere in a deck can accidentally skip it. */
  addSlide: () => ReturnType<PptxGenJSType["addSlide"]>;
};

export async function createReportDeck(opts: {
  isSimulated?: boolean;
  colors?: ReportColors;
  /** "LAYOUT_WIDE" (13.33x7.5in) matches every Fanometrix export shipped
   * so far — override only if a future report genuinely needs a
   * different canvas. */
  layout?: { name: string; width: number; height: number };
} = {}): Promise<ReportDeck> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  const layout = opts.layout ?? { name: "LAYOUT_WIDE", width: 13.33, height: 7.5 };
  pptx.layout = layout.name;
  pptx.defineLayout({ name: layout.name, width: layout.width, height: layout.height });

  const colors = opts.colors ?? DEFAULT_REPORT_COLORS;
  const isSimulated = !!opts.isSimulated;

  const addSlide = () => {
    const s = pptx.addSlide();
    if (isSimulated) {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.15, w: "100%", h: 0.35, fill: { color: colors.gold } });
      s.addText("SIMULATED RESEARCH, SYNTHETIC DATA ONLY", {
        x: 0, y: 7.15, w: "100%", h: 0.35, fontSize: 9, color: colors.navy, bold: true, align: "center", charSpacing: 2,
      });
    }
    return s;
  };

  return { pptx, colors, addSlide };
}

/** Stamps the full-slide "SIMULATED RESEARCH" banner used on the cover
 * and closing slides — heavier than the footer watermark `addSlide`
 * already applies, since those two slides are the first/last thing
 * anyone sees. */
export function addFullSimulatedStamp(deck: ReportDeck, slide: ReturnType<PptxGenJSType["addSlide"]>, y: number, h: number, fontSize: number) {
  slide.addShape(deck.pptx.ShapeType.rect, { x: 0, y, w: "100%", h, fill: { color: deck.colors.gold } });
  slide.addText("SIMULATED RESEARCH, SYNTHETIC DATA ONLY", {
    x: 0, y, w: "100%", h, fontSize, color: deck.colors.navy, bold: true, align: "center", charSpacing: 3,
  });
}

/** The report's single most-repeated slide shape: a coloured band across
 * the top carrying a white bold title, with the rest of the slide handed
 * to the caller via `build`. Covers text slides, numbered-list slides,
 * checkmark-list slides and box-list slides alike — the content itself
 * is never this function's concern. */
export function addTitleBandSlide(
  deck: ReportDeck,
  opts: { title: string; bandColor: string; titleColor?: string; bandHeight?: number },
  build: (slide: ReturnType<PptxGenJSType["addSlide"]>) => void
) {
  const slide = deck.addSlide();
  const bandHeight = opts.bandHeight ?? 1.1;
  slide.addShape(deck.pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: bandHeight, fill: { color: opts.bandColor } });
  slide.addText(opts.title, { x: 0.5, y: 0.3, w: 12, fontSize: 18, color: opts.titleColor ?? deck.colors.white, bold: true });
  build(slide);
  return slide;
}

/** A numbered circle + single line of text, one row — the "Key Findings"/
 * "Opportunities"/"Risks" row shape, differing only in circle/text
 * colour and an optional right-aligned tag. */
export function addNumberedRow(
  slide: ReturnType<PptxGenJSType["addSlide"]>, pptx: PptxGenJSType,
  opts: { x: number; y: number; number: number; text: string; circleColor: string; numberColor: string; textColor: string; tag?: string; tagColor?: string; textWidth?: number }
) {
  slide.addShape(pptx.ShapeType.rect, { x: opts.x, y: opts.y + 0.1, w: 0.3, h: 0.3, fill: { color: opts.circleColor } });
  slide.addText(String(opts.number), { x: opts.x, y: opts.y + 0.05, w: 0.3, h: 0.35, fontSize: 11, color: opts.numberColor, bold: true, align: "center" });
  slide.addText(opts.text, { x: opts.x + 0.5, y: opts.y, w: opts.textWidth ?? 8.5, fontSize: 13, color: opts.textColor, breakLine: true });
  if (opts.tag) {
    slide.addText(opts.tag, { x: opts.x + 9.2, y: opts.y, w: 2.8, fontSize: 9, color: opts.tagColor ?? opts.textColor, align: "right" });
  }
}

/** A checkmark + single line of text, one row — "Areas of Agreement"'s
 * shape. */
export function addCheckRow(
  slide: ReturnType<PptxGenJSType["addSlide"]>, pptx: PptxGenJSType,
  opts: { x: number; y: number; text: string; circleColor: string; checkColor: string; textColor: string }
) {
  slide.addShape(pptx.ShapeType.rect, { x: opts.x, y: opts.y + 0.1, w: 0.3, h: 0.3, fill: { color: opts.circleColor } });
  slide.addText("✓", { x: opts.x, y: opts.y + 0.02, w: 0.3, h: 0.35, fontSize: 13, color: opts.checkColor, bold: true, align: "center" });
  slide.addText(opts.text, { x: opts.x + 0.5, y: opts.y, w: 11.5, fontSize: 13, color: opts.textColor, breakLine: true });
}

/** A filled rounded box with a bold first line, a lighter second line and
 * an optional third — "Areas of Difference"/"Recommendations"' shape.
 * Every offset/size is an explicit parameter rather than assumed: those
 * two slides already use slightly different font sizes and line
 * spacing, so this stays a positioning utility, not a fixed template. */
export function addBoxRow(
  slide: ReturnType<PptxGenJSType["addSlide"]>, pptx: PptxGenJSType,
  opts: {
    x: number; y: number; w: number; h: number; fill: string; line?: { color: string; width: number };
    textX: number; textW: number;
    title: string; titleFontSize: number; titleColor: string; titleY: number;
    body: string; bodyFontSize: number; bodyColor: string; bodyY: number;
    tag?: string; tagFontSize?: number; tagColor?: string; tagY?: number;
  }
) {
  slide.addShape(pptx.ShapeType.rect, { x: opts.x, y: opts.y, w: opts.w, h: opts.h, fill: { color: opts.fill }, ...(opts.line ? { line: opts.line } : {}) });
  slide.addText(opts.title, { x: opts.textX, y: opts.titleY, w: opts.textW, fontSize: opts.titleFontSize, color: opts.titleColor, bold: true, breakLine: true });
  slide.addText(opts.body, { x: opts.textX, y: opts.bodyY, w: opts.textW, fontSize: opts.bodyFontSize, color: opts.bodyColor, breakLine: true });
  if (opts.tag && opts.tagY !== undefined) {
    slide.addText(opts.tag, { x: opts.textX, y: opts.tagY, w: opts.textW, fontSize: opts.tagFontSize ?? 9, color: opts.tagColor ?? opts.titleColor, bold: true });
  }
}
