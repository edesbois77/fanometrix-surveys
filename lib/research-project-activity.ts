// Shared writer for research_project_activity — every route that logs a
// lifecycle event (project create/update, evidence attached, deployments
// generated, survey status changes) calls this instead of inserting
// directly, so the shape of an activity row is defined in exactly one place.
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ActivityEventType =
  | "project_created" | "project_updated" | "research_source_added"
  | "survey_created" | "deployments_generated"
  | "survey_status_changed" | "report_generated"
  | "report_approved" | "report_published" | "knowledge_article_created"
  // Simulation — migration 080's event_type widening. Named to match the
  // rest of the schema (never "demo_"), so a future rename of the
  // product-facing "Demo Projects" label never touches these values.
  | "simulated_project_created" | "simulation_evidence_generated"
  | "simulation_reset" | "simulation_duplicated" | "simulation_deleted"
  // Conclusion — publishing deliberately reuses "knowledge_article_created"
  // above (unused until now) rather than a new "conclusion_published",
  // since that event type was already named for exactly this moment.
  | "conclusion_generated" | "conclusion_approved"
  // Editorial Article — same reasoning as Conclusion above; publishing
  // isn't logged as a distinct event yet since there is no
  // publish-triggered downstream consumer (like Knowledge) for it today.
  | "article_generated" | "article_approved"
  // Full Research Report — same reasoning as Editorial Article above;
  // publishing isn't a distinct event yet either, for the same reason.
  | "full_research_report_generated" | "full_research_report_approved";

export async function logActivity(
  researchProjectId: string,
  eventType: ActivityEventType,
  description: string,
  actor?: string | null
): Promise<void> {
  await supabaseAdmin.from("research_project_activity").insert([{
    research_project_id: researchProjectId,
    event_type: eventType,
    description,
    actor: actor ?? null,
  }]);
}
