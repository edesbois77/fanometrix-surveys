// ── Survey Studio Home — shared view model ───────────────────────────────────
// The single shape the adaptive Home renders from, whether it is assembled from
// live read-only endpoints (useStudioHome) or supplied by the preview harness
// (fixtures). Keeping it here lets both producers stay in exact agreement.

export type ProjectCard = {
  id: string;
  name: string;
  status: string;
  totalResponses: number;
  target: number | null;
  completionPct: number | null;
  publisherCount: number;
  countryCount: number;
  lastResponseAt: string | null;
  href: string;         // operational deep-link (the live study workspace)
  discoverHref: string; // editorial destination (Discover → Research)
};

export type FindingCard = {
  id: string;
  projectId: string;
  projectName: string;
  aspect: string | null;
  need: string | null;
  headline: string;
  detail: string | null;
  confidence: string | null;
  evidenceStrength: string | null;
  base: number | null;   // n — responses in the source study, when known
  href: string;          // route into Discover
};

export type ReportItem = {
  id: string;
  projectName: string;
  label: string;         // human report type ("Executive report", …)
  at: string | null;
  href: string;
};

export type ActivityItem = {
  key: string;
  kind: "survey" | "campaign" | "project";
  label: string;
  title: string;
  at: string | null;
  href: string;
};

export type AttentionItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  /** The direct action this item resolves to — a persistent affordance so the
   *  item reads as actionable, not as passive explanatory text. */
  action: string;
};

/** Where meaningful performance sits — one bar per study, flagged live so the
 *  section can relate performance to the live research above it. */
export type PerformanceRow = { name: string; value: number; live: boolean };

export type CtaMode = "create" | "request";

export type StudioHomeData = {
  loading: boolean;
  /** Any genuine presence at all (operational OR intelligence). Drives the
   *  new-organisation lead-in versus the full adaptive Home. */
  hasActivity: boolean;
  ctaMode: CtaMode;
  attention: AttentionItem[];
  liveResearch: ProjectCard[];
  performance: PerformanceRow[];
  intelligence: FindingCard[];
  research: ProjectCard[];
  reports: ReportItem[];
  activity: ActivityItem[];
  /** Non-null only in the preview harness — the state label being demonstrated. */
  preview: string | null;
};

export const REPORT_LABELS: Record<string, string> = {
  executive_report: "Executive report",
  key_findings: "Key findings",
  conclusion: "Conclusion",
  full_research_report: "Full research report",
  editorial_article: "Editorial",
  research_summary: "Research summary",
  aspect_synthesis: "Analysis",
  research_plan: "Research plan",
};
