// Canonical metric-definition system. Import from "@/lib/metrics".
export type { MetricDefinition, MetricDomain, MetricFormat } from "./types";
export { formatMetricValue } from "./types";
export { METRIC_REGISTRY, getMetric, getMetricsByDomain } from "./registry";
