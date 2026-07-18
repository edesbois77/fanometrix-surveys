// Shared types for the AI Intelligence Layer — persisted, reviewable
// AI-generated research output (research_summaries), reused across
// Conversation Intelligence, Survey Intelligence, and now Reports
// (Phase 4's Executive Report is the first of what will be a family of
// report output_types). See supabase-migration-068.sql (table),
// supabase-migration-069.sql (source_type widened to include 'survey'),
// and supabase-migration-074.sql (source_type widened to include
// 'research_project'; output_type widened to include 'executive_report')
// for the backing schema.

export type IntelligenceSourceType = "conversation_search" | "survey" | "research_project" | "document_project";
export type IntelligenceOutputType = "research_summary" | "executive_report" | "key_findings" | "conclusion" | "editorial_article" | "full_research_report" | "aspect_synthesis";
export type IntelligenceStatus = "draft" | "edited" | "approved" | "published";

export type ResearchSummaryRow<Content = unknown> = {
  id:             string;
  source_type:    IntelligenceSourceType;
  source_id:      string;
  output_type:    IntelligenceOutputType;
  content:        Content;
  edited_content: Content | null;
  status:         IntelligenceStatus;
  model:          string | null;
  generated_at:   string;
  generated_by:   string | null;
  reviewed_by:    string | null;
  reviewed_at:    string | null;
  published_at:   string | null;
  created_at:     string;
  updated_at:     string;
  /** Set server-side by store.ts's saveDraft() from the source's own
   * provenance — never accepted from a request body. See Platform
   * Contract §03. */
  is_simulated:           boolean;
  evidence_simulation_id: string | null;
};

// Thrown by analyst functions and the OpenAI helper so route handlers can
// map failures back to the right HTTP status without string-matching
// error messages.
export class IntelligenceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "IntelligenceError";
    this.status = status;
  }
}
