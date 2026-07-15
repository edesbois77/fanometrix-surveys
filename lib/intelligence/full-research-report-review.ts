// Deterministic, read-only review aid for the Full Research Report. Its
// ONLY job is to surface passages a human reviewer may want to inspect —
// it never rewrites, corrects, regenerates, blocks or stores anything. The
// generated report is completely unchanged by this file; these are Review
// Prompts, not errors.
//
// The sentence-level detectors themselves (causation, construct-mismatch,
// speculation, invented outcome, unsupported premise, cross-market,
// claim-exceeds-evidence) live in the shared, report-agnostic engine
// lib/intelligence/review-detectors.ts, so they are defined once and reused
// by every report type's own Review Prompt layer (the Editorial Article
// builds on the same engine). This file adds only what is SPECIFIC to the
// Full Research Report: which of its fields to scan, and the structural
// cross-theme-evidence-reuse check that only makes sense here.
//
// Pure and framework-free (no Supabase, no React) so it can run at render
// time in the browser directly from the report object the page already
// holds — no new fetch, no stored field, no migration.
import type {
  FullResearchReport, FullResearchReportThemeDeepDive, FullResearchReportAdditionalInsight,
} from "@/lib/intelligence/analysts/analyseFullResearchReport";
import { scanProse, REVIEW_FLAG_CATEGORY_LABEL } from "@/lib/intelligence/review-detectors";
import type { ReviewFlag, ReviewFlagCategory } from "@/lib/intelligence/review-detectors";

// Re-exported so existing importers of this module (the review page) keep
// working unchanged now that the shared types/labels live in the engine.
export { REVIEW_FLAG_CATEGORY_LABEL };
export type { ReviewFlag, ReviewFlagCategory };

export function flagReviewConcerns(report: FullResearchReport): ReviewFlag[] {
  const out: ReviewFlag[] = [];
  const findingText = (i: number) => report.evidence_appendix[i]?.text ?? "";
  // The whole evidence pool as one lower-cased blob — the reference set for
  // the percentage check (a per-section check would over-flag on statistics
  // legitimately drawn from an Executive Report anchor finding whose text
  // isn't carried on this object).
  const fullPoolBlob = report.evidence_appendix.map(f => f.text).join("  ").toLowerCase();

  // ── Per-theme deep-dives ──
  report.theme_deep_dives.forEach((d: FullResearchReportThemeDeepDive) => {
    const label = d.additional_findings.length
      ? `Cites Key Findings ${d.additional_findings.map(i => i + 1).join(", ")} from the appendix.`
      : "This section cites no wider-pool evidence.";
    scanProse(d.theme, d.deep_dive, label, fullPoolBlob, out);
  });

  // ── Additional insights ──
  report.additional_insights.forEach((a: FullResearchReportAdditionalInsight, i: number) => {
    const label = a.based_on_findings.length
      ? `Cites Key Findings ${a.based_on_findings.map(x => x + 1).join(", ")} from the appendix.`
      : undefined;
    scanProse(`Additional Insight ${i + 1}`, a.insight, label, fullPoolBlob, out);
  });

  // ── Whole-report synthesis prose ──
  scanProse("Executive Summary", report.executive_summary, undefined, fullPoolBlob, out);
  scanProse("Strategic Conclusion", report.strategic_conclusion, undefined, fullPoolBlob, out);

  // ── Structural: cross-theme evidence reuse. A wider-pool finding cited
  // by two or more deep-dives may indicate one theme reaching into
  // another's evidence. Deterministic and precise — this is the check that
  // catches the "Captain section built on Gen Z findings" pattern. ──
  const themesByFinding = new Map<number, string[]>();
  report.theme_deep_dives.forEach(d =>
    d.additional_findings.forEach(fi => themesByFinding.set(fi, [...(themesByFinding.get(fi) ?? []), d.theme]))
  );
  themesByFinding.forEach((themes, fi) => {
    if (themes.length > 1) {
      out.push({
        section: themes.join(" + "),
        category: "cross_transfer",
        passage: findingText(fi),
        why: `This Key Finding is used by ${themes.length} different themes — confirm each use is genuinely within that theme's own scope, not annexed from another.`,
        evidenceNote: `Key Finding ${fi + 1} in the appendix.`,
      });
    }
  });

  return out;
}
