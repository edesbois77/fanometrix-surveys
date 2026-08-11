import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { data, error } = await supabaseAdmin
    .from("social_searches")
    .select("*, social_keywords(id, keyword, keyword_type)")
    // Real searches only — simulated (Product Walkthrough) searches live in the
    // /product-walkthrough area and must never appear in the platform-wide list.
    .eq("is_simulated", false)
    // ORG-006 WP-02 — scope the list to the Current Organisation (WP-01). Legacy
    // rows with organisation_id = NULL are excluded (NULL is not a shared scope).
    .eq("organisation_id", session.organisationId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const body = await req.json();
  const { keywords, ...searchFields } = body;

  // ORG-006 WP-02 — stamp the operating Organisation (the creator's Current
  // Organisation, WP-01) on every newly created ordinary real search. `is_simulated`
  // and `organisation_id` are set here from authoritative context, never trusted
  // from the request body.
  const { is_simulated: _ignoredSimulated, organisation_id: _ignoredOrg, ...cleanFields } = searchFields as Record<string, unknown>;
  void _ignoredSimulated; void _ignoredOrg;
  const { data: search, error } = await supabaseAdmin
    .from("social_searches")
    .insert({ ...cleanFields, created_by: session.workEmail, organisation_id: session.organisationId })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert keywords if provided
  if (keywords?.length && search) {
    await supabaseAdmin.from("social_keywords").insert(
      keywords.map((k: { keyword: string; keyword_type: string }) => ({
        search_id:    search.id,
        keyword:      k.keyword,
        keyword_type: k.keyword_type ?? "Topic",
      }))
    );
  }

  return NextResponse.json({ data: search }, { status: 201 });
}
