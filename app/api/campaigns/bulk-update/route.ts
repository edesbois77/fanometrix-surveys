// Bulk-edit selected campaigns in one request — set shared fields (brand,
// agency, publisher, response target, creative design, dates) across many
// campaigns at once, instead of opening each one. Admin-only: field-level bulk
// edits (including reassigning publisher/brand) are an admin operation; the
// per-campaign lifecycle bulk actions remain available to publishers.
//
// Deliberately excludes campaign_id / campaign_name (the embed slug is set once
// at creation and the ad server routes on it) and status (handled by the
// lifecycle bulk actions). Only the whitelisted, slug-neutral fields can change.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED = new Set([
  "brand_org_id", "agency_org_id", "publisher_org_id",
  "target_responses", "creative_design", "start_date", "end_date",
]);

export async function POST(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const rawPatch = (body?.patch ?? {}) as Record<string, unknown>;
  if (ids.length === 0) return NextResponse.json({ error: "No campaigns selected." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawPatch)) {
    if (!ALLOWED.has(k)) continue;
    if (k === "target_responses") {
      patch[k] = v == null || v === "" ? null : (Number(v) || null);
    } else {
      patch[k] = v === "" ? null : v;
    }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .update(patch)
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { updated: data?.length ?? 0 } });
}
