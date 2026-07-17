// ─────────────────────────────────────────────────────────────────────────────
// Fanometrix Workspace UI — the shared visual foundation (UI v2, Phase 1)
// ─────────────────────────────────────────────────────────────────────────────
//
// One import surface for every Research Project area. The information
// architecture is fixed; this module is purely presentational — the premium
// shell furniture (page header, surfaces, badges, states) that Overview,
// Research, Execution, Dashboard, Analysis, Reports and Conclusions all inherit
// so they read as one product.
//
//   import { WorkspaceHeader, PageContainer, Card, StatusBadge } from "@/app/components/workspace-ui";
//
// See ./tokens.ts for the design tokens (colour, spacing, type, radius, shadow)
// and /creative-lab/foundation for the living style guide.

// ── Phase 1 — foundation ──────────────────────────────────────────────────────
export * from "./tokens";
export * from "./Badges";
export * from "./Surfaces";
export * from "./WorkspaceHeader";
export * from "./SubNav";
export * from "./States";
export * from "./Actions";

// ── Phase 2 — intelligence components ─────────────────────────────────────────
export * from "./icons";
export * from "./Evidence";     // SourceCard · EvidenceCard · EvidenceDrawer
export * from "./Insight";      // InsightPanel · AIRecommendation · ThemeCard · SentimentBar
export * from "./Metrics";      // MetricTile
export * from "./Progress";     // ProgressBar · ProgressSteps · GenerationProgress
export * from "./Timeline";     // Timeline · ActivityFeed
export * from "./Charts";       // ChartContainer · ChartLegend · Sparkline
export * from "./Filters";      // FilterBar · FilterSearch · FilterSelect · SegmentedControl · FilterChip
