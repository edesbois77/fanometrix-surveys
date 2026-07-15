// The shared contract for exact, frozen quantitative data a Research
// Source's own analyst chooses to expose for downstream reuse — charts,
// exact-statistic citation — deliberately separate from that analyst's own
// narrative report shape (SurveyIntelligenceReport, InsightReport, and
// whatever a future source type produces). A downstream consumer
// (analyseEditorialArticle.ts today, anything else later) reads this ONE
// shape and never needs bespoke knowledge of how a survey's responses are
// tallied versus how a conversation search's mentions are — that stays
// private to each analyst.
//
// Deliberately small: one block = one metric, measured across one set of
// category labels, in one unit. A richer multi-series/grouped shape isn't
// modelled here on purpose — a consumer that wants a grouped comparison
// (e.g. positive/neutral/negative sentiment by market) composes it from
// several flat blocks that share the same category labels, rather than
// this contract growing a second, more general shape nothing needs yet.
//
// Optional and additive on every report type that has one — a source type
// with no quantitative data (Editorial/Web Research, Uploaded Documents)
// simply omits the field or returns an empty array. That is valid, not a
// gap to fill later.
export type StructuredEvidenceSeriesPoint = {
  label: string;   // a category: a country, an answer option, a market, a topic
  value: number;   // the exact value, never rounded or transformed again downstream
};

export type StructuredEvidenceBlock = {
  /** Stable within its own source only — a consumer needing a globally
   * unique key combines this with source_type/source_id (see
   * analyseEditorialArticle.ts's buildChartMenu). */
  id: string;
  /** Widen this union only when a source type actually starts producing
   * structured evidence — never added speculatively ahead of that. */
  source_type: "survey" | "conversation_search";
  source_id: string;
  source_label: string;
  title: string;
  subtitle?: string;
  unit: "percent" | "count";
  /** A narrower scope this block is measured within (a single market or
   * country), when the metric isn't already at its broadest measured
   * level. Absent for an overall metric or one already broken out by the
   * dimension itself (e.g. "by market"). */
  scope?: string;
  /** The analyst's own opinion of how this specific metric reads best —
   * it knows the semantics of its own data (a single question's full
   * distribution reads as a pie; a breakdown across many categories reads
   * as a bar), a downstream consumer isn't expected to re-derive that from
   * shape alone. Optional: a consumer may fall back to a sensible default. */
  suggested_chart_type?: "bar" | "pie" | "line";
  series: StructuredEvidenceSeriesPoint[];
};

/** Plain-text serialisation for a prompt — every consumer wants the same
 * rendering of this contract, so it lives with the type rather than being
 * re-implemented per consumer. */
export function describeStructuredEvidence(blocks: StructuredEvidenceBlock[]): string {
  if (!blocks.length) return "(none)";
  return blocks
    .map(b => {
      const scopeText = b.scope ? ` [${b.scope}]` : "";
      const seriesText = b.series.map(s => `${s.label}: ${s.value}${b.unit === "percent" ? "%" : ""}`).join(", ");
      return `- ${b.title}${scopeText} (${b.source_label}): ${seriesText}`;
    })
    .join("\n");
}
