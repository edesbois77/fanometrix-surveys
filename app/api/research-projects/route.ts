import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

type ProjectStats = {
  project_id: string;
  deployment_count: number;
  publisher_count: number;
  country_count: number;
  total_responses: number;
};

/** Brand/agency users only ever see projects tied to their own audience. */
async function scopeToUser<T extends { project_id: string; brand_name: string | null }>(
  projects: T[],
  role: "brand" | "agency",
  userId: string
): Promise<T[]> {
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("associated_brand, associated_projects")
    .eq("id", userId)
    .single();

  const assocProjects = ((user?.associated_projects ?? []) as string[]).map(p => p.toLowerCase());
  const assocBrand = ((user?.associated_brand ?? "") as string).toLowerCase();

  return projects.filter(p => {
    const idMatch = assocProjects.includes(p.project_id.toLowerCase());
    if (role === "brand") {
      const brandMatch = !!assocBrand && !!p.brand_name && p.brand_name.toLowerCase() === assocBrand;
      return idMatch || brandMatch;
    }
    return idMatch; // agency: spans multiple brands, so only explicit project assignment counts
  });
}

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req, ["admin", "brand", "agency"]);
  } catch (err) {
    return err as Response;
  }

  const [{ data: projects, error }, { data: stats }] = await Promise.all([
    supabaseAdmin
      .from("research_projects")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("vw_research_project_stats").select("*"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statsMap: Record<string, ProjectStats> = {};
  for (const s of (stats ?? []) as ProjectStats[]) statsMap[s.project_id] = s;

  let visible = projects ?? [];
  if (session.role === "brand" || session.role === "agency") {
    visible = await scopeToUser(visible, session.role, session.sub);
  }

  const data = visible.map(p => {
    const s = statsMap[p.project_id];
    const totalResponses = s?.total_responses ?? 0;
    const target = p.target_responses ?? null;
    const completionPct = target && target > 0 ? Math.round((totalResponses / target) * 100) : null;
    return {
      ...p,
      deployment_count: s?.deployment_count ?? 0,
      publisher_count: s?.publisher_count ?? 0,
      country_count: s?.country_count ?? 0,
      total_responses: totalResponses,
      completion_pct: completionPct,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();

  // Strip computed/soft-delete fields that should never be set on create
  const {
    deleted_at: _da, deleted_by: _db, delete_reason: _dr,
    deployment_count: _dc, publisher_count: _pc, country_count: _cc,
    total_responses: _tr, completion_pct: _cp,
    ...safe
  } = body;

  const { data, error } = await supabaseAdmin
    .from("research_projects")
    .insert([{ ...safe, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A research project with this Project ID already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
