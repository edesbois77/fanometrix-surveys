import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";

type ProjectStats = {
  project_id: string;
  deployment_count: number;
  publisher_count: number;
  country_count: number;
  total_responses: number;
};

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "brand", "agency", "publisher"]);
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
  if (session.role !== "admin") {
    const ids = await visibleResourceIds(session, "research_project");
    if (ids !== null) {
      const allowed = new Set(ids);
      visible = visible.filter(p => allowed.has(p.id));
    }
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
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
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

  // Publisher accounts can only ever target their own organisation —
  // enforced here regardless of what the UI sent.
  if (session.role === "publisher") {
    safe.publisher_org_ids = session.organisationId ? [session.organisationId] : [];
  }

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
