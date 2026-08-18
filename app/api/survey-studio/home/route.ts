// ── Survey Studio Home — intelligence feed (read-only) ───────────────────────
// Additive, read-only aggregation for the adaptive Home's intelligence-led
// sections that the per-project APIs cannot supply cheaply across projects:
//
//   • Latest Intelligence — approved, top-rank ANALYSIS findings across the
//     Current Organisation's visible research projects (the "published"
//     intelligence a stakeholder is entitled to read).
//   • Recent Reports       — published research_summaries (executive report,
//     key findings, conclusion, …) for those same projects.
//
// ORGANISATIONS INHERITANCE (Product Build Integration Guide):
//   • The Current Organisation is the platform-owned session context — this
//     route never reads an org id from the client, never forks org state.
//   • Resource visibility uses the SAME governed mechanism as
//     /api/research-projects (visibleResourceIds → authoritative Study set /
//     operator entitlement). No new access model, no permission union.
//
// It changes NO data and mutates nothing. Where a section has no admissible
// data it simply returns an empty list, so the Home omits the section entirely.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";

export type HomeFinding = {
  id: string;
  projectId: string;
  projectName: string;
  aspect: string | null;
  need: string | null;
  headline: string;
  detail: string | null;
  confidence: string | null;
  evidenceStrength: string | null;
  at: string | null;
};

export type HomeReport = {
  id: string;
  projectId: string;
  projectName: string;
  outputType: string;
  at: string | null;
};

export type HomeIntelligence = { intelligence: HomeFinding[]; reports: HomeReport[] };

const EMPTY: HomeIntelligence = { intelligence: [], reports: [] };

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "brand", "agency", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  // Governed resource scope. null = unrestricted (operator entitlement); an
  // array = exactly the research projects this Current Organisation may read.
  const visible = await visibleResourceIds(session, "research_project");

  let projQuery = supabaseAdmin
    .from("research_projects")
    .select("id, project_name")
    .eq("research_mode", "real")
    .is("deleted_at", null);
  if (visible !== null) {
    if (visible.length === 0) return NextResponse.json(EMPTY);
    projQuery = projQuery.in("id", visible);
  }

  const { data: projects, error: projErr } = await projQuery;
  if (projErr) return NextResponse.json(EMPTY);

  const ids = (projects ?? []).map((p) => p.id as string);
  if (ids.length === 0) return NextResponse.json(EMPTY);
  const nameById = new Map<string, string>(
    (projects ?? []).map((p) => [p.id as string, (p.project_name as string) || "Untitled research"]),
  );

  const [{ data: findingRows }, { data: reportRows }] = await Promise.all([
    supabaseAdmin
      .from("findings")
      .select("id, research_project_id, need_text, aspect, statement, reading, confidence_level, evidence_strength, reviewed_at, published_at")
      .in("research_project_id", ids)
      .eq("finding_layer", "analysis")
      .eq("status", "approved")
      .eq("rank", 1)
      .limit(60),
    supabaseAdmin
      .from("research_summaries")
      .select("id, source_id, output_type, published_at")
      .eq("source_type", "research_project")
      .eq("status", "published")
      .in("source_id", ids)
      .order("published_at", { ascending: false })
      .limit(8),
  ]);

  const intelligence: HomeFinding[] = (findingRows ?? [])
    .map((r) => {
      const reading = (r.reading as string | null)?.trim() || "";
      const statement = (r.statement as string | null)?.trim() || "";
      // The reading is the plain-language headline; the statement is the precise
      // claim. Lead with whichever we have, keep the other as supporting detail.
      const headline = reading || statement;
      const detail = reading && statement && reading !== statement ? statement : null;
      return {
        id: r.id as string,
        projectId: r.research_project_id as string,
        projectName: nameById.get(r.research_project_id as string) ?? "Research",
        aspect: (r.aspect as string | null) || null,
        need: (r.need_text as string | null) || null,
        headline,
        detail,
        confidence: (r.confidence_level as string | null) || null,
        evidenceStrength: (r.evidence_strength as string | null) || null,
        at: (r.published_at as string | null) || (r.reviewed_at as string | null) || null,
      };
    })
    .filter((f) => f.headline.length > 0)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 12);

  const reports: HomeReport[] = (reportRows ?? []).map((r) => ({
    id: r.id as string,
    projectId: r.source_id as string,
    projectName: nameById.get(r.source_id as string) ?? "Research",
    outputType: (r.output_type as string) || "research_summary",
    at: (r.published_at as string | null) || null,
  }));

  return NextResponse.json({ intelligence, reports } satisfies HomeIntelligence);
}
