// Back-compat readers for report content shapes that changed after some
// reports were already generated and stored (research_summaries.content is
// schema-free JSONB, so an old row simply doesn't have a field added
// later). Applied wherever a stored SurveyIntelligenceReport or
// InsightReport is read back into a page, so an old approved/published
// report renders and edits exactly like a fresh one instead of crashing on
// a missing array.
//
// Type-only imports from the analyst modules — deliberately never a value
// import, since those modules pull in supabaseAdmin (server-only) at
// module scope and this file is imported directly by client components.
import type { SurveyIntelligenceReport } from "@/lib/intelligence/analysts/analyseSurvey";
import type { InsightReport } from "@/lib/intelligence/analysts/analyseConversation";
import { clampReferences } from "@/lib/intelligence/validate-references";

// Added when Survey Intelligence recommendations gained an evidence trace.
// clampReferences here (not just `?? []`) also covers a report persisted
// before generation-time validation existed — an invalid index already in
// storage gets dropped on read, same as a missing array.
export function normalizeSurveyReport(report: SurveyIntelligenceReport): SurveyIntelligenceReport {
  return {
    ...report,
    recommended_actions: (report.recommended_actions ?? []).map(a => ({
      ...a,
      based_on_findings: clampReferences(a.based_on_findings, report.key_findings.length),
    })),
  };
}

export function normalizeSurveyRow<T extends { content: SurveyIntelligenceReport; edited_content: SurveyIntelligenceReport | null }>(row: T): T {
  return {
    ...row,
    content:        normalizeSurveyReport(row.content),
    edited_content: row.edited_content ? normalizeSurveyReport(row.edited_content) : null,
  };
}

// Added when `fastest_growing_topics` (an unsupported growth claim over a
// point-in-time snapshot) was renamed to `notable_topics`, and when
// Conversation Intelligence recommendations gained an evidence trace.
export function normalizeInsightReport(report: InsightReport): InsightReport {
  const legacy = report as InsightReport & { fastest_growing_topics?: string[] };
  return {
    ...report,
    notable_topics: report.notable_topics ?? legacy.fastest_growing_topics ?? [],
    recommended_actions: (report.recommended_actions ?? []).map(a => ({
      ...a,
      based_on_positive_drivers: clampReferences(a.based_on_positive_drivers, report.positive_drivers.length),
      based_on_key_concerns:     clampReferences(a.based_on_key_concerns, report.key_concerns.length),
    })),
  };
}

export function normalizeInsightRow<T extends { content: InsightReport; edited_content: InsightReport | null }>(row: T): T {
  return {
    ...row,
    content:        normalizeInsightReport(row.content),
    edited_content: row.edited_content ? normalizeInsightReport(row.edited_content) : null,
  };
}
