// Shared types for the AI Intelligence Layer — persisted, reviewable
// AI-generated research output (research_summaries), reused across
// Conversation Intelligence and Survey Intelligence, with Reports and
// cross-source synthesis to follow. See supabase-migration-068.sql (table)
// and supabase-migration-069.sql (source_type widened to include 'survey')
// for the backing schema.

export type IntelligenceSourceType = "conversation_search" | "survey";
export type IntelligenceOutputType = "research_summary";
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
