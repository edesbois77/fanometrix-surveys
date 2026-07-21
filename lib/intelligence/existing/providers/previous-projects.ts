// Previous Projects provider (Project Intelligence) — surfaces the PUBLISHED
// conclusions of the organisation's other research projects that bear on this
// project's research question (docs/existing-intelligence.md). A published
// conclusion is a project's synthesised answer, so it is strong prior evidence.
// Cited to the project; returns [] when there is no relevant prior work.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { classifyAspects } from "@/lib/intelligence/aspect-classify";
import type { IntelligenceProvider, IntelligenceContext, IntelligenceFinding } from "@/lib/intelligence/existing/types";

const MAX_PROJECTS = 25;
const MAX_FINDINGS = 5;
const RELEVANCE_MIN = 0.45;

type Candidate = { text: string; detail: string | null; projectId: string; projectName: string };

export const previousProjectsProvider: IntelligenceProvider = {
  id: "previous_projects",
  name: "Previous Research Projects",
  category: "project",
  isAvailable: () => true,

  async retrieve(ctx: IntelligenceContext): Promise<IntelligenceFinding[]> {
    if (!ctx.orgId || !ctx.researchQuestion?.trim()) return [];

    // The org's OTHER projects (brand- or agency-owned), excluding this one.
    const { data: projects } = await supabaseAdmin
      .from("research_projects")
      .select("id, project_name")
      .or(`brand_org_id.eq.${ctx.orgId},agency_org_id.eq.${ctx.orgId}`)
      .neq("id", ctx.projectId)
      .is("deleted_at", null)
      .limit(MAX_PROJECTS);
    if (!projects?.length) return [];

    const nameById = new Map<string, string>((projects as { id: string; project_name: string | null }[]).map(p => [p.id, p.project_name || "Untitled project"]));

    // Their published conclusions.
    const { data: summaries } = await supabaseAdmin
      .from("research_summaries")
      .select("source_id, content, edited_content")
      .eq("source_type", "research_project")
      .in("source_id", Array.from(nameById.keys()))
      .eq("output_type", "conclusion")
      .eq("status", "published");
    if (!summaries?.length) return [];

    const candidates: Candidate[] = [];
    for (const row of summaries as { source_id: string; content: unknown; edited_content: unknown }[]) {
      const c = (row.edited_content ?? row.content) as Record<string, unknown> | null;
      const answer = typeof c?.answer === "string" ? c.answer.trim() : "";
      if (!answer) continue;
      candidates.push({
        text: answer,
        detail: typeof c?.rationale === "string" ? c.rationale.trim() : null,
        projectId: row.source_id,
        projectName: nameById.get(row.source_id) ?? "Project",
      });
    }
    if (!candidates.length) return [];

    const judged = await classifyAspects(
      candidates,
      c => ({ text: c.text, unitLabel: "a published conclusion from a prior research project", researchQuestion: ctx.researchQuestion }),
    );

    const kept: IntelligenceFinding[] = [];
    for (const c of candidates) {
      const j = judged.get(c);
      if (!j || (j.relevance ?? 0) < RELEVANCE_MIN || j.research_aspect === "Off-topic") continue;
      kept.push({
        statement: c.text,
        detail: c.detail ?? j.why_this_matters ?? null,
        strength: "strong",   // a published project conclusion is a synthesised answer
        aspect: j.research_aspect ?? null,
        sources: [{ provider: "Previous Research Projects", label: c.projectName, href: `/research-projects/${c.projectId}/overview`, ref: { kind: "research_project", id: c.projectId } }],
      });
    }
    return kept.slice(0, MAX_FINDINGS);
  },
};
