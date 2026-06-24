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

export type InsightBlock = {
  type: "heading" | "subheading" | "paragraph" | "image" | "quote" | "divider";
  content?: string;
  url?: string;
  alt?: string;
};

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
