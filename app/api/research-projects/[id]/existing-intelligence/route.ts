// Existing Intelligence for a project — the Overview "Recall" data
// (docs/existing-intelligence.md). Resolves the context (the project's org, the
// understood research question, markets), runs every registered provider through
// the orchestrator, and returns only grounded, attributed findings. Providers
// that genuinely return nothing are omitted; nothing is fabricated.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { gatherExistingIntelligence } from "@/lib/intelligence/existing/registry";
import { registerExistingIntelligenceProviders } from "@/lib/intelligence/existing/providers";
import { analyseKnowledgePosition } from "@/lib/intelligence/analysts/analyseKnowledgePosition";
import { hasUnderstanding, type ProjectUnderstanding } from "@/lib/understanding";

type Row = {
  research_question: string | null;
  understanding: ProjectUnderstanding | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  country_codes: string[] | null;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const { data: project, error } = await supabaseAdmin
    .from("research_projects")
    .select("research_question, understanding, brand_org_id, agency_org_id, country_codes")
    .eq("id", id)
    .single<Row>();
  if (error || !project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const u = project.understanding;
  const researchQuestion = (u?.research_question?.value?.trim()) || project.research_question || "";
  const orgId = project.brand_org_id ?? project.agency_org_id ?? user.organisationId ?? null;
  const markets = (u?.markets?.values?.length ? u.markets.values : project.country_codes) ?? [];

  // No question yet → nothing to recall against.
  if (!researchQuestion) return NextResponse.json({ intelligence: { categories: [], providersConsulted: 0, providersContributed: 0 }, knowledgePosition: null });

  registerExistingIntelligenceProviders();
  try {
    const intelligence = await gatherExistingIntelligence({
      projectId: id, orgId, researchQuestion, understanding: u, markets,
    });

    // The closing synthesis — Confidence + Frontier + Fanometrix's Recommendation,
    // grounded in the understanding + what we could actually evidence.
    let knowledgePosition = null;
    if (u && hasUnderstanding(u)) {
      try { knowledgePosition = await analyseKnowledgePosition({ understanding: u, intelligence }); }
      catch { knowledgePosition = null; }
    }

    return NextResponse.json({ intelligence, knowledgePosition });
  } catch {
    return NextResponse.json({ error: "Couldn't gather existing intelligence." }, { status: 500 });
  }
}
