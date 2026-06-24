// ── Insights ──────────────────────────────────────────────────────────────────

export type InsightContentType =
  | "report"
  | "market_analysis"
  | "survey_results"
  | "social_intelligence"
  | "cheat_sheet"
  | "dashboard"
  | "download";

export type InsightStatus = "draft" | "published" | "archived";
export type InsightVisibility = "public" | "admin_only" | "restricted";

export type InsightBlock =
  // ── Report structure ──────────────────────────────────────────────────────
  | { type: "hero"; headline: string; subheadline?: string; label?: string }
  | { type: "exec_summary"; headline?: string; narrative: string; points?: string[] }
  | { type: "chapter_break"; number: string; label: string; description?: string }
  // ── Data & insight ─────────────────────────────────────────────────────────
  | { type: "stat"; value: string; label: string; context?: string; source?: string }
  | { type: "stat_row"; stats: Array<{ value: string; label: string; context?: string }> }
  | { type: "insight_section"; chapter?: string; headline: string; narrative: string; stat?: string; stat_label?: string; implication?: string; recommendation?: string }
  | { type: "pull_quote"; quote: string; attribution?: string }
  | { type: "findings_list"; headline?: string; items: string[]; style?: "numbered" | "check" | "arrow" }
  | { type: "comparison_table"; headline?: string; headers: string[]; rows: Array<{ label: string; values: string[] }> }
  // ── Survey data visualisation ─────────────────────────────────────────────
  | { type: "survey_chart"; question: string; source?: string; items: Array<{ label: string; value: number; highlight?: boolean }> }
  // ── Visual pyramid framework ──────────────────────────────────────────────
  | { type: "pyramid"; title: string; subtitle?: string; levels: Array<{ number: number; label: string; sublabel?: string; description?: string }> }
  // ── Market deep-dive ───────────────────────────────────────────────────────
  | { type: "market_profile"; market: string; headline: string; stat?: string; stat_label?: string; narrative: string; signals?: Array<{ label: string; value?: string }>; findings?: string[]; opportunity?: string; recommendation?: string }
  // ── Action & framing ──────────────────────────────────────────────────────
  | { type: "recommendation"; number?: number; headline: string; body: string }
  | { type: "methodology"; headline?: string; body: string }
  | { type: "download_cta"; headline?: string; description?: string; primary_label?: string; primary_url?: string; secondary_label?: string; secondary_url?: string }
  // ── Legacy / basic ─────────────────────────────────────────────────────────
  | { type: "heading"; content: string }
  | { type: "subheading"; content: string }
  | { type: "paragraph"; content: string }
  | { type: "quote"; content: string }
  | { type: "divider" }
  | { type: "image"; url: string; alt?: string };

export type Insight = {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  content_type: InsightContentType;
  status: InsightStatus;
  published_at: string | null;
  summary: string | null;
  content_blocks: InsightBlock[];
  download_url: string | null;
  featured_image_url: string | null;
  tags: string[];
  visibility: InsightVisibility;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Users (extended with audience association fields) ────────────────────────

export type FullUser = {
  id: string;
  username: string;
  role: "admin" | "brand" | "agency" | "publisher";
  organisation_name: string | null;
  associated_agency: string | null;
  associated_brand: string | null;
  associated_publisher: string | null;
  associated_projects: string[];
  associated_markets: string[];
  allowed_campaign_ids: string[];
  allowed_publisher_ids: string[];
  is_active: boolean;
  force_password_change: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

export type SurveyResponse = {
  id: string;
  campaign_id: string;
  survey_id: string | null;
  question_set_id: string | null;
  publisher: string | null;
  placement: string | null;
  club: string | null;
  competition: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
  country: string | null;
  fan_segment: string | null;
  device: string | null;
  browser: string | null;
  response_duration_seconds: number | null;
  created_at: string;
};
