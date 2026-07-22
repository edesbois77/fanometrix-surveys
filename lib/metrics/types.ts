// Canonical metric-definition model for the whole platform.
//
// A MetricDefinition is the single source of truth for what a metric MEANS —
// its plain-English definition, how it is calculated, why anyone should care,
// and how it is displayed. Every surface that shows a metric (dashboards,
// reports, Conversation Intelligence, the Research Library, future products)
// should render its label/tooltip from this registry rather than re-describing
// the metric inline. One definition, everywhere.
//
// See lib/metrics/registry.ts for the definitions and docs/metrics-timing.md
// for the timing metrics' underlying event model.

/** Product area a metric belongs to. Lets each surface pull "its" metrics and
 *  keeps the registry navigable as it grows across the platform. */
export type MetricDomain =
  | "surveys"
  | "conversation-intelligence"
  | "research-library"
  | "dashboards"
  | "reports";

/** How a raw metric value should be rendered. The registry describes the shape;
 *  `formatMetricValue` turns a raw number into the display string. */
export type MetricFormat =
  | "integer"            // 1,234
  | "percent"            // 12% / 0.3% (already-scaled percentage points)
  | "duration_seconds"   // 24s
  | "plusminus_percent"  // ±5%
  | "text";              // rendered as-is (e.g. a band label, "95%")

export interface MetricDefinition {
  /** Canonical stable slug, e.g. "q1_answer_rate". Never change once shipped. */
  id: string;
  /** Display name shown on the card / in reports. */
  name: string;
  /** Plain-English description of what the metric represents. */
  definition: string;
  /** How it is calculated. Omit for directly-counted/observed metrics. */
  formula?: string;
  /** What insight it provides and why a user should care. */
  whyItMatters: string;
  /** Display format for the raw value. */
  format: MetricFormat;
  /** Product area (used for grouping / retrieval). */
  domain: MetricDomain;
  /** Underlying data source, e.g. "survey_events (SURVEY_START)". Optional. */
  dataSource?: string;
  /** ISO date the definition was last reviewed for correctness. For governance. */
  lastVerified?: string;
}

/** Turn a raw value into its display string per the metric's format. Surfaces
 *  with their own conditional display (—, legacy states, samples) may format at
 *  the call site instead; this is the canonical default. */
export function formatMetricValue(
  value: number | string | null | undefined,
  format: MetricFormat,
): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "integer":
      return typeof value === "number" ? value.toLocaleString() : String(value);
    case "percent":
      return typeof value === "number" ? `${value}%` : String(value);
    case "duration_seconds":
      return typeof value === "number" ? `${value}s` : String(value);
    case "plusminus_percent":
      return typeof value === "number" ? `±${value}%` : String(value);
    case "text":
    default:
      return String(value);
  }
}
