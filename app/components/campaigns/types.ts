// Shared Campaign shape — used by both the standalone Campaigns page and
// the Research Project Workspace's embedded Campaigns manager, so the two
// never drift into incompatible ideas of what a "campaign" looks like.
import type { CampaignStatus } from "@/lib/campaign-status";

export type Campaign = {
  id: string;
  campaign_id: string;
  campaign_number: number;
  campaign_name: string;
  campaign_description: string | null;
  start_date: string | null;
  end_date: string | null;
  survey_id: string | null;
  surveys?: { name: string } | null;
  publisher_org_id: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  topic: string | null;
  study_type: string;
  country_code: string | null;
  market: string | null;
  survey_language: string;
  status: string;
  effective_status: CampaignStatus;
  status_reason: string | null;
  is_auto_transition: boolean;
  response_count: number;
  target_responses: number | null;
  archive_after_days: number | null;
  manual_status_override: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  creative_design: string | null;
  research_project_id: string | null;
  tags: string[] | null;
  created_by_admin: boolean;
  // API-only enrichment (resolved inheritance) — never real columns, must
  // never be sent back on save.
  effective_survey_id?: string | null;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
  effective_target_responses?: number | null;
  effective_archive_after_days?: number | null;
  effective_tags?: string[];
  effective_creative_design?: string | null;
  inherited?: {
    survey_id: boolean;
    start_date: boolean;
    end_date: boolean;
    target_responses: boolean;
    archive_after_days: boolean;
    tags: boolean;
    creative_design: boolean;
  } | null;
};
